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
	nova map[string]bool  // 被排除的 OpenStack Nova 虚拟机的标识（短主机名 / IP，小写）
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

	e := &entry{sig: sig, meta: Meta{OK: ok, Error: errMsg, DurationMs: dur, Steps: []Step{}}, rows: map[string][]Row{}, nova: map[string]bool{}}
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
					continue
				}
				for _, k := range novaKeys(r) { // 记下被排除的虚拟机标识，供监控中心等同口径过滤
					e.nova[k] = true
				}
			}
		}
		if kind == "ports" { // 兼容已入库的旧快照：仅保留设备类型为云主机的网卡
			rows = make([]Row, 0, len(all))
			for _, r := range all {
				if o := toStr(r["deviceOwner"]); isInfraOwner(o) || (!isComputeOwner(o) && toStr(r["deviceName"]) == "") {
					continue // 基础设施端口，或既非云主机类型也未关联到虚拟机
				}
				if strings.EqualFold(toStr(r["status"]), "n/a") { // 旧快照中状态为 N/A 的统一显示「未知」
					r["statusText"], r["statusTone"] = "未知", "default"
				}
				rows = append(rows, r)
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

// Rows 某平台某类资源的全部行（已注入平台字段，不含 raw / 重字段外的任何裁剪；返回的是缓存切片，调用方只读不改）。
func (s *Store) Rows(ctx context.Context, p Platform, kind string) ([]Row, *Meta, error) {
	e, err := s.load(ctx, p)
	if err != nil {
		return nil, nil, err
	}
	m := e.meta
	return e.rows[kind], &m, nil
}

// NovaKeys 某平台物理节点接口里被判定为 OpenStack Nova 虚拟机（已排除出配置中心）的标识集合：
// 小写短主机名（取第一个「.」之前）与 IP。监控中心据此同口径过滤物理节点。
func (s *Store) NovaKeys(ctx context.Context, p Platform) (map[string]bool, error) {
	e, err := s.load(ctx, p)
	if err != nil {
		return nil, err
	}
	return e.nova, nil
}

// PhysCores 某平台配置中心「物理节点」的 CPU 核数索引：键为小写短主机名 / 完整主机名 / FQDN / 管理 IP / 带外 IP。
// 监控中心物理节点按此匹配补全「总核数」（Nova 计算节点接口只覆盖计算节点，控制 / 存储节点没有核数）。
func (s *Store) PhysCores(ctx context.Context, p Platform) (map[string]float64, error) {
	rows, _, err := s.Rows(ctx, p, "phys")
	if err != nil {
		return nil, err
	}
	out := make(map[string]float64, len(rows)*4)
	for _, r := range rows {
		c := num(r["cpuCores"])
		if c == nil || *c <= 0 {
			continue
		}
		keys := novaKeys(r)
		if v := strings.TrimSpace(toStr(r["ipmiIp"])); v != "" {
			keys = append(keys, v)
		}
		for _, k := range keys {
			out[k] = *c
		}
	}
	return out, nil
}

// novaKeys 一条 Nova 虚拟机物理节点行的标识：短主机名、完整主机名、FQDN、IP。
func novaKeys(r Row) []string {
	var out []string
	for _, k := range []string{"hostname", "name", "fqdn"} {
		if v := strings.ToLower(strings.TrimSpace(toStr(r[k]))); v != "" {
			out = append(out, v, ShortName(v))
		}
	}
	if v := strings.TrimSpace(toStr(r["ip"])); v != "" {
		out = append(out, v)
	}
	return out
}

// ShortName 取主机名第一个「.」之前的部分（已是 IP 时原样返回），并转小写。
func ShortName(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	if i := strings.IndexByte(h, '.'); i > 0 && !isIPv4(h) {
		return h[:i]
	}
	return h
}

func isIPv4(s string) bool {
	n := 0
	for _, c := range s {
		switch {
		case c == '.':
			n++
		case c < '0' || c > '9':
			return false
		}
	}
	return n == 3
}
