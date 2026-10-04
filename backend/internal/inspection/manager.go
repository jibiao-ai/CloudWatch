package inspection

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

// Manager 巡检调度：手动 / 定时触发 → 加载数据（可选先实时刷新）→ 逐平台评估 → 落库。同一时刻只运行一次巡检。
type Manager struct {
	Store     *Store
	Monitor   *monitor.Manager
	Capacity  *capacity.Manager
	Analytics *analytics.Engine
	db        *sql.DB

	mu      sync.Mutex
	running bool
}

func NewManager(db *sql.DB, mm *monitor.Manager, cm *capacity.Manager, an *analytics.Engine) *Manager {
	return &Manager{Store: NewStore(db), Monitor: mm, Capacity: cm, Analytics: an, db: db}
}

// Task 与 provider.Task 字段一致，前端沿用同一套任务轮询。
type Task struct {
	ID         string    `json:"id"`
	Kind       string    `json:"kind"`
	ProviderID string    `json:"providerId"`
	Status     string    `json:"status"`
	Progress   int       `json:"progress"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// Start 启动后台：把重启时遗留的巡检任务置为失败，并启动定时巡检。
func (m *Manager) Start(ctx context.Context) {
	_, _ = m.db.ExecContext(ctx, `UPDATE tasks SET status='failed',progress=100,message='服务重启，任务被中断',updated_at=UTC_TIMESTAMP(3) WHERE kind='inspect' AND status='running'`)
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

// scheduleDue 当前是否到了定时巡检的触发窗口（目标时刻起 30 分钟内），返回目标时刻。
func scheduleDue(s Schedule, now time.Time) (time.Time, bool) {
	if !s.Enabled {
		return time.Time{}, false
	}
	n := now.In(analytics.CST)
	hm, err := time.Parse("15:04", s.Time)
	if err != nil {
		return time.Time{}, false
	}
	if s.Mode == "weekly" {
		wd := int(n.Weekday())
		if wd == 0 {
			wd = 7
		}
		if wd != s.Weekday {
			return time.Time{}, false
		}
	}
	if s.Mode == "monthly" {
		day := s.Day
		if day < 1 || day > 31 {
			day = 1
		}
		if last := time.Date(n.Year(), n.Month()+1, 0, 0, 0, 0, 0, analytics.CST).Day(); day > last {
			day = last // 当月没有该日期（如 31 号遇到 2 月）时，取当月最后一天
		}
		if n.Day() != day {
			return time.Time{}, false
		}
	}
	target := time.Date(n.Year(), n.Month(), n.Day(), hm.Hour(), hm.Minute(), 0, 0, analytics.CST)
	if n.Before(target) || n.Sub(target) > 30*time.Minute {
		return time.Time{}, false
	}
	return target, true
}

func (m *Manager) tick(ctx context.Context) {
	c := m.Store.Config(ctx)
	target, ok := scheduleDue(c.Schedule, time.Now())
	if !ok || m.Store.ScheduledSince(ctx, target) {
		return
	}
	if _, err := m.Run(ctx, nil, "schedule", "system", "定时任务"); err != nil {
		log.Printf("定时巡检未启动：%v", err)
	}
}

func (m *Manager) setTask(id, status string, pct int, msg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	msg = trunc(msg, 500)
	if _, err := m.db.ExecContext(ctx, `UPDATE tasks SET status=?,progress=?,message=?,updated_at=? WHERE id=?`, status, pct, msg, time.Now().UTC(), id); err != nil {
		log.Printf("更新巡检任务失败 %s: %v", id, err)
	}
}

// GetTask 读取巡检任务。
func (m *Manager) GetTask(ctx context.Context, id string) (*Task, error) {
	var t Task
	err := m.db.QueryRowContext(ctx, `SELECT id,kind,provider_id,status,progress,message,created_at,updated_at FROM tasks WHERE id=? AND kind='inspect'`, id).
		Scan(&t.ID, &t.Kind, &t.ProviderID, &t.Status, &t.Progress, &t.Message, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, httpx.Err(404, "任务不存在")
	}
	t.CreatedAt, t.UpdatedAt = t.CreatedAt.UTC(), t.UpdatedAt.UTC()
	return &t, err
}

// Run 发起一次巡检。ids 为空表示全部平台。立即返回任务，巡检在后台执行。
func (m *Manager) Run(ctx context.Context, ids []string, trigger, operator, operatorName string) (*Task, error) {
	all, err := m.Capacity.Platforms(ctx)
	if err != nil {
		return nil, err
	}
	if len(all) == 0 {
		return nil, httpx.Err(400, "还没有对接任何云平台，请先在「平台管理」中添加")
	}
	var plats []capacity.Platform
	if len(ids) == 0 {
		plats = all
	} else {
		want := map[string]bool{}
		for _, id := range ids {
			want[id] = true
		}
		for _, p := range all {
			if want[p.ID] {
				plats = append(plats, p)
				delete(want, p.ID)
			}
		}
		if len(want) > 0 {
			return nil, httpx.Err(400, "所选云平台不存在或已被删除")
		}
	}
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil, httpx.Err(409, "已有一次巡检正在执行，请稍候")
	}
	m.running = true
	m.mu.Unlock()

	now := time.Now().UTC()
	t := &Task{ID: newID("t"), Kind: "inspect", ProviderID: "all", Status: "running", Message: "排队中", CreatedAt: now, UpdatedAt: now}
	if len(plats) == 1 {
		t.ProviderID = plats[0].ID
	}
	if _, err := m.db.ExecContext(ctx, `INSERT INTO tasks(id,kind,provider_id,status,progress,message,started_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		t.ID, t.Kind, t.ProviderID, t.Status, 0, t.Message, operator, now, now); err != nil {
		m.release()
		return nil, err
	}
	go m.run(t.ID, plats, trigger, operator, operatorName)
	return t, nil
}

