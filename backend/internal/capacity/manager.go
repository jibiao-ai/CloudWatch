package capacity

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

// Manager 周期性采集各平台容量数据。间隔 = 平台「同步间隔」，但不低于 5 分钟（容量接口数据量大）。
type Manager struct {
	Store    *Store
	Provider *provider.Manager

	mu   sync.Mutex
	busy map[string]bool
}

func NewManager(st *Store, pm *provider.Manager) *Manager {
	return &Manager{Store: st, Provider: pm, busy: map[string]bool{}}
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

const minInterval = 5 * time.Minute

func (m *Manager) Start(ctx context.Context) {
	go func() {
		tk := time.NewTicker(30 * time.Second)
		defer tk.Stop()
		for n := 0; ; n++ {
			select {
			case <-ctx.Done():
				return
			case <-tk.C:
				if n%20 == 0 {
					m.Store.Prune(ctx)
				}
				m.tick(ctx)
			}
		}
	}()
}

func (m *Manager) tick(ctx context.Context) {
	ids, err := m.Provider.ListPlatformIDs(ctx)
	if err != nil {
		log.Printf("容量采集扫描失败: %v", err)
		return
	}
	for _, id := range ids {
		p, err := m.Provider.Store.Get(ctx, id)
		if err != nil {
			continue
		}
		iv := time.Duration(p.Advanced.SyncIntervalMin) * time.Minute
		if iv < minInterval {
			iv = minInterval
		}
		if time.Since(m.Store.LastTry(ctx, id)) < iv {
			continue
		}
		go func(id string) {
			c, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()
			if _, err := m.Refresh(c, id); err != nil {
				log.Printf("平台 %s 容量采集失败: %v", id, err)
			}
		}(id)
	}
}

// Refresh 连接平台 → 并发调用第 6 章各接口 → 入库。同一平台串行；返回本次采集的状态。
func (m *Manager) Refresh(ctx context.Context, id string) (*Meta, error) {
	p, err := m.Provider.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if !m.lock(id) {
		return nil, httpx.Err(409, "该平台正在采集容量数据，请稍候")
	}
	defer m.unlock(id)
	t0 := time.Now()
	cn, _, err := m.Provider.Connect(ctx, id)
	if err != nil {
		_ = m.Store.Save(ctx, id, nil, err.Error(), time.Since(t0))
		return m.meta(ctx, p), nil
	}
	res := Collect(ctx, cn)
	okN, firstErr := 0, ""
	for _, s := range res.Steps {
		if s.OK {
			okN++
		} else if firstErr == "" {
			firstErr = s.Label + "：" + s.Error
		}
	}
	if okN == 0 {
		_ = m.Store.Save(ctx, id, nil, "全部容量接口调用失败。"+firstErr, time.Since(t0))
		return m.meta(ctx, p), nil
	}
	msg := ""
	if okN < len(res.Steps) {
		msg = "部分接口失败（失败项保留上次成功的数据）。" + firstErr
	}
	if err := m.Store.Save(ctx, id, res, msg, time.Since(t0)); err != nil {
		return nil, err
	}
	return m.meta(ctx, p), nil
}

func (m *Manager) meta(ctx context.Context, p *provider.Provider) *Meta {
	e, err := m.Store.load(ctx, Platform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP})
	if err != nil {
		return &Meta{Error: err.Error(), Steps: []Step{}}
	}
	mt := e.meta
	return &mt
}

// Platforms 所有已对接平台（按创建顺序），供聚合查询。
func (m *Manager) Platforms(ctx context.Context) ([]Platform, error) {
	pg, err := m.Provider.Store.List(ctx, provider.Query{})
	if err != nil {
		return nil, err
	}
	out := make([]Platform, 0, len(pg.List))
	for _, p := range pg.List {
		out = append(out, Platform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP})
	}
	return out, nil
}
