package capacity

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"strings"
	"sync"
	"time"
)

// Kinds 资源类型 → capacity_snapshots 列名（同时是 API 路径中的 kind）。
var Kinds = map[string]string{"phys": "phys", "nodes": "nodes", "vms": "vms", "volumes": "volumes", "ports": "ports", "pools": "pools"}

// Store 资产快照的持久化 + 内存缓存（按平台缓存已解析、已预计算搜索文本的行，原始对象不驻留内存）。
type Store struct {
	db    *sql.DB
	mu    sync.Mutex
	cache map[string]*entry
}

func NewStore(db *sql.DB) *Store { return &Store{db: db, cache: map[string]*entry{}} }

// Platform 平台的展示信息（来自 providers 表，随每次请求传入，用于注入每行的「所属云平台」）。
type Platform struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	EnvType   string `json:"envType"`
	ConsoleIP string `json:"consoleIp"`
}

// Meta 一次采集的状态。
type Meta struct {
	CollectedAt *time.Time `json:"collectedAt"`
	OK          bool       `json:"ok"`
	Error       string     `json:"error"`
	DurationMs  int        `json:"durationMs"`
	Steps       []Step     `json:"steps"`
}

type entry struct {
	sig  string
	meta Meta
	rows map[string][]Row // kind → 行（已注入平台字段与 _s 搜索文本，不含 raw）
}