func (m *Manager) release() { m.mu.Lock(); m.running = false; m.mu.Unlock() }

func (m *Manager) run(taskID string, plats []capacity.Platform, trigger, operator, operatorName string) {
	defer m.release()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("巡检异常 %s: %v", taskID, r)
			m.setTask(taskID, "failed", 100, fmt.Sprintf("巡检过程异常：%v", r))
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	cfg := m.Store.Config(ctx)
	started := time.Now()
	rep := &Report{TaskID: taskID, Trigger: trigger, Operator: operator, OperatorNm: operatorName, StartedAt: started, Refreshed: cfg.RefreshFirst, Config: cfg}
	n := len(plats)
	for i, pl := range plats {
		base := i * 100 / n
		span := 100 / n
		m.setTask(taskID, "running", base+1, fmt.Sprintf("正在巡检「%s」（%d/%d）", pl.Name, i+1, n))
		in := &Input{Plat: pl, Now: time.Now(), Refreshed: cfg.RefreshFirst}
		if cfg.RefreshFirst {
			m.setTask(taskID, "running", base+span/10, fmt.Sprintf("「%s」：实时采集监控与资产数据…", pl.Name))
			in.Notes = m.refresh(ctx, pl.ID)
		}
		m.setTask(taskID, "running", base+span*6/10, fmt.Sprintf("「%s」：汇总数据并逐项评估…", pl.Name))
		if err := m.load(ctx, in); err != nil {
			in.Notes = append(in.Notes, "读取数据失败："+err.Error())
		}
		rep.Platforms = append(rep.Platforms, Evaluate(in, cfg))
	}
	Merge(rep)
	if n == 1 {
		rep.Title = fmt.Sprintf("%s 自动巡检报告", plats[0].Name)
	} else {
		rep.Title = fmt.Sprintf("云平台自动巡检报告（%d 个平台）", n)
	}
	rep.FinishedAt = time.Now()
	id, err := m.Store.Save(ctx, rep)
	if err != nil {
		m.setTask(taskID, "failed", 100, "保存巡检报告失败："+err.Error())
		return
	}
	m.setTask(taskID, "success", 100, fmt.Sprintf("巡检完成：综合评估【%s】，健康评分 %d（报告 #%d）", StatusText[rep.Overall], rep.Score, id))
}

