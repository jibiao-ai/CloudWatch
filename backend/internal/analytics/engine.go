package analytics

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

// Engine 运营中心聚合：只读配置中心 / 监控中心 / 本包历史表的已落库数据。
type Engine struct {
	St  *Store
	Cap *capacity.Store
	Mon *monitor.Store
}

// plat 一个平台的已加载数据。
type plat struct {
	capacity.Platform
	vms, vols, hosts, pools, phys []capacity.Row
	snap                          *monitor.Snapshot
	meta                          *capacity.Meta    // 配置中心最近一次采集状态
	clusters                      map[string]string // 计算节点名 → 集群
}

// Filter 通用筛选（所属云平台 / 集群 / 计算节点 / 存储器）。计算节点、存储器、集群的取值均为 "平台ID/名称"。
type Filter struct {
	ProviderID, Cluster, Host, Pool string
}

func hostKey(pid, name string) string { return pid + "/" + name }

func (e *Engine) load(ctx context.Context, plats []capacity.Platform, pid string) ([]*plat, error) {
	var out []*plat
	for _, p := range plats {
		if pid != "" && pid != p.ID {
			continue
		}
		x := &plat{Platform: p, clusters: map[string]string{}}
		var err error
		if x.vms, x.meta, err = e.Cap.Rows(ctx, p, "vms"); err != nil {
			return nil, err
		}
		x.vols, _, _ = e.Cap.Rows(ctx, p, "volumes")
		x.hosts, _, _ = e.Cap.Rows(ctx, p, "nodes")
		x.pools, _, _ = e.Cap.Rows(ctx, p, "pools")
		x.phys, _, _ = e.Cap.Rows(ctx, p, "phys")
		if x.snap, err = e.Mon.Snapshot(ctx, p.ID); err != nil {
			return nil, err
		}
		for _, r := range x.phys { // 集群：物理节点上报的 cluster_id（按主机名与计算节点对应）
			if c := s(r, "clusterId"); c != "" {
				if _, err := strconv.Atoi(c); err == nil { // 纯数字的集群 ID 补上前缀，页面上更易读
					c = "集群 " + c
				}
				x.clusters[short(s(r, "hostname"))] = c
			}
		}
		out = append(out, x)
	}
	return out, nil
}

func (x *plat) clusterOf(host string) string {
	if c := x.clusters[host]; c != "" {
		return c
	}
	return "默认集群"
}

// hostSel 满足筛选条件的计算节点行。
func (x *plat) hostSel(f Filter) []capacity.Row {
	var out []capacity.Row
	for _, r := range x.hosts {
		name := s(r, "name")
		if f.Host != "" && f.Host != hostKey(x.ID, name) {
			continue
		}
		if f.Cluster != "" && f.Cluster != hostKey(x.ID, x.clusterOf(name)) {
			continue
		}
		out = append(out, r)
	}
	return out
}

func (x *plat) poolSel(f Filter) []capacity.Row {
	var out []capacity.Row
	for _, r := range x.pools {
		if f.Pool != "" && f.Pool != hostKey(x.ID, s(r, "name")) {
			continue
		}
		out = append(out, r)
	}
	return out
}

// vmSel 满足筛选条件的云主机（计算节点 / 集群筛选按所在节点）。
func (x *plat) vmSel(f Filter) []capacity.Row {
	if f.Host == "" && f.Cluster == "" {
		return x.vms
	}
	ok := map[string]bool{}
	for _, h := range x.hostSel(f) {
		ok[s(h, "name")] = true
	}
	var out []capacity.Row
	for _, r := range x.vms {
		if ok[s(r, "node")] {
			out = append(out, r)
		}
	}
	return out
}

// ---------- 比率（分配率 / 使用率） ----------

// Rates 三项资源的分配率与使用率（百分比，nil 表示无数据）。
type Rates struct {
	AllocCPU, AllocMem, AllocStorage *float64
	UseCPU, UseMem, UseStorage       *float64
}