func gz(v any) ([]byte, error) {
	var buf bytes.Buffer
	w, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func ungz(b []byte, out any) error {
	if len(b) == 0 {
		return nil
	}
	r, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer r.Close()
	raw, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

// Save 保存一次采集结果：某类资源采集失败（nil）时保留上一次成功的数据，仅更新状态与错误。
func (s *Store) Save(ctx context.Context, id string, res *Result, errMsg string, took time.Duration) error {
	now := time.Now().UTC()
	defer s.drop(id)
	if res == nil {
		_, err := s.db.ExecContext(ctx, `INSERT INTO capacity_snapshots(provider_id,ok,error,duration_ms,last_try_at) VALUES(?,0,?,?,?)
ON DUPLICATE KEY UPDATE ok=0,error=VALUES(error),duration_ms=VALUES(duration_ms),last_try_at=VALUES(last_try_at)`, id, trunc(errMsg, 480), took.Milliseconds(), now)
		return err
	}
	blob := func(rows []Row, key string) (any, error) {
		if rows == nil {
			return nil, nil
		}
		sortRows(rows, key)
		return gz(rows)
	}
	var cols [6]any
	var err error
	for i, k := range []struct {
		rows []Row
		key  string
	}{{res.Nodes, "name"}, {res.VMs, "name"}, {res.Volumes, "name"}, {res.Ports, "name"}, {res.Pools, "poolName"}, {res.Phys, "hostname"}} {
		if cols[i], err = blob(k.rows, k.key); err != nil {
			return err
		}
	}
	steps, _ := json.Marshal(res.Steps)
	ok := 0
	for _, st := range res.Steps {
		if st.OK {
			ok = 1
		}
	}
	// 首次插入：没采到的列为 NULL；已有记录：COALESCE 保留旧数据
	_, err = s.db.ExecContext(ctx, `INSERT INTO capacity_snapshots(provider_id,collected_at,ok,error,duration_ms,nodes,vms,volumes,ports,pools,phys,steps,last_try_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE collected_at=VALUES(collected_at),ok=VALUES(ok),error=VALUES(error),duration_ms=VALUES(duration_ms),
nodes=COALESCE(VALUES(nodes),nodes),vms=COALESCE(VALUES(vms),vms),volumes=COALESCE(VALUES(volumes),volumes),ports=COALESCE(VALUES(ports),ports),pools=COALESCE(VALUES(pools),pools),phys=COALESCE(VALUES(phys),phys),
steps=VALUES(steps),last_try_at=VALUES(last_try_at)`,
		id, now, ok, trunc(errMsg, 480), took.Milliseconds(), cols[0], cols[1], cols[2], cols[3], cols[4], cols[5], string(steps), now)
	return err
}

func (s *Store) drop(id string) { s.mu.Lock(); delete(s.cache, id); s.mu.Unlock() }

// LastTry 某平台上次尝试采集的时间。
func (s *Store) LastTry(ctx context.Context, id string) time.Time {
	var t sql.NullTime
	_ = s.db.QueryRowContext(ctx, `SELECT last_try_at FROM capacity_snapshots WHERE provider_id=?`, id).Scan(&t)
	return t.Time
}

// Prune 删除已不存在的平台的快照。
func (s *Store) Prune(ctx context.Context) {
	_, _ = s.db.ExecContext(ctx, `DELETE FROM capacity_snapshots WHERE provider_id NOT IN (SELECT id FROM providers)`)
}

// load 取某平台的缓存条目（平台名称 / 控制台 IP / 采集时间任一变化即重新读库）。
func (s *Store) load(ctx context.Context, p Platform) (*entry, error) {
	var col sql.NullTime
	var ok bool
	var errMsg string
	var dur int
	var steps sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT collected_at,ok,error,duration_ms,steps FROM capacity_snapshots WHERE provider_id=?`, p.ID).Scan(&col, &ok, &errMsg, &dur, &steps)
	if err == sql.ErrNoRows {
		return &entry{meta: Meta{Steps: []Step{}}, rows: map[string][]Row{}}, nil
	}
	if err != nil {
		return nil, err
	}
	sig := p.Name + "|" + p.ConsoleIP + "|" + col.Time.Format(time.RFC3339Nano)
	s.mu.Lock()
	if e := s.cache[p.ID]; e != nil && e.sig == sig {
		s.mu.Unlock()
		return e, nil
	}
	s.mu.Unlock()

	e := &entry{sig: sig, meta: Meta{OK: ok, Error: errMsg, DurationMs: dur, Steps: []Step{}}, rows: map[string][]Row{}}
	if col.Valid {
		t := col.Time
		e.meta.CollectedAt = &t
	}
	if steps.Valid {
		_ = json.Unmarshal([]byte(steps.String), &e.meta.Steps)
	}
	for kind, c := range Kinds {
		var b []byte
		if err := s.db.QueryRowContext(ctx, "SELECT "+c+" FROM capacity_snapshots WHERE provider_id=?", p.ID).Scan(&b); err != nil {
			return nil, err
		}
		var all []Row
		if err := ungz(b, &all); err != nil {
			return nil, err
		}
		rows := all
		if kind == "phys" { // 兼容已入库的旧快照：排除型号为 OpenStack Nova 的虚拟机资源
			rows = make([]Row, 0, len(all))
			for _, r := range all {
				if !isNovaModel(r) {
					rows = append(rows, r)
				}
			}
		}
		for _, r := range rows {
			raw := r["raw"]
			delete(r, "raw")
			r["providerId"], r["providerName"], r["consoleIp"], r["envType"] = p.ID, p.Name, p.ConsoleIP, p.EnvType
			var sb strings.Builder
			flatten(r, 0, &sb)
			flatten(raw, 0, &sb)
			r["_s"] = strings.ToLower(sb.String())
		}
		e.rows[kind] = rows
	}
	s.mu.Lock()
	s.cache[p.ID] = e
	s.mu.Unlock()
	return e, nil
}

// Detail 单条资源的完整信息：展示字段 + 接口返回的原始对象 raw。
func (s *Store) Detail(ctx context.Context, p Platform, kind, id string) (Row, bool, error) {
	c, ok := Kinds[kind]
	if !ok {
		return nil, false, nil
	}
	var b []byte
	if err := s.db.QueryRowContext(ctx, "SELECT "+c+" FROM capacity_snapshots WHERE provider_id=?", p.ID).Scan(&b); err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	var rows []Row
	if err := ungz(b, &rows); err != nil {
		return nil, false, err
	}
	for _, r := range rows {
		if toStr(r["id"]) == id {
			r["providerId"], r["providerName"], r["consoleIp"], r["envType"] = p.ID, p.Name, p.ConsoleIP, p.EnvType
			return r, true, nil
		}
	}
	return nil, false, nil
}
