package analytics

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

// countEvery 资源数量快照最小间隔（趋势图精度 = 小时级）。
const countEvery = 30 * time.Minute

// Sampler 后台采样：只读取配置中心 / 监控中心已落库的快照，不额外调用云平台接口。
//   - 资产快照更新 → 云主机状态跟踪（持续关机 / 运行时长）、资源数量快照、存储池使用率样本
//   - 监控快照更新 → 云主机 CPU / 内存使用率按天累计（平均 / 最大）
type Sampler struct {
	St   *Store
	Cap  *capacity.Store
	Mon  *monitor.Store
	Prov *provider.Manager
	db   *sql.DB

	mu   sync.Mutex
	busy bool
	bfMu sync.Mutex
	bfOn map[string]bool
}

func NewSampler(db *sql.DB, st *Store, cs *capacity.Store, ms *monitor.Store, pm *provider.Manager) *Sampler {
	return &Sampler{St: st, Cap: cs, Mon: ms, Prov: pm, db: db}
}

// Start 启动后台任务：每分钟检查一次是否有新的快照，每天清理一次过期历史。
func (m *Sampler) Start(ctx context.Context) {
	go func() {
		tk := time.NewTicker(time.Minute)
		defer tk.Stop()
		lastPrune := time.Time{}
		for {
			select {
			case <-ctx.Done():
				return
			case <-tk.C:
				m.Tick(ctx)
				if time.Since(lastPrune) > 24*time.Hour {
					m.St.Prune(ctx)
					lastPrune = time.Now()
				}
			}
		}
	}()
}

// Tick 处理所有平台的新快照。
func (m *Sampler) Tick(ctx context.Context) {
	m.mu.Lock()
	if m.busy {
		m.mu.Unlock()
		return
	}
	m.busy = true
	m.mu.Unlock()
	defer func() { m.mu.Lock(); m.busy = false; m.mu.Unlock() }()

	pg, err := m.Prov.Store.List(ctx, provider.Query{})
	if err != nil {
		log.Printf("运营中心采样：读取平台失败: %v", err)
		return
	}
	for _, p := range pg.List {
		if err := m.One(ctx, capacity.Platform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP}); err != nil {
			log.Printf("运营中心采样：平台 %s 失败: %v", p.Name, err)
		}
		m.maybeBackfill(ctx, p.ID, p.Name)
	}
}

// One 处理单个平台。
func (m *Sampler) One(ctx context.Context, p capacity.Platform) error {
	cur := m.St.cursorOf(ctx, p.ID)
	if _, meta, err := m.Cap.Rows(ctx, p, "vms"); err == nil && meta != nil && meta.CollectedAt != nil && meta.CollectedAt.After(cur.cap) {
		if err := m.fromCapacity(ctx, p, *meta.CollectedAt, cur); err != nil {
			return err
		}
	}
	snap, err := m.Mon.Snapshot(ctx, p.ID)
	if err != nil {
		return err
	}
	if snap.CollectedAt != nil && snap.CollectedAt.After(cur.mon) {
		var list []UsageSample
		for _, v := range snap.VMs {
			if v.CPUPercent != nil || v.MemPercent != nil || v.WriteBps != nil {
				u := UsageSample{VM: v.ID, CPU: v.CPUPercent, Mem: v.MemPercent, Ready: v.ReadyPercent, Swap: v.SwapMB, Lat: v.LatencyMs, Fs: v.FsPercent}
				if v.WriteBps != nil {
					kib := *v.WriteBps / 1024
					u.Write = &kib
				}
				list = append(list, u)
			}
		}
		if err := m.St.addUsage(ctx, p.ID, snap.CollectedAt.In(CST), list); err != nil {
			return err
		}
		return m.St.setCursor(ctx, p.ID, "last_mon_at", *snap.CollectedAt)
	}
	return nil
}

func (m *Sampler) fromCapacity(ctx context.Context, p capacity.Platform, at time.Time, cur cursor) error {
	vms, _, err := m.Cap.Rows(ctx, p, "vms")
	if err != nil {
		return err
	}
	vols, _, _ := m.Cap.Rows(ctx, p, "volumes")
	hosts, _, _ := m.Cap.Rows(ctx, p, "nodes")
	pools, _, _ := m.Cap.Rows(ctx, p, "pools")

	// 1) 云主机状态跟踪
	old, err := m.St.vmStates(ctx, p.ID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	upsert := map[string]vmState{}
	keep := map[string]bool{}
	for _, r := range vms {
		id, code := s(r, "id"), strings.ToLower(s(r, "status"))
		if id == "" {
			continue
		}
		keep[id] = true
		prev, had := old[id]
		switch {
		case !had:
			upsert[id] = vmState{Status: code, Since: initialSince(r, code, now)}
		case prev.Status != code:
			since := now
			if t, ok := parseTime(s(r, "updatedAt")); ok && t.After(prev.Since) && !t.After(now) {
				since = t
			}
			upsert[id] = vmState{Status: code, Since: since}
		}
	}
	if len(upsert) > 0 || len(old) != len(keep) {
		if err := m.St.putStates(ctx, p.ID, upsert, keep); err != nil {
			return err
		}
	}

	// 2) 资源数量快照
	if at.Sub(cur.cnt) >= countEvery || cur.cnt.IsZero() {
		c := CountRow{Vms: len(vms), Disks: len(vols), Hosts: len(hosts), Pools: len(pools)}
		for _, r := range vms {
			if stateGroup(s(r, "status")) == "running" {
				c.Running++
			}
		}
		for _, r := range vols {
			c.DiskGB += int64(fv(r, "sizeGb"))
		}
		if err := m.St.saveCounts(ctx, p.ID, at, c); err != nil {
			return err
		}
		if err := m.St.setCursor(ctx, p.ID, "last_count_at", at); err != nil {
			return err
		}
	}

	// 3) 存储池使用率样本（监控中心只有平台级存储使用率，存储器使用率分布需要按存储池记录）
	if len(pools) > 0 {
		tx, err := m.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		for _, r := range pools {
			if pv := f(r, "usedPercent"); pv != nil {
				if _, err := tx.ExecContext(ctx, `INSERT INTO metric_samples(provider_id,metric,target,value,sampled_at) VALUES(?,?,?,?,?)`,
					p.ID, "pool_used_percent", trunc(s(r, "name"), 120), *pv, at.UTC()); err != nil {
					return err
				}
			}
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return m.St.setCursor(ctx, p.ID, "last_cap_at", at)
}

// initialSince 首次看到某台云主机时，用 Nova 的时间戳估计其进入当前状态的时间：
// 已关机 → 最近更新时间（关机会刷新 updated）；运行中 → 启动时间 / 创建时间。
func initialSince(r capacity.Row, code string, now time.Time) time.Time {
	var cands []string
	if code == "active" {
		cands = []string{s(r, "launchedAt"), s(r, "createdAt"), s(r, "updatedAt")}
	} else {
		cands = []string{s(r, "updatedAt"), s(r, "launchedAt"), s(r, "createdAt")}
	}
	for _, c := range cands {
		if t, ok := parseTime(c); ok && !t.After(now) {
			return t
		}
	}
	return now
}
