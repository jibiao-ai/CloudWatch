package analytics

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

// Store 运营分析的持久化。
type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// ---- 采样游标 ----

type cursor struct{ cap, mon, cnt time.Time }

func (s *Store) cursorOf(ctx context.Context, id string) cursor {
	var a, b, c sql.NullTime
	_ = s.db.QueryRowContext(ctx, `SELECT last_cap_at,last_mon_at,last_count_at FROM analytics_state WHERE provider_id=?`, id).Scan(&a, &b, &c)
	return cursor{a.Time, b.Time, c.Time}
}

func (s *Store) setCursor(ctx context.Context, id, col string, t time.Time) error {
	_, err := s.db.ExecContext(ctx, "INSERT INTO analytics_state(provider_id,"+col+") VALUES(?,?) ON DUPLICATE KEY UPDATE "+col+"=VALUES("+col+")", id, t.UTC())
	return err
}

// ---- 资源数量快照 ----

// CountRow 一条资源数量快照。
type CountRow struct {
	Vms, Running, Disks, Hosts, Pools int
	DiskGB                            int64
}

func (s *Store) saveCounts(ctx context.Context, id string, at time.Time, c CountRow) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO analytics_counts(provider_id,sampled_at,vms,vms_running,disks,disk_gb,hosts,pools) VALUES(?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE vms=VALUES(vms),vms_running=VALUES(vms_running),disks=VALUES(disks),disk_gb=VALUES(disk_gb),hosts=VALUES(hosts),pools=VALUES(pools)`,
		id, at.UTC(), c.Vms, c.Running, c.Disks, c.DiskGB, c.Hosts, c.Pools)
	return err
}

// Point 趋势点。
type Point struct {
	T int64   `json:"t"`
	V float64 `json:"v"`
}

// CountTrend 某平台的数量趋势：按 bucket 秒分桶（东八区对齐），每桶取最后一个样本，时间戳取桶起点，便于多个平台按同一时间轴合并。
func (s *Store) CountTrend(ctx context.Context, id, col string, since time.Time, bucket int64) ([]Point, error) {
	switch col {
	case "vms", "disks", "disk_gb", "hosts", "pools":
	default:
		col = "vms"
	}
	rows, err := s.db.QueryContext(ctx, `SELECT sampled_at,`+col+` FROM analytics_counts WHERE provider_id=? AND sampled_at>=? ORDER BY sampled_at`, id, since.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Point{}
	const off = 8 * 3600
	last := int64(-1)
	for rows.Next() {
		var t time.Time
		var v float64
		if err := rows.Scan(&t, &v); err != nil {
			return nil, err
		}
		b := (t.Unix() + off) / bucket
		pt := Point{T: (b*bucket - off) * 1000, V: v}
		if b == last {
			out[len(out)-1] = pt
			continue
		}
		last = b
		out = append(out, pt)
	}
	return out, rows.Err()
}

// ---- 云主机状态 ----

type vmState struct {
	Status string
	Since  time.Time
}

func (s *Store) vmStates(ctx context.Context, id string) (map[string]vmState, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT vm_id,status,since FROM analytics_vm_state WHERE provider_id=?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]vmState{}
	for rows.Next() {
		var k string
		var v vmState
		if err := rows.Scan(&k, &v.Status, &v.Since); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

func (s *Store) putStates(ctx context.Context, id string, upsert map[string]vmState, keep map[string]bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	st, err := tx.PrepareContext(ctx, `INSERT INTO analytics_vm_state(provider_id,vm_id,status,since) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),since=VALUES(since)`)
	if err != nil {
		return err
	}
	defer st.Close()
	for k, v := range upsert {
		if _, err := st.ExecContext(ctx, id, k, v.Status, v.Since.UTC()); err != nil {
			return err
		}
	}
	// 已删除的云主机：清理状态记录
	rows, err := tx.QueryContext(ctx, `SELECT vm_id FROM analytics_vm_state WHERE provider_id=?`, id)
	if err != nil {
		return err
	}
	var gone []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil && !keep[k] {
			gone = append(gone, k)
		}
	}
	rows.Close()
	for _, k := range gone {
		if _, err := tx.ExecContext(ctx, `DELETE FROM analytics_vm_state WHERE provider_id=? AND vm_id=?`, id, k); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---- 云主机使用率（按天汇总） ----

// UsageSample 一台云主机一次采样的 CPU / 内存使用率（nil 表示该项未采到）。
type UsageSample struct {
	VM       string
	CPU, Mem *float64
}

func (s *Store) addUsage(ctx context.Context, id string, day time.Time, list []UsageSample) error {
	if len(list) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	st, err := tx.PrepareContext(ctx, `INSERT INTO analytics_vm_usage(provider_id,vm_id,day,cpu_sum,cpu_n,cpu_max,mem_sum,mem_n,mem_max) VALUES(?,?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE cpu_sum=cpu_sum+VALUES(cpu_sum),cpu_n=cpu_n+VALUES(cpu_n),cpu_max=GREATEST(cpu_max,VALUES(cpu_max)),
mem_sum=mem_sum+VALUES(mem_sum),mem_n=mem_n+VALUES(mem_n),mem_max=GREATEST(mem_max,VALUES(mem_max))`)
	if err != nil {
		return err
	}
	defer st.Close()
	d := day.Format("2006-01-02")
	for _, u := range list {
		var cs, cm, ms, mm float64
		var cn, mn int
		if u.CPU != nil {
			cs, cm, cn = *u.CPU, *u.CPU, 1
		}
		if u.Mem != nil {
			ms, mm, mn = *u.Mem, *u.Mem, 1
		}
		if cn+mn == 0 {
			continue
		}
		if _, err := st.ExecContext(ctx, id, u.VM, d, cs, cn, cm, ms, mn, mm); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Usage 一台云主机在统计窗口内的使用率汇总。
type Usage struct {
	CPUAvg, CPUMax, MemAvg, MemMax *float64
	Days                           int // 有数据的天数
}

// usageSince 各云主机自 since（含，按天）起的使用率汇总，键为 providerID + "/" + vmID。providerID 为空表示全部平台。
func (s *Store) usageSince(ctx context.Context, providerID string, since time.Time) (map[string]*Usage, error) {
	q := `SELECT provider_id,vm_id,SUM(cpu_sum),SUM(cpu_n),MAX(cpu_max),SUM(mem_sum),SUM(mem_n),MAX(mem_max),COUNT(DISTINCT day) FROM analytics_vm_usage WHERE day>=?`
	args := []any{since.Format("2006-01-02")}
	if providerID != "" {
		q += ` AND provider_id=?`
		args = append(args, providerID)
	}
	rows, err := s.db.QueryContext(ctx, q+` GROUP BY provider_id,vm_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*Usage{}
	for rows.Next() {
		var pid, vid string
		var cs, ms float64
		var cn, mn, days int
		var cm, mm float64
		if err := rows.Scan(&pid, &vid, &cs, &cn, &cm, &ms, &mn, &mm, &days); err != nil {
			return nil, err
		}
		u := &Usage{Days: days}
		if cn > 0 {
			u.CPUAvg, u.CPUMax = ptr(round1(cs/float64(cn))), ptr(round1(cm))
		}
		if mn > 0 {
			u.MemAvg, u.MemMax = ptr(round1(ms/float64(mn))), ptr(round1(mm))
		}
		out[pid+"/"+vid] = u
	}
	return out, rows.Err()
}

