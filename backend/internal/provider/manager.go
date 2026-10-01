package provider

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

type Task struct {
	ID         string    `json:"id"`
	Kind       string    `json:"kind"`
	ProviderID string    `json:"providerId"`
	Status     string    `json:"status"` // running / success / failed
	Progress   int       `json:"progress"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Manager struct {
	Store  *Store
	Client *Client
	db     *sql.DB
	mu     sync.Mutex
	busy   map[string]bool // 正在同步的平台
}

func NewManager(db *sql.DB, st *Store) *Manager {
	return &Manager{Store: st, Client: NewClient(), db: db, busy: map[string]bool{}}
}

func credsOf(p *Provider, pwd string) Creds {
	return Creds{RootDomain: p.RootDomain, ConsoleIP: p.ConsoleIP, Username: p.Auth.Username, Password: pwd, ProjectName: p.Auth.ProjectName,
		UserDomain: p.Auth.UserDomain, ProjectDomain: p.Auth.ProjectDomain, Timeout: time.Duration(p.Advanced.TimeoutSec) * time.Second}
}

// VerifyDraft 验证表单草稿（尚未保存）。id 非空且草稿密码为空时沿用该平台已保存的密码。
func (m *Manager) VerifyDraft(ctx context.Context, id string, in Input) (*VerifyResult, error) {
	needPwd := true
	if id != "" {
		if _, err := m.Store.Get(ctx, id); err != nil {
			return nil, err
		}
		needPwd = false
	}
	if e := Normalize(&in, needPwd); len(e) > 0 {
		return nil, FieldsErr(e)
	}
	pwd := in.Auth.Password
	if pwd == "" {
		var err error
		if pwd, err = m.Store.Password(ctx, id); err != nil {
			return nil, err
		}
	}
	res := m.Client.Verify(ctx, Creds{RootDomain: in.RootDomain, ConsoleIP: in.ConsoleIP, Username: in.Auth.Username, Password: pwd,
		ProjectName: in.Auth.ProjectName, UserDomain: in.Auth.UserDomain, ProjectDomain: in.Auth.ProjectDomain, Timeout: time.Duration(in.Advanced.TimeoutSec) * time.Second})
	// 草稿与库中配置一致时才回写状态；否则只返回结果，不污染已保存平台的状态。
	if id != "" {
		if saved, err := m.Store.Get(ctx, id); err == nil && sameAccess(saved, &in) {
			_ = m.Store.SaveVerify(ctx, id, res)
		}
	}
	return res, nil
}

func sameAccess(p *Provider, in *Input) bool {
	return p.ConsoleIP == in.ConsoleIP && p.RootDomain == in.RootDomain && p.Auth.Username == in.Auth.Username &&
		p.Auth.ProjectName == in.Auth.ProjectName && p.Auth.UserDomain == in.Auth.UserDomain && p.Auth.ProjectDomain == in.Auth.ProjectDomain && in.Auth.Password == ""
}

// VerifySaved 验证已保存的平台并把结果（状态、明细、时间）写库。
func (m *Manager) VerifySaved(ctx context.Context, id string) (*VerifyResult, error) {
	p, err := m.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	pwd, err := m.Store.Password(ctx, id)
	if err != nil {
		return nil, err
	}
	res := m.Client.Verify(ctx, credsOf(p, pwd))
	if err := m.Store.SaveVerify(ctx, id, res); err != nil {
		return nil, err
	}
	return res, nil
}

// StartSync 创建同步任务并在后台执行；同一平台同时只允许一个同步。
func (m *Manager) StartSync(ctx context.Context, by, id string) (*Task, error) {
	if _, err := m.Store.Get(ctx, id); err != nil {
		return nil, err
	}
	m.mu.Lock()
	if m.busy[id] {
		m.mu.Unlock()
		return nil, httpx.Err(409, "该平台正在同步中，请稍候")
	}
	m.busy[id] = true
	m.mu.Unlock()
	now := time.Now().UTC()
	t := &Task{ID: newID("t"), Kind: "sync", ProviderID: id, Status: "running", Message: "排队中", CreatedAt: now, UpdatedAt: now}
	if _, err := m.db.ExecContext(ctx, `INSERT INTO tasks(id,kind,provider_id,status,progress,message,started_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		t.ID, t.Kind, id, t.Status, 0, t.Message, by, now, now); err != nil {
		m.release(id)
		return nil, err
	}
	go m.runSync(t.ID, id, by == "system")
	return t, nil
}

func (m *Manager) release(id string) { m.mu.Lock(); delete(m.busy, id); m.mu.Unlock() }

