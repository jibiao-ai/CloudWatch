package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/notify"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

// Manager 周期性地对每个平台采集性能指标、同步告警。
// 采集间隔复用平台「高级设置」里的同步间隔（分钟），不引入额外环境变量。
type Manager struct {
	Store    *Store
	Provider *provider.Manager
	Settings *settings.Store

	mu   sync.Mutex
	busy map[string]bool
}

func NewManager(st *Store, pm *provider.Manager, ss *settings.Store) *Manager {
	return &Manager{Store: st, Provider: pm, Settings: ss, busy: map[string]bool{}}
}

func (m *Manager) lock(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.busy[id] {
		return false
	}
	m.busy[id] = true
	return true
}

func (m *Manager) unlock(id string) { m.mu.Lock(); delete(m.busy, id); m.mu.Unlock() }

// Start 启动后台周期任务。
func (m *Manager) Start(ctx context.Context) {
	go func() {
		tk := time.NewTicker(30 * time.Second)
		defer tk.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tk.C:
				m.tick(ctx)
			}
		}
	}()
}

func (m *Manager) tick(ctx context.Context) {
	ids, err := m.Provider.ListPlatformIDs(ctx)
	if err != nil {
		log.Printf("监控扫描失败: %v", err)
		return
	}
	for _, id := range ids {
		p, err := m.Provider.Store.Get(ctx, id)
		if err != nil {
			continue
		}
		iv := time.Duration(p.Advanced.SyncIntervalMin) * time.Minute
		if iv < time.Minute {
			iv = time.Minute
		}
		if time.Since(m.Store.LastTry(ctx, id)) < iv {
			continue
		}
		go func(id string) {
			c, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			if _, err := m.Refresh(c, id); err != nil {
				log.Printf("平台 %s 监控刷新失败: %v", id, err)
			}
		}(id)
	}
}

// Refresh 同一平台串行：连接 → 采集指标 → 同步告警。返回最新快照。
func (m *Manager) Refresh(ctx context.Context, id string) (*Snapshot, error) {
	if _, err := m.Provider.Store.Get(ctx, id); err != nil {
		return nil, err
	}
	if !m.lock(id) {
		return nil, httpx.Err(409, "该平台正在采集中，请稍候")
	}
	defer m.unlock(id)

	t0 := time.Now()
	cn, _, err := m.Provider.Connect(ctx, id)
	if err != nil {
		_ = m.Store.SaveSnapshot(ctx, id, nil, err.Error(), time.Since(t0))
		_ = m.Store.SaveAlertState(ctx, id, err.Error(), 0)
		return m.Store.Snapshot(ctx, id)
	}
	res := Collect(ctx, cn)
	okN := 0
	var firstErr string
	for _, s := range res.Steps {
		if s.OK {
			okN++
		} else if firstErr == "" {
			firstErr = s.Label + "：" + s.Error
		}
	}
	if okN == 0 {
		_ = m.Store.SaveSnapshot(ctx, id, res, "全部监控接口调用失败。"+firstErr, time.Since(t0))
	} else if err := m.Store.SaveSnapshot(ctx, id, res, "", time.Since(t0)); err != nil {
		return nil, err
	}
	m.syncAlerts(ctx, id, cn)
	return m.Store.Snapshot(ctx, id)
}

// SyncAlerts 仅同步告警（告警中心「立即同步」）。
func (m *Manager) SyncAlerts(ctx context.Context, id string) (*AlertStats, error) {
	if _, err := m.Provider.Store.Get(ctx, id); err != nil {
		return nil, err
	}
	if !m.lock(id) {
		return nil, httpx.Err(409, "该平台正在采集中，请稍候")
	}
	defer m.unlock(id)
	cn, _, err := m.Provider.Connect(ctx, id)
	if err != nil {
		_ = m.Store.SaveAlertState(ctx, id, err.Error(), 0)
		return nil, httpx.Err(502, err.Error())
	}
	if e := m.syncAlerts(ctx, id, cn); e != nil {
		return nil, httpx.Err(502, e.Error())
	}
	return m.Store.Stats(ctx, id)
}

func (m *Manager) fetchAlerts(ctx context.Context, cn *provider.Conn, status string) ([]*Parsed, error) {
	u := cn.EMLA() + pathAlerts
	if status == "resolved" {
		u += "?" + url.Values{"status": {"resolved"}}.Encode()
	}
	var raw json.RawMessage
	if err := cn.GetJSON(ctx, u, &raw); err != nil {
		return nil, err
	}
	return ParseAlerts(raw, status)
}

// syncAlerts 拉取告警中 + 已恢复，入库，并对新增的告警发送通知。
func (m *Manager) syncAlerts(ctx context.Context, id string, cn *provider.Conn) error {
	firing, err := m.fetchAlerts(ctx, cn, "firing")
	if err != nil {
		_ = m.Store.SaveAlertState(ctx, id, "拉取告警失败："+err.Error(), 0)
		return fmt.Errorf("拉取告警失败：%w", err)
	}
	resolved, rerr := m.fetchAlerts(ctx, cn, "resolved") // 已恢复拉取失败不影响告警中
	if rerr != nil {
		log.Printf("平台 %s 已恢复告警拉取失败: %v", id, rerr)
		resolved = nil
	}
	fresh, err := m.Store.ApplySync(ctx, id, firing, resolved)
	if err != nil {
		_ = m.Store.SaveAlertState(ctx, id, "告警入库失败："+err.Error(), 0)
		return err
	}
	msg := ""
	if rerr != nil {
		msg = "已恢复告警拉取失败：" + rerr.Error()
	}
	_ = m.Store.SaveAlertState(ctx, id, msg, len(firing))
	if len(fresh) > 0 {
		m.notify(ctx, id, fresh)
	}
	return nil
}

var sevLabel = map[string]string{"critical": "严重", "warning": "警告", "info": "提示"}

// notify 通过「系统配置 → 告警通知渠道」里已启用的渠道发送新增告警；渠道未配置则静默跳过。
func (m *Manager) notify(ctx context.Context, id string, fresh []*Parsed) {
	chs, err := m.Settings.EnabledChannels(ctx)
	if err != nil || len(chs) == 0 {
		return
	}
	name := id
	if p, err := m.Provider.Store.Get(ctx, id); err == nil {
		name = p.Name
	}
	body := fmt.Sprintf("平台：%s\n新增告警 %d 条：\n", name, len(fresh))
	for i, a := range fresh {
		if i >= 20 {
			body += fmt.Sprintf("……其余 %d 条请在告警中心查看\n", len(fresh)-i)
			break
		}
		body += fmt.Sprintf("[%s] %s  %s %s\n    %s\n", sevLabel[a.Severity], a.Name, a.NodeName, a.HostIP, firstNonEmpty(a.Summary, a.Description))
	}
	msg := notify.Message{Title: fmt.Sprintf("【CloudWatch 告警】%s 新增 %d 条告警", name, len(fresh)), Body: body}
	sent := false
	for _, c := range chs {
		nc, cancel := context.WithTimeout(ctx, 20*time.Second)
		_, err := notify.Send(nc, notify.Spec{Type: c.Type, Config: c.Config, Secret: c.Secret}, msg)
		cancel()
		if err != nil {
			log.Printf("告警通知发送失败（渠道 %s）: %v", c.Name, err)
			continue
		}
		sent = true
	}
	if sent {
		m.Store.MarkNotified(ctx, id)
	}
}