func (e *Engine) rates(ps []*plat, flt Filter) Rates {
	var vu, vc, mu, mc, pa, pt, pused float64
	var cpuSum, memSum float64
	var cpuN, memN int
	for _, x := range ps {
		mon := map[string]monitor.Node{}
		for _, n := range x.snap.Nodes {
			mon[short(n.Name)] = n
		}
		for _, h := range x.hostSel(flt) {
			vu += fv(h, "vcpusUsed")
			vc += fv(h, "vcpusCap")
			mu += fv(h, "memoryMbUsed")
			mc += fv(h, "memoryMbCap")
			cpu, mem := f(h, "vcpuPercent"), f(h, "memPercent")
			if n, ok := mon[s(h, "name")]; ok { // 监控中心的实时使用率优先
				if n.CPUPercent != nil {
					cpu = n.CPUPercent
				}
				if n.MemPercent != nil {
					mem = n.MemPercent
				}
			}
			if cpu != nil {
				cpuSum, cpuN = cpuSum+*cpu, cpuN+1
			}
			if mem != nil {
				memSum, memN = memSum+*mem, memN+1
			}
		}
		for _, p := range x.poolSel(flt) {
			pt += fv(p, "totalGb")
			pused += fv(p, "usedGb")
			a := fv(p, "allocatedGb")
			if a == 0 {
				a = fv(p, "provisionedGb")
			}
			pa += a
		}
	}
	r := Rates{AllocCPU: pct(vu, vc), AllocMem: pct(mu, mc), AllocStorage: pct(pa, pt), UseStorage: pct(pused, pt)}
	if cpuN > 0 {
		r.UseCPU = ptr(round1(cpuSum / float64(cpuN)))
	}
	if memN > 0 {
		r.UseMem = ptr(round1(memSum / float64(memN)))
	}
	return r
}

// ---------- 总览 ----------

// PlatformRow 所属云平台汇总（资源数量 + 资产采集状态）。
type PlatformRow struct {
	ProviderID  string     `json:"providerId"`
	Name        string     `json:"name"`
	EnvType     string     `json:"envType"`
	ConsoleIP   string     `json:"consoleIp"`
	VMs         int        `json:"vms"`
	Disks       int        `json:"disks"`
	Hosts       int        `json:"hosts"`
	Pools       int        `json:"pools"`
	CollectedAt *time.Time `json:"collectedAt"`
	OK          bool       `json:"ok"`
	Error       string     `json:"error"`
}

// Overview 总览页数据。
type Overview struct {
	Totals      map[string]int `json:"totals"`
	Platforms   []PlatformRow  `json:"platforms"`
	Rates       RatesOut       `json:"rates"`
	Suggestions []Suggest      `json:"suggestions"`
}

// RatesOut 比率的 JSON 形态。
type RatesOut struct {
	Alloc map[string]*float64 `json:"alloc"`
	Use   map[string]*float64 `json:"use"`
}

func (r Rates) out() RatesOut {
	return RatesOut{
		Alloc: map[string]*float64{"cpu": r.AllocCPU, "mem": r.AllocMem, "storage": r.AllocStorage},
		Use:   map[string]*float64{"cpu": r.UseCPU, "mem": r.UseMem, "storage": r.UseStorage},
	}
}

// Overview 汇总所有所属云平台。
func (e *Engine) Overview(ctx context.Context, plats []capacity.Platform) (*Overview, error) {
	ps, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	o := &Overview{Totals: map[string]int{"platforms": len(ps)}, Platforms: []PlatformRow{}}
	for _, x := range ps {
		row := PlatformRow{ProviderID: x.ID, Name: x.Name, EnvType: x.EnvType, ConsoleIP: x.ConsoleIP, VMs: len(x.vms), Disks: len(x.vols), Hosts: len(x.hosts), Pools: len(x.pools)}
		if x.meta != nil {
			row.CollectedAt, row.OK, row.Error = x.meta.CollectedAt, x.meta.OK, x.meta.Error
		}
		o.Platforms = append(o.Platforms, row)
		o.Totals["vms"] += len(x.vms)
		o.Totals["disks"] += len(x.vols)
		o.Totals["hosts"] += len(x.hosts)
		o.Totals["pools"] += len(x.pools)
	}
	o.Rates = e.rates(ps, Filter{}).out()
	if o.Suggestions, err = e.suggestions(ctx, ps); err != nil {
		return nil, err
	}
	return o, nil
}