func (m *Manager) setTask(taskID, status string, pct int, msg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if len([]rune(msg)) > 500 {
		msg = string([]rune(msg)[:500])
	}
	if _, err := m.db.ExecContext(ctx, `UPDATE tasks SET status=?,progress=?,message=?,updated_at=? WHERE id=?`, status, pct, msg, time.Now().UTC(), taskID); err != nil {
		log.Printf("更新任务失败 %s: %v", taskID, err)
	}
}

func (m *Manager) runSync(taskID, id string, verifyFirst bool) {
	defer m.release(id)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	fail := func(msg string) {
		m.setTask(taskID, "failed", 100, msg)
		_, _ = m.db.ExecContext(context.Background(), `UPDATE providers SET last_sync_try_at=?,last_sync_error=? WHERE id=?`, time.Now().UTC(), trunc(msg, 500), id)
	}
	p, err := m.Store.Get(ctx, id)
	if err != nil {
		fail("平台不存在或已被删除")
		return
	}
	pwd, err := m.Store.Password(ctx, id)
	if err != nil {
		fail("读取已保存的密码失败：" + err.Error())
		return
	}
	if verifyFirst { // 自动同步顺带刷新「状态」，让状态不会停留在过期结论
		m.setTask(taskID, "running", 2, "正在验证连接")
		vr := m.Client.Verify(ctx, credsOf(p, pwd))
		_ = m.Store.SaveVerify(ctx, id, vr)
	}
	res, err := m.Client.Sync(ctx, credsOf(p, pwd), func(pct int, msg string) { m.setTask(taskID, "running", pct, msg) })
	if err != nil {
		fail(err.Error())
		return
	}
	now := time.Now().UTC()
	_, err = m.db.ExecContext(ctx, `UPDATE providers SET vm_count=?,volume_count=?,network_count=?,zones=?,last_sync_at=?,last_sync_try_at=?,last_sync_error='' WHERE id=?`,
		res.Stats.VMCount, res.Stats.VolumeCount, res.Stats.NetworkCount, strings.Join(res.Zones, ","), now, now, id)
	if err != nil {
		fail("写入同步结果失败：" + err.Error())
		return
	}
	m.setTask(taskID, "success", 100, "同步完成：云主机 "+strconv.Itoa(res.Stats.VMCount)+"、云硬盘 "+strconv.Itoa(res.Stats.VolumeCount)+"、网络 "+strconv.Itoa(res.Stats.NetworkCount))
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func (m *Manager) GetTask(ctx context.Context, id string) (*Task, error) {
	var t Task
	err := m.db.QueryRowContext(ctx, `SELECT id,kind,provider_id,status,progress,message,created_at,updated_at FROM tasks WHERE id=?`, id).
		Scan(&t.ID, &t.Kind, &t.ProviderID, &t.Status, &t.Progress, &t.Message, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpx.Err(404, "任务不存在")
	}
	t.CreatedAt, t.UpdatedAt = t.CreatedAt.UTC(), t.UpdatedAt.UTC()
	return &t, err
}

// Impact 删除前的影响范围：来自最近一次真实同步的统计。
type Impact struct {
	VMCount      int  `json:"vmCount"`
	VolumeCount  int  `json:"volumeCount"`
	NetworkCount int  `json:"networkCount"`
	Synced       bool `json:"synced"`
}

func (m *Manager) Impact(ctx context.Context, id string) (*Impact, error) {
	p, err := m.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return &Impact{VMCount: p.Stats.VMCount, VolumeCount: p.Stats.VolumeCount, NetworkCount: p.Stats.NetworkCount, Synced: p.LastSyncAt != nil}, nil
}

// Start 启动后台：把重启时遗留的 running 任务置为失败；之后每 30 秒检查哪些平台到了「同步间隔」并自动同步。
func (m *Manager) Start(ctx context.Context) {
	_, _ = m.db.ExecContext(ctx, `UPDATE tasks SET status='failed',progress=100,message='服务重启，任务被中断',updated_at=UTC_TIMESTAMP(3) WHERE status='running'`)
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
	rows, err := m.db.QueryContext(ctx, `SELECT id FROM providers WHERE COALESCE(last_sync_try_at,'1970-01-01') <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL sync_interval_min MINUTE)`)
	if err != nil {
		log.Printf("自动同步扫描失败: %v", err)
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		if _, err := m.StartSync(ctx, "system", id); err != nil {
			var he *httpx.HTTPError
			if !errors.As(err, &he) {
				log.Printf("自动同步 %s 失败: %v", id, err)
			}
			continue
		}
		// 无论成功失败都推进 last_sync_try_at，避免失败的平台每 30 秒重试一次
		_, _ = m.db.ExecContext(ctx, `UPDATE providers SET last_sync_try_at=UTC_TIMESTAMP(3) WHERE id=?`, id)
	}
}
