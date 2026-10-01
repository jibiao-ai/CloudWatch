package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
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
		ai := time.Duration(p.Advanced.AlertIntervalSec) * time.Second
		if ai < 10*time.Second {
			ai = 10 * time.Second
		}
		switch {
		case time.Since(m.Store.LastTry(ctx, id)) >= iv: // 性能采集（内含告警同步）
			go func(id string) {
				c, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
				defer cancel()
				if _, err := m.Refresh(c, id); err != nil {
					log.Printf("平台 %s 监控刷新失败: %v", id, err)
				}
			}(id)
		case time.Since(m.Store.LastAlertTry(ctx, id)) >= ai: // 告警独立周期
			go func(id string) {
				c, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
				defer cancel()
				if _, err := m.SyncAlerts(c, id); err != nil {
					log.Printf("平台 %s 告警同步失败: %v", id, err)
				}
			}(id)
		}
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
	_ = fresh
	m.notifyPending(ctx, id)
	return nil
}

var sevLabel = map[string]string{"critical": "严重", "warning": "警告", "info": "提示"}

var cst = time.FixedZone("CST", 8*3600)

func fmtT(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.In(cst).Format("2006-01-02 15:04:05")
}

// alertBlock 单条告警的推送正文（固定模板）。
func alertBlock(platform string, a *Alert, resolved bool) string {
	status, at := "告警中", &a.FiredAt
	if resolved {
		status, at = "已恢复", a.ResolvedAt
		if at == nil {
			at = &a.FiredAt
		}
	}
	obj := a.NodeName
	if a.HostIP != "" {
		if obj != "" {
			obj += " (" + a.HostIP + ")"
		} else {
			obj = a.HostIP
		}
	}
	if obj == "" {
		obj = a.Component
	}
	return fmt.Sprintf("平台：%s\n项目：%s\n状态：%s\n时间：%s\n名称：%s\n对象：%s\n级别：%s\n摘要：%s\n建议：%s\n规则ID：%s",
		platform, a.Project, status, fmtT(at), a.Name, obj, sevLabel[a.Severity], firstNonEmpty(a.Summary, a.Description), a.Solution, a.RuleID)
}

// notifyPending 把未推送的「新增告警」与「告警恢复」通过已启用的告警渠道发送；
// 全部渠道失败时保留待发状态，下个周期自动重试；未配置渠道则不动（启用渠道后会补发仍在告警中的）。
func (m *Manager) notifyPending(ctx context.Context, id string) {
	fire, e1 := m.Store.PendingFiring(ctx, id)
	rec, e2 := m.Store.PendingResolved(ctx, id)
	if e1 != nil || e2 != nil {
		log.Printf("读取待推送告警失败: %v %v", e1, e2)
		return
	}
	if len(fire) == 0 && len(rec) == 0 {
		return
	}
	chs, err := m.Settings.EnabledChannels(ctx)
	if err != nil || len(chs) == 0 {
		return
	}
	name := id
	if p, err := m.Provider.Store.Get(ctx, id); err == nil {
		name = p.Name
	}
	m.push(ctx, chs, name, fire, false)
	m.push(ctx, chs, name, rec, true)
}

func (m *Manager) push(ctx context.Context, chs []settings.Channel, platform string, list []*Alert, resolved bool) {
	const per = 10 // 每条消息最多 10 条告警
	word := "新增告警"
	if resolved {
		word = "告警恢复"
	}
	for i := 0; i < len(list); i += per {
		end := i + per
		if end > len(list) {
			end = len(list)
		}
		batch := list[i:end]
		blocks := make([]string, 0, len(batch))
		for _, a := range batch {
			blocks = append(blocks, alertBlock(platform, a, resolved))
		}
		msg := notify.Message{Title: fmt.Sprintf("【CloudWatch 告警】%s %s %d 条", platform, word, len(batch)), Body: strings.Join(blocks, "\n\n")}
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
			m.Store.MarkNotified(ctx, resolved, batch)
		}
	}
}