// ---------- 趋势 ----------

// TrendSeries 一个所属云平台的趋势线。
type TrendSeries struct {
	ProviderID string  `json:"providerId"`
	Name       string  `json:"name"`
	Points     []Point `json:"points"`
}

var ranges = map[string]struct {
	Days   int
	Bucket int64
}{
	"7d": {7, 3600}, "30d": {30, 6 * 3600}, "180d": {180, 86400}, "365d": {365, 86400},
}

// Trend 云主机 / 磁盘数量趋势。kind: vm | disk（unit=gb 时为磁盘容量）。
func (e *Engine) Trend(ctx context.Context, plats []capacity.Platform, kind, rng, pid, unit string) ([]TrendSeries, error) {
	r, ok := ranges[rng]
	if !ok {
		r = ranges["7d"]
	}
	col := "vms"
	if kind == "disk" {
		col = "disks"
		if unit == "gb" {
			col = "disk_gb"
		}
	}
	since := time.Now().Add(-time.Duration(r.Days) * 24 * time.Hour)
	out := []TrendSeries{}
	for _, p := range plats {
		if pid != "" && pid != p.ID {
			continue
		}
		pts, err := e.St.CountTrend(ctx, p.ID, col, since, r.Bucket)
		if err != nil {
			return nil, err
		}
		out = append(out, TrendSeries{ProviderID: p.ID, Name: p.Name, Points: pts})
	}
	return out, nil
}

// ---------- 通用：分页 / 排序 ----------

// Page 分页结果。
type Page struct {
	List     []map[string]any `json:"list"`
	Total    int              `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
}

// ListQuery 明细列表查询。
type ListQuery struct {
	Field, Keyword       string // 搜索字段 name | ip，关键字
	SortKey, SortOrder   string
	Page, PageSize       int
	Filter               Filter
	Kind, Ignored, State string
	Side                 string // 优化建议：kind 为空时按 vm | phys 汇总，空为全部
}

// Sort 稳定排序（空值恒排最后，字符串自然序）。
func Sort(rows []map[string]any, key, order string) {
	if key != "" {
		desc := order == "desc"
		sort.SliceStable(rows, func(i, j int) bool {
			a, b := rows[i][key], rows[j][key]
			an, bn := a == nil || a == "", b == nil || b == ""
			if an || bn {
				return !an && bn // 空值恒排最后
			}
			if fa, ok := a.(float64); ok {
				if fb, ok2 := b.(float64); ok2 {
					if desc {
						return fa > fb
					}
					return fa < fb
				}
			}
			sa, sb := strings.ToLower(toStr(a)), strings.ToLower(toStr(b))
			if desc {
				return natLess(sb, sa)
			}
			return natLess(sa, sb)
		})
	}
}

// Paginate 排序并分页。
func Paginate(rows []map[string]any, q ListQuery) *Page {
	Sort(rows, q.SortKey, q.SortOrder)
	if q.PageSize < 1 || q.PageSize > 500 {
		q.PageSize = 10
	}
	if q.Page < 1 {
		q.Page = 1
	}
	total := len(rows)
	from := (q.Page - 1) * q.PageSize
	if from > total {
		from = 0
		q.Page = 1
	}
	to := from + q.PageSize
	if to > total {
		to = total
	}
	return &Page{List: rows[from:to], Total: total, Page: q.Page, PageSize: q.PageSize}
}

func toStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case nil:
		return ""
	}
	return strings.TrimSpace(strings.Trim(strings.ReplaceAll(fmt.Sprint(v), "\n", " "), " "))
}

func match(q ListQuery, fields map[string]string) bool {
	k := strings.ToLower(strings.TrimSpace(q.Keyword))
	if k == "" {
		return true
	}
	field := q.Field
	if field == "" {
		field = "name"
	}
	return strings.Contains(strings.ToLower(fields[field]), k)
}