// DayBands 某一天各使用率区间的云主机数量。
type DayBands struct {
	Day   string
	Bands [5]int
}

// vmBandsByDay 云主机按「当日平均使用率」落入各区间的数量，按天返回。
func (s *Store) vmBandsByDay(ctx context.Context, providerID string, vmIDs map[string]bool, from, to time.Time, mem bool) ([]DayBands, error) {
	sum, n := "cpu_sum", "cpu_n"
	if mem {
		sum, n = "mem_sum", "mem_n"
	}
	q := `SELECT provider_id,vm_id,day,` + sum + `/` + n + ` FROM analytics_vm_usage WHERE ` + n + `>0 AND day>=? AND day<=?`
	args := []any{from.Format("2006-01-02"), to.Format("2006-01-02")}
	if providerID != "" {
		q += ` AND provider_id=?`
		args = append(args, providerID)
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY day`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byDay := map[string]*DayBands{}
	var order []string
	for rows.Next() {
		var pid, vid string
		var day time.Time
		var avg float64
		if err := rows.Scan(&pid, &vid, &day, &avg); err != nil {
			return nil, err
		}
		if vmIDs != nil && !vmIDs[pid+"/"+vid] {
			continue
		}
		k := day.Format("2006-01-02")
		d := byDay[k]
		if d == nil {
			d = &DayBands{Day: k}
			byDay[k] = d
			order = append(order, k)
		}
		d.Bands[bandOf(avg)]++
	}
	out := make([]DayBands, 0, len(order))
	for _, k := range order {
		out = append(out, *byDay[k])
	}
	return out, rows.Err()
}

// ---- 宿主机 / 存储器使用率分布（来自监控中心的 metric_samples） ----

// BandPoint 某时刻各区间的对象数量。
type BandPoint struct {
	T     int64  `json:"t"`
	Bands [5]int `json:"bands"`
}

// metricBands 把 metric_samples 里 (平台, 目标) 的使用率按时间桶求平均后，统计每个桶中落入各区间的对象数量。
// targets 非空时只统计这些目标（宿主机名）；providerIDs 为空表示全部平台。
func (s *Store) metricBands(ctx context.Context, metric string, providerIDs []string, targets map[string]bool, from, to time.Time, bucket int64) ([]BandPoint, error) {
	q := `SELECT provider_id,target,FLOOR(UNIX_TIMESTAMP(sampled_at)/?) b,AVG(value) FROM metric_samples WHERE metric=? AND sampled_at>=? AND sampled_at<=?`
	args := []any{bucket, metric, from.UTC(), to.UTC()}
	if len(providerIDs) > 0 {
		q += ` AND provider_id IN (` + strings.TrimSuffix(strings.Repeat("?,", len(providerIDs)), ",") + `)`
		for _, id := range providerIDs {
			args = append(args, id)
		}
	}
	rows, err := s.db.QueryContext(ctx, q+` GROUP BY provider_id,target,b ORDER BY b`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byB := map[int64]*BandPoint{}
	var order []int64
	for rows.Next() {
		var pid, tg string
		var b int64
		var v float64
		if err := rows.Scan(&pid, &tg, &b, &v); err != nil {
			return nil, err
		}
		if targets != nil && !targets[pid+"/"+tg] && !targets[pid+"/"+short(tg)] {
			continue
		}
		p := byB[b]
		if p == nil {
			p = &BandPoint{T: (b*bucket + bucket/2) * 1000}
			byB[b] = p
			order = append(order, b)
		}
		p.Bands[bandOf(v)]++
	}
	out := make([]BandPoint, 0, len(order))
	for _, b := range order {
		out = append(out, *byB[b])
	}
	return out, rows.Err()
}

// ---- 优化策略 ----

func (s *Store) policies(ctx context.Context) ([]Policy, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT kind,name,enabled,window_days,conds,updated_at,updated_by FROM analytics_policies ORDER BY sort_no`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Policy
	for rows.Next() {
		var p Policy
		var cj string
		var at sql.NullTime
		if err := rows.Scan(&p.Kind, &p.Name, &p.Enabled, &p.WindowDays, &cj, &at, &p.UpdatedBy); err != nil {
			return nil, err
		}
		p.Conds = parseConds(cj)
		if at.Valid {
			t := at.Time
			p.UpdatedAt = &t
		}
		p.Scope = "所有资源"
		p.Reason = p.ReasonText()
		out = append(out, p)
	}
	// 展示顺序固定为 Kinds（降配 / 升配 / 回收），不依赖库里的 sort_no
	idx := func(k string) int {
		for i, x := range Kinds {
			if x == k {
				return i
			}
		}
		return len(Kinds)
	}
	sort.SliceStable(out, func(i, j int) bool { return idx(out[i].Kind) < idx(out[j].Kind) })
	return out, rows.Err()
}

// Policies 三条优化策略（按页面展示顺序：降配 / 升配 / 回收）。
func (s *Store) Policies(ctx context.Context) ([]Policy, error) { return s.policies(ctx) }

// SavePolicy 更新一条策略（名称 / 启用 / 统计周期 / 条件）。
func (s *Store) SavePolicy(ctx context.Context, p Policy, by string) error {
	cj, _ := json.Marshal(p.Conds)
	res, err := s.db.ExecContext(ctx, `UPDATE analytics_policies SET name=?,enabled=?,window_days=?,conds=?,updated_at=?,updated_by=? WHERE kind=?`,
		p.Name, p.Enabled, p.WindowDays, string(cj), time.Now().UTC(), by, p.Kind)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var c int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_policies WHERE kind=?`, p.Kind).Scan(&c)
		if c == 0 {
			return sql.ErrNoRows
		}
	}
	return nil
}

// ---- 已忽略 ----

// Ignore 一条已忽略记录。
type Ignore struct {
	Kind       string    `json:"kind"`
	ProviderID string    `json:"providerId"`
	VMID       string    `json:"vmId"`
	VMName     string    `json:"vmName"`
	CreatedBy  string    `json:"createdBy"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (s *Store) ignores(ctx context.Context, kind string) (map[string]Ignore, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT kind,provider_id,vm_id,vm_name,created_by,created_at FROM analytics_ignores WHERE kind=?`, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Ignore{}
	for rows.Next() {
		var g Ignore
		if err := rows.Scan(&g.Kind, &g.ProviderID, &g.VMID, &g.VMName, &g.CreatedBy, &g.CreatedAt); err != nil {
			return nil, err
		}
		out[g.ProviderID+"/"+g.VMID] = g
	}
	return out, rows.Err()
}

// SetIgnore 忽略 / 取消忽略一批云主机的某类建议。
func (s *Store) SetIgnore(ctx context.Context, kind string, items []Ignore, on bool, by string) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	n := 0
	for _, it := range items {
		if it.ProviderID == "" || it.VMID == "" {
			continue
		}
		if on {
			_, err = tx.ExecContext(ctx, `INSERT INTO analytics_ignores(kind,provider_id,vm_id,vm_name,created_by,created_at) VALUES(?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE vm_name=VALUES(vm_name)`, kind, it.ProviderID, it.VMID, trunc(it.VMName, 250), by, time.Now().UTC())
		} else {
			_, err = tx.ExecContext(ctx, `DELETE FROM analytics_ignores WHERE kind=? AND provider_id=? AND vm_id=?`, kind, it.ProviderID, it.VMID)
		}
		if err != nil {
			return 0, err
		}
		n++
	}
	return n, tx.Commit()
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// ---- 清理 ----

// Prune 清理过期历史，并移除已不存在的平台的数据。
func (s *Store) Prune(ctx context.Context) {
	cut := time.Now().UTC().AddDate(0, 0, -KeepDays)
	_, _ = s.db.ExecContext(ctx, `DELETE FROM analytics_counts WHERE sampled_at<?`, cut)
	_, _ = s.db.ExecContext(ctx, `DELETE FROM analytics_vm_usage WHERE day<?`, cut.Format("2006-01-02"))
	for _, t := range []string{"analytics_counts", "analytics_vm_usage", "analytics_vm_state", "analytics_state", "analytics_ignores"} {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM `+t+` WHERE provider_id NOT IN (SELECT id FROM providers)`)
	}
}