// refresh 巡检前实时采集（监控 + 资产并行）；失败不终止巡检，仅记录提示，随后使用库中已有数据。
func (m *Manager) refresh(ctx context.Context, id string) []string {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var notes []string
	add := func(s string) { mu.Lock(); notes = append(notes, s); mu.Unlock() }
	cx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	wg.Add(2)
	go func() {
		defer wg.Done()
		sn, err := m.Monitor.Refresh(cx, id)
		switch {
		case err != nil:
			add("实时采集监控数据失败，已使用最近一次采集的数据：" + err.Error())
		case sn != nil && !sn.OK:
			add("实时采集监控数据失败，已使用最近一次采集的数据：" + sn.Error)
		}
	}()
	go func() {
		defer wg.Done()
		mt, err := m.Capacity.Refresh(cx, id)
		switch {
		case err != nil:
			add("实时采集资产数据失败，已使用最近一次采集的数据：" + err.Error())
		case mt != nil && !mt.OK && mt.Error != "":
			add("实时采集资产数据存在失败，已使用最近一次成功的数据：" + mt.Error)
		}
	}()
	wg.Wait()
	return notes
}

// load 从库中读取一个平台巡检所需的全部数据。
func (m *Manager) load(ctx context.Context, in *Input) error {
	pl := in.Plat
	sn, err := m.Monitor.Store.Snapshot(ctx, pl.ID)
	if err != nil {
		return err
	}
	in.Snap = sn
	if sn.CollectedAt == nil {
		in.Snap.Summary = nil
	}
	in.Nodes = monitor.VisibleNodes(ctx, m.Capacity.Store, pl, sn.Nodes)
	cs := m.Capacity.Store
	in.Phys, in.CapMeta, _ = cs.Rows(ctx, pl, "phys")
	in.Computes, _, _ = cs.Rows(ctx, pl, "nodes")
	in.Pools, _, _ = cs.Rows(ctx, pl, "pools")
	in.Vols, _, _ = cs.Rows(ctx, pl, "volumes")
	if pg, err := m.Monitor.Store.ListAlerts(ctx, monitor.AlertQuery{ProviderID: pl.ID, Status: "firing", SortKey: "severity"}); err == nil {
		in.Alerts = pg.List
	}
	if m.Analytics != nil {
		if h, pol, err := m.Analytics.Hits(ctx, []capacity.Platform{pl}, pl.ID, "longoff", "zombie"); err == nil {
			in.Hits, in.Policies = h, pol
		} else {
			in.Notes = append(in.Notes, "读取运营中心策略结果失败："+err.Error())
		}
		if u, err := m.Analytics.VMUsage(ctx, pl.ID); err == nil {
			in.Usage = u
		}
	}
	in.Series = map[string][]monitor.Point{}
	day, week := in.Now.Add(-24*time.Hour), in.Now.Add(-7*24*time.Hour)
	for _, s := range []struct {
		metric string
		since  time.Time
	}{{"iops_read", day}, {"iops_write", day}, {"storage_used_bytes", week}} {
		if pts, err := m.Monitor.Store.Trend(ctx, pl.ID, s.metric, "", s.since, 0); err == nil {
			in.Series[s.metric] = pts
		}
	}
	in.NodeLat = map[string]float64{}
	for _, n := range in.Nodes {
		if pts, err := m.Monitor.Store.Trend(ctx, pl.ID, "node_disk_latency", n.Name, day, 0); err == nil && len(pts) > 0 {
			mx := 0.0
			for _, p := range pts {
				if p.V > mx {
					mx = p.V
				}
			}
			in.NodeLat[n.Name] = mx
		}
	}
	return nil
}

// ParseIDs 规整 providerIds。
func ParseIDs(in []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, s := range in {
		if s = strings.TrimSpace(s); s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
