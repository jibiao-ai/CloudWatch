package analytics

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Store 运营中心的持久化。
type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// ---- 采样游标 ----

type cursor struct{ cap, mon, cnt, bf time.Time }

func (s *Store) cursorOf(ctx context.Context, id string) cursor {
	var a, b, c, d sql.NullTime
	_ = s.db.QueryRowContext(ctx, `SELECT last_cap_at,last_mon_at,last_count_at,last_backfill_at FROM analytics_state WHERE provider_id=?`, id).Scan(&a, &b, &c, &d)
	return cursor{a.Time, b.Time, c.Time, d.Time}
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

// UsageSample 一台云主机一次采样的 CPU / 内存使用率、写 I/O 速率 KiB/s，以及 CPU 就绪占比 / Swap / 磁盘时延 ms / 文件系统使用率（nil 表示该项未采到）。
type UsageSample struct {
	VM                                    string
	CPU, Mem, Write, Ready, Swap, Lat, Fs *float64
}

const usageCols = `cpu_sum,cpu_n,cpu_max,cpu_min,mem_sum,mem_n,mem_max,mem_min,w_sum,w_n,ready_sum,ready_n,swap_max,swap_n,lat_sum,lat_n,fs_max,fs_n`

// 注意：ON DUPLICATE KEY UPDATE 的赋值从左到右执行，*_min 必须在 *_n 自增之前计算
const usageUpsert = `INSERT INTO analytics_vm_usage(provider_id,vm_id,day,` + usageCols + `) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE
cpu_min=IF(VALUES(cpu_n)=0,cpu_min,IF(cpu_n=0,VALUES(cpu_min),LEAST(cpu_min,VALUES(cpu_min)))),
mem_min=IF(VALUES(mem_n)=0,mem_min,IF(mem_n=0,VALUES(mem_min),LEAST(mem_min,VALUES(mem_min)))),
cpu_sum=cpu_sum+VALUES(cpu_sum),cpu_n=cpu_n+VALUES(cpu_n),cpu_max=GREATEST(cpu_max,VALUES(cpu_max)),
mem_sum=mem_sum+VALUES(mem_sum),mem_n=mem_n+VALUES(mem_n),mem_max=GREATEST(mem_max,VALUES(mem_max)),
w_sum=w_sum+VALUES(w_sum),w_n=w_n+VALUES(w_n),
ready_sum=ready_sum+VALUES(ready_sum),ready_n=ready_n+VALUES(ready_n),
swap_max=GREATEST(swap_max,VALUES(swap_max)),swap_n=swap_n+VALUES(swap_n),
lat_sum=lat_sum+VALUES(lat_sum),lat_n=lat_n+VALUES(lat_n),
fs_max=GREATEST(fs_max,VALUES(fs_max)),fs_n=fs_n+VALUES(fs_n)`

func (s *Store) addUsage(ctx context.Context, id string, day time.Time, list []UsageSample) error {
	if len(list) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	st, err := tx.PrepareContext(ctx, usageUpsert)
	if err != nil {
		return err
	}
	defer st.Close()
	d := day.Format("2006-01-02")
	for _, u := range list {
		var cs, cm, cl, ms, mm, ml, ws, rs, sm, ls, fm float64
		var cn, mn, wn, rn, sn, ln, fn int
		if u.CPU != nil {
			cs, cm, cl, cn = *u.CPU, *u.CPU, *u.CPU, 1
		}
		if u.Mem != nil {
			ms, mm, ml, mn = *u.Mem, *u.Mem, *u.Mem, 1
		}
		if u.Write != nil {
			ws, wn = *u.Write, 1
		}
		if u.Ready != nil {
			rs, rn = *u.Ready, 1
		}
		if u.Swap != nil {
			sm, sn = *u.Swap, 1
		}
		if u.Lat != nil {
			ls, ln = *u.Lat, 1
		}
		if u.Fs != nil {
			fm, fn = *u.Fs, 1
		}
		if cn+mn+wn+rn+sn+ln+fn == 0 {
			continue
		}
		if _, err := st.ExecContext(ctx, id, u.VM, d, cs, cn, cm, cl, ms, mn, mm, ml, ws, wn, rs, rn, sm, sn, ls, ln, fm, fn); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DailyUsage 一台云主机一天的汇总（历史回填用）。
type DailyUsage struct {
	VM, Day                                              string
	CPUSum, CPUMax, CPUMin, MemSum, MemMax, MemMin, WSum float64
	CPUN, MemN, WN                                       int
	ReadySum, SwapMax, LatSum, FsMax                     float64
	ReadyN, SwapN, LatN, FsN                             int
}

// backfillUsage 回填历史按天汇总：只补库里还没有的日期，不覆盖已有的实时累计。
func (s *Store) backfillUsage(ctx context.Context, id string, list []DailyUsage) error {
	if len(list) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	st, err := tx.PrepareContext(ctx, `INSERT IGNORE INTO analytics_vm_usage(provider_id,vm_id,day,`+usageCols+`) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer st.Close()
	for _, u := range list {
		if _, err := st.ExecContext(ctx, id, u.VM, u.Day, u.CPUSum, u.CPUN, u.CPUMax, u.CPUMin, u.MemSum, u.MemN, u.MemMax, u.MemMin, u.WSum, u.WN,
			u.ReadySum, u.ReadyN, u.SwapMax, u.SwapN, u.LatSum, u.LatN, u.FsMax, u.FsN); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Usage 一台云主机在统计窗口内的使用率汇总。
type Usage struct {
	CPUAvg, CPUMax, CPUMin *float64
	MemAvg, MemMax, MemMin *float64
	WriteAvg               *float64 // 写 I/O 平均速率 KiB/s
	ReadyAvg               *float64 // CPU 就绪时间占比 %
	SwapMax                *float64 // 内存交换最大值（>0 表示存在 Swap）
	LatAvg                 *float64 // 磁盘平均读/写时延 ms
	FsMax                  *float64 // 文件系统使用率最大值 %
	Days, WriteDays        int      // 有使用率数据的天数 / 有写 I/O 数据的天数
	ReadyDays, SwapDays    int
	LatDays, FsDays        int
}

// usageSince 各云主机自 since（含，按天）起的使用率汇总，键为 providerID + "/" + vmID。providerID 为空表示全部平台。
func (s *Store) usageSince(ctx context.Context, providerID string, since time.Time) (map[string]*Usage, error) {
	q := `SELECT provider_id,vm_id,SUM(cpu_sum),SUM(cpu_n),MAX(cpu_max),MIN(IF(cpu_n>0,cpu_min,NULL)),SUM(mem_sum),SUM(mem_n),MAX(mem_max),MIN(IF(mem_n>0,mem_min,NULL)),SUM(w_sum),SUM(w_n),COUNT(DISTINCT day),COUNT(DISTINCT IF(w_n>0,day,NULL)),
SUM(ready_sum),SUM(ready_n),COUNT(DISTINCT IF(ready_n>0,day,NULL)),MAX(swap_max),SUM(swap_n),COUNT(DISTINCT IF(swap_n>0,day,NULL)),SUM(lat_sum),SUM(lat_n),COUNT(DISTINCT IF(lat_n>0,day,NULL)),MAX(fs_max),SUM(fs_n),COUNT(DISTINCT IF(fs_n>0,day,NULL))
FROM analytics_vm_usage WHERE day>=?`
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
		var cs, ms, ws, rs, ls, sm, fm float64
		var cn, mn, wn, days, wdays, rn, rdays, sn, sdays, ln, ldays, fn, fdays int
		var cm, mm float64
		var cl, ml sql.NullFloat64
		if err := rows.Scan(&pid, &vid, &cs, &cn, &cm, &cl, &ms, &mn, &mm, &ml, &ws, &wn, &days, &wdays, &rs, &rn, &rdays, &sm, &sn, &sdays, &ls, &ln, &ldays, &fm, &fn, &fdays); err != nil {
			return nil, err
		}
		u := &Usage{Days: days, WriteDays: wdays, ReadyDays: rdays, SwapDays: sdays, LatDays: ldays, FsDays: fdays}
		if cn > 0 {
			u.CPUAvg, u.CPUMax = ptr(round1(cs/float64(cn))), ptr(round1(cm))
			if cl.Valid {
				u.CPUMin = ptr(round1(cl.Float64))
			}
		}
		if mn > 0 {
			u.MemAvg, u.MemMax = ptr(round1(ms/float64(mn))), ptr(round1(mm))
			if ml.Valid {
				u.MemMin = ptr(round1(ml.Float64))
			}
		}
		if wn > 0 {
			u.WriteAvg = ptr(round2(ws / float64(wn)))
		}
		if rn > 0 {
			u.ReadyAvg = ptr(round1(rs / float64(rn)))
		}
		if sn > 0 {
			u.SwapMax = ptr(sm)
		}
		if ln > 0 {
			u.LatAvg = ptr(round1(ls / float64(ln)))
		}
		if fn > 0 {
			u.FsMax = ptr(round1(fm))
		}
		out[pid+"/"+vid] = u
	}
	return out, rows.Err()
}

// HostStat 计算节点在统计窗口内的使用率汇总（来自监控中心 metric_samples）。
type HostStat struct {
	Avg, Max *float64
	Days     int
}

// metricStats 某指标自 since 起各目标（计算节点名）的平均 / 最大值与有数据天数，键为 providerID + "/" + 目标。
func (s *Store) metricStats(ctx context.Context, metric string, since time.Time) (map[string]HostStat, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT provider_id,target,AVG(value),MAX(value),COUNT(DISTINCT DATE(DATE_ADD(sampled_at,INTERVAL 8 HOUR))) FROM metric_samples WHERE metric=? AND sampled_at>=? GROUP BY provider_id,target`, metric, since.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]HostStat{}
	for rows.Next() {
		var pid, tg string
		var avg, mx float64
		var days int
		if err := rows.Scan(&pid, &tg, &avg, &mx, &days); err != nil {
			return nil, err
		}
		out[pid+"/"+short(tg)] = HostStat{Avg: ptr(round1(avg)), Max: ptr(round1(mx)), Days: days}
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

// ---- 计算节点 / 存储器使用率分布（来自监控中心的 metric_samples） ----

// BandPoint 某时刻各区间的对象数量。
type BandPoint struct {
	T     int64  `json:"t"`
	Bands [5]int `json:"bands"`
}

// metricBands 把 metric_samples 里 (平台, 目标) 的使用率按时间桶求平均后，统计每个桶中落入各区间的对象数量。
// targets 非空时只统计这些目标（计算节点名）；providerIDs 为空表示全部平台。
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
	rows, err := s.db.QueryContext(ctx, `SELECT kind,name,resource_type,enabled,window_days,conds,scope,advice,builtin,updated_at,updated_by FROM analytics_policies ORDER BY sort_no,kind`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Policy{}
	for rows.Next() {
		var p Policy
		var cj string
		var sc sql.NullString
		var at sql.NullTime
		if err := rows.Scan(&p.Kind, &p.Name, &p.ResourceType, &p.Enabled, &p.WindowDays, &cj, &sc, &p.Advice, &p.Builtin, &at, &p.UpdatedBy); err != nil {
			return nil, err
		}
		p.Conds = parseConds(cj)
		p.Scope = Scope{Mode: "all", Items: []string{}}
		if sc.Valid && sc.String != "" {
			_ = json.Unmarshal([]byte(sc.String), &p.Scope)
			if p.Scope.Items == nil {
				p.Scope.Items = []string{}
			}
		}
		if at.Valid {
			t := at.Time
			p.UpdatedAt = &t
		}
		p.ScopeText = p.Scope.Text()
		p.Reason = p.ReasonText()
		out = append(out, p)
	}
	return out, rows.Err()
}

// Policies 全部优化策略（按展示顺序）。
func (s *Store) Policies(ctx context.Context) ([]Policy, error) { return s.policies(ctx) }

// Policy 按 ID 取一条策略。
func (s *Store) Policy(ctx context.Context, kind string) (*Policy, error) {
	l, err := s.policies(ctx)
	if err != nil {
		return nil, err
	}
	for i := range l {
		if l[i].Kind == kind {
			return &l[i], nil
		}
	}
	return nil, sql.ErrNoRows
}

// SavePolicy 更新一条策略（名称 / 启用 / 统计周期 / 范围 / 条件 / 处置建议；资源类型创建后不可更改）。
func (s *Store) SavePolicy(ctx context.Context, p Policy, by string) error {
	cj, _ := json.Marshal(p.Conds)
	sj, _ := json.Marshal(p.Scope)
	res, err := s.db.ExecContext(ctx, `UPDATE analytics_policies SET name=?,enabled=?,window_days=?,conds=?,scope=?,advice=?,updated_at=?,updated_by=? WHERE kind=?`,
		p.Name, p.Enabled, p.WindowDays, string(cj), string(sj), p.Advice, time.Now().UTC(), by, p.Kind)
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

// MaxCustomPolicies 自定义策略数量上限。
const MaxCustomPolicies = 50

// CreatePolicy 创建自定义策略，返回新策略 ID。
func (s *Store) CreatePolicy(ctx context.Context, p Policy, by string) (string, error) {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_policies WHERE builtin=0`).Scan(&n); err != nil {
		return "", err
	}
	if n >= MaxCustomPolicies {
		return "", ErrTooMany
	}
	var dup int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_policies WHERE name=?`, p.Name).Scan(&dup)
	if dup > 0 {
		return "", ErrDupName
	}
	buf := make([]byte, 4)
	_, _ = rand.Read(buf)
	id := "c_" + hex.EncodeToString(buf)
	cj, _ := json.Marshal(p.Conds)
	sj, _ := json.Marshal(p.Scope)
	_, err := s.db.ExecContext(ctx, `INSERT INTO analytics_policies(kind,name,resource_type,enabled,window_days,conds,scope,advice,builtin,sort_no,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,0,?,?,?)`,
		id, p.Name, p.ResourceType, p.Enabled, p.WindowDays, string(cj), string(sj), p.Advice, 100+n, time.Now().UTC(), by)
	return id, err
}

// 策略创建 / 修改的业务错误。
var (
	ErrTooMany = errors.New("自定义策略数量已达上限")
	ErrDupName = errors.New("策略名称已存在")
	ErrBuiltin = errors.New("内置策略不可删除")
)

// NameTaken 名称是否被其他策略占用。
func (s *Store) NameTaken(ctx context.Context, name, exceptKind string) bool {
	var n int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_policies WHERE name=? AND kind<>?`, name, exceptKind).Scan(&n)
	return n > 0
}

// DeletePolicy 删除自定义策略及其忽略项。
func (s *Store) DeletePolicy(ctx context.Context, kind string) error {
	var b bool
	if err := s.db.QueryRowContext(ctx, `SELECT builtin FROM analytics_policies WHERE kind=?`, kind).Scan(&b); err != nil {
		return err
	}
	if b {
		return ErrBuiltin
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM analytics_policies WHERE kind=?`, kind); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM analytics_ignores WHERE kind=?`, kind)
	return err
}

// ---- 已忽略 ----

// Ignore 一条已忽略记录：ResID 为资源 ID（云主机 ID / 计算节点名 / 存储池名 / 云硬盘 ID）。
type Ignore struct {
	Kind       string    `json:"kind"`
	ProviderID string    `json:"providerId"`
	ResID      string    `json:"resId"`
	Name       string    `json:"name"`
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
		if err := rows.Scan(&g.Kind, &g.ProviderID, &g.ResID, &g.Name, &g.CreatedBy, &g.CreatedAt); err != nil {
			return nil, err
		}
		out[g.ProviderID+"/"+g.ResID] = g
	}
	return out, rows.Err()
}

// SetIgnore 忽略 / 取消忽略一批资源的某条策略建议。
func (s *Store) SetIgnore(ctx context.Context, kind string, items []Ignore, on bool, by string) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	n := 0
	for _, it := range items {
		if it.ProviderID == "" || it.ResID == "" {
			continue
		}
		if on {
			_, err = tx.ExecContext(ctx, `INSERT INTO analytics_ignores(kind,provider_id,vm_id,vm_name,created_by,created_at) VALUES(?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE vm_name=VALUES(vm_name)`, kind, it.ProviderID, it.ResID, trunc(it.Name, 250), by, time.Now().UTC())
		} else {
			_, err = tx.ExecContext(ctx, `DELETE FROM analytics_ignores WHERE kind=? AND provider_id=? AND vm_id=?`, kind, it.ProviderID, it.ResID)
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
