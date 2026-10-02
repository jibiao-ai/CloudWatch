package analytics

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

// Opt2 筛选下拉项（带所属云账号，前端据此级联）。
type Opt2 struct {
	Value      string `json:"value"`
	Label      string `json:"label"`
	ProviderID string `json:"providerId"`
	Cluster    string `json:"cluster,omitempty"` // 宿主机 / 存储器选项所属集群，供前端级联过滤
}

// UsageWindowDays 云主机明细里「使用率」的统计窗口。
const UsageWindowDays = 7

func (x *plat) clusterList() []string {
	set := map[string]bool{}
	for _, h := range x.hosts {
		set[x.clusterOf(s(h, "name"))] = true
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return natLess(out[i], out[j]) })
	return out
}

// ---------- 基础资源分析 ----------

// HostVM 宿主机上的云主机分布。
type HostVM struct {
	Host    string `json:"host"`
	Running int    `json:"running"`
	Stopped int    `json:"stopped"`
}

// BaseOptions 筛选项。
type BaseOptions struct {
	Accounts []Opt2 `json:"accounts"`
	Clusters []Opt2 `json:"clusters"`
	Hosts    []Opt2 `json:"hosts"`
	Pools    []Opt2 `json:"pools"`
}

// Base 基础资源分析页。
type Base struct {
	Rates   RatesOut    `json:"rates"`
	Options BaseOptions `json:"options"`
	Hosts   []Dist      `json:"hostDist"`
	Pools   []Dist      `json:"poolDist"`
	HostVMs []HostVM    `json:"hostVms"`
}

func (e *Engine) Base(ctx context.Context, plats []capacity.Platform, flt Filter) (*Base, error) {
	all, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	b := &Base{Options: BaseOptions{Accounts: []Opt2{}, Clusters: []Opt2{}, Hosts: []Opt2{}, Pools: []Opt2{}}, HostVMs: []HostVM{}}
	for _, x := range all {
		b.Options.Accounts = append(b.Options.Accounts, Opt2{Value: x.ID, Label: x.Name, ProviderID: x.ID})
		for _, c := range x.clusterList() {
			b.Options.Clusters = append(b.Options.Clusters, Opt2{Value: hostKey(x.ID, c), Label: c, ProviderID: x.ID})
		}
		for _, h := range x.hosts {
			b.Options.Hosts = append(b.Options.Hosts, Opt2{Value: hostKey(x.ID, s(h, "name")), Label: s(h, "name"), ProviderID: x.ID, Cluster: hostKey(x.ID, x.clusterOf(s(h, "name")))})
		}
		for _, p := range x.pools {
			b.Options.Pools = append(b.Options.Pools, Opt2{Value: hostKey(x.ID, s(p, "name")), Label: s(p, "name"), ProviderID: x.ID})
		}
	}
	ps := all
	if flt.ProviderID != "" {
		ps = nil
		for _, x := range all {
			if x.ID == flt.ProviderID {
				ps = append(ps, x)
			}
		}
	}
	b.Rates = e.rates(ps, flt).out()
	hd, pd := map[string]int{}, map[string]int{}
	for _, x := range ps {
		hs := x.hostSel(flt)
		if len(hs) > 0 {
			hd[x.Name] += len(hs)
		}
		if n := len(x.poolSel(flt)); n > 0 {
			pd[x.Name] += n
		}
		run, stop := map[string]int{}, map[string]int{}
		for _, v := range x.vms {
			switch stateGroup(s(v, "status")) {
			case "running":
				run[s(v, "node")]++
			case "stopped":
				stop[s(v, "node")]++
			}
		}
		for _, h := range hs {
			n := s(h, "name")
			b.HostVMs = append(b.HostVMs, HostVM{Host: n, Running: run[n], Stopped: stop[n]})
		}
	}
	b.Hosts, b.Pools = distOf(hd), distOf(pd)
	return b, nil
}

// BandChart 使用率分布图：区间名 + 时间序列。
type BandChart struct {
	Names  []string    `json:"names"`
	Points []BandPoint `json:"points"`
}

func bucketFor(from, to time.Time) int64 {
	span := to.Sub(from)
	switch {
	case span <= 36*time.Hour:
		return 1800
	case span <= 4*24*time.Hour:
		return 3600
	case span <= 12*24*time.Hour:
		return 6 * 3600
	case span <= 60*24*time.Hour:
		return 24 * 3600
	}
	return 7 * 24 * 3600
}

// ParseRange 解析 yyyy-mm-dd（东八区）起止日期；缺省近 7 天，跨度最多 366 天。
func ParseRange(fromS, toS string) (time.Time, time.Time) {
	now := time.Now().In(CST)
	to := now
	if t, err := time.ParseInLocation("2006-01-02", toS, CST); err == nil {
		to = t.Add(24*time.Hour - time.Second)
		if to.After(now) {
			to = now
		}
	}
	from := to.AddDate(0, 0, -7)
	if t, err := time.ParseInLocation("2006-01-02", fromS, CST); err == nil {
		from = t
	}
	if from.After(to) {
		from = to.AddDate(0, 0, -7)
	}
	if to.Sub(from) > 366*24*time.Hour {
		from = to.AddDate(0, 0, -366)
	}
	return from, to
}

// BaseBands 宿主机 / 存储器按使用率分布。metric: cpu | mem | storage。
func (e *Engine) BaseBands(ctx context.Context, plats []capacity.Platform, flt Filter, metric string, from, to time.Time) (*BandChart, error) {
	ps, err := e.load(ctx, plats, flt.ProviderID)
	if err != nil {
		return nil, err
	}
	targets := map[string]bool{}
	var pids []string
	m := "node_cpu_percent"
	switch metric {
	case "mem":
		m = "node_mem_percent"
	case "storage":
		m = "pool_used_percent"
	}
	for _, x := range ps {
		pids = append(pids, x.ID)
		if metric == "storage" {
			for _, p := range x.poolSel(flt) {
				targets[hostKey(x.ID, s(p, "name"))] = true
			}
		} else {
			for _, h := range x.hostSel(flt) {
				targets[hostKey(x.ID, s(h, "name"))] = true
			}
		}
	}
	out := &BandChart{Names: Bands, Points: []BandPoint{}}
	if len(pids) == 0 || len(targets) == 0 {
		return out, nil
	}
	pts, err := e.St.metricBands(ctx, m, pids, targets, from, to, bucketFor(from, to))
	if err != nil {
		return nil, err
	}
	if pts != nil {
		out.Points = pts
	}
	return out, nil
}

// ---------- 宿主机 / 存储器明细 ----------

// HostCols 宿主机明细导出列。
var HostCols = []Col{{"name", "宿主机"}, {"account", "云账号"}, {"cluster", "集群"}, {"ip", "IP地址"}, {"stateText", "状态"}, {"runningVms", "运行中云主机"},
	{"vcpus", "vCPU(已分配/总量)"}, {"cpuAlloc", "CPU分配率"}, {"memAlloc", "内存分配率"}, {"cpuUse", "CPU使用率"}, {"memUse", "内存使用率"}}

// PoolCols 存储器明细导出列。
var PoolCols = []Col{{"name", "存储器"}, {"account", "云账号"}, {"backend", "后端名称"}, {"statusText", "状态"}, {"totalGb", "总容量(G)"}, {"usedGb", "已用(G)"}, {"usedPercent", "使用率"}, {"allocPercent", "分配率"}}

// Col 导出列。
type Col struct{ Key, Title string }

func (e *Engine) HostRows(ctx context.Context, plats []capacity.Platform, q ListQuery) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, q.Filter.ProviderID)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, x := range ps {
		mon := map[string]*float64{}
		monMem := map[string]*float64{}
		for _, n := range x.snap.Nodes {
			mon[short(n.Name)], monMem[short(n.Name)] = n.CPUPercent, n.MemPercent
		}
		for _, h := range x.hostSel(q.Filter) {
			name := s(h, "name")
			if !match(q, map[string]string{"name": name, "ip": s(h, "hostIp")}) {
				continue
			}
			cu, mu := f(h, "vcpuPercent"), f(h, "memPercent")
			if v := mon[name]; v != nil {
				cu = v
			}
			if v := monMem[name]; v != nil {
				mu = v
			}
			rows = append(rows, map[string]any{
				"key": hostKey(x.ID, name), "name": name, "account": x.Name, "cluster": x.clusterOf(name), "ip": s(h, "hostIp"),
				"state": s(h, "state"), "stateText": s(h, "stateText"), "runningVms": fv(h, "runningVms"),
				"vcpus":    trimNum(fv(h, "vcpusUsed")) + " / " + trimNum(fv(h, "vcpusCap")),
				"cpuAlloc": nv(f(h, "vcpuPercent")), "memAlloc": nv(f(h, "memPercent")), "cpuUse": nv(cu), "memUse": nv(mu),
			})
		}
	}
	return rows, nil
}

func (e *Engine) PoolRows(ctx context.Context, plats []capacity.Platform, q ListQuery) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, q.Filter.ProviderID)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, x := range ps {
		for _, p := range x.poolSel(q.Filter) {
			name := s(p, "name")
			if !match(q, map[string]string{"name": name}) {
				continue
			}
			alloc := fv(p, "allocatedGb")
			if alloc == 0 {
				alloc = fv(p, "provisionedGb")
			}
			rows = append(rows, map[string]any{
				"key": hostKey(x.ID, name), "name": name, "account": x.Name, "backend": s(p, "backendName"),
				"status": s(p, "status"), "statusText": s(p, "statusText"),
				"totalGb": nv(f(p, "totalGb")), "usedGb": nv(f(p, "usedGb")), "usedPercent": nv(f(p, "usedPercent")), "allocPercent": nv(pct(alloc, fv(p, "totalGb"))),
			})
		}
	}
	return rows, nil
}

// ---------- 云主机分析 ----------

// VMAnalysis 云主机分析页。
type VMAnalysis struct {
	Accounts []Dist   `json:"accounts"`
	Status   []Dist   `json:"status"`
	Options  VMOption `json:"options"`
}

// VMOption 云主机分析筛选项。
type VMOption struct {
	Accounts []Opt2 `json:"accounts"`
	Hosts    []Opt2 `json:"hosts"`
}

func (e *Engine) VMAnalysis(ctx context.Context, plats []capacity.Platform, flt Filter) (*VMAnalysis, error) {
	all, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	out := &VMAnalysis{Options: VMOption{Accounts: []Opt2{}, Hosts: []Opt2{}}}
	var ps []*plat
	acc, st := map[string]int{}, map[string]int{}
	for _, x := range all {
		out.Options.Accounts = append(out.Options.Accounts, Opt2{Value: x.ID, Label: x.Name, ProviderID: x.ID})
		for _, h := range x.hosts {
			out.Options.Hosts = append(out.Options.Hosts, Opt2{Value: hostKey(x.ID, s(h, "name")), Label: s(h, "name"), ProviderID: x.ID, Cluster: hostKey(x.ID, x.clusterOf(s(h, "name")))})
		}
		if flt.ProviderID != "" && flt.ProviderID != x.ID {
			continue
		}
		y := *x
		y.vms = x.vmSel(flt)
		ps = append(ps, &y)
		for _, v := range y.vms {
			acc[x.Name]++
			st[stateGroupText[stateGroup(s(v, "status"))]]++
		}
	}
	out.Accounts, out.Status = distOf(acc), distOf(st)
	return out, nil
}

// VMBands 云主机按使用率分布（每天落入各区间的云主机数）。
func (e *Engine) VMBands(ctx context.Context, plats []capacity.Platform, flt Filter, mem bool, from, to time.Time) (*BandChart, error) {
	ps, err := e.load(ctx, plats, flt.ProviderID)
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for _, x := range ps {
		for _, v := range x.vmSel(flt) {
			ids[x.ID+"/"+s(v, "id")] = true
		}
	}
	out := &BandChart{Names: Bands, Points: []BandPoint{}}
	if len(ids) == 0 {
		return out, nil
	}
	days, err := e.St.vmBandsByDay(ctx, flt.ProviderID, ids, from, to, mem)
	if err != nil {
		return nil, err
	}
	for _, d := range days {
		t, _ := time.ParseInLocation("2006-01-02", d.Day, CST)
		out.Points = append(out.Points, BandPoint{T: t.UnixMilli(), Bands: d.Bands})
	}
	return out, nil
}

// VMCols 云主机明细导出列。
var VMCols = []Col{{"name", "名称"}, {"account", "云账号"}, {"flavor", "实例规格"}, {"ips", "IP地址"}, {"statusText", "状态"}, {"host", "宿主机"},
	{"cpuAvg", "CPU平均使用率"}, {"cpuMax", "CPU最大使用率"}, {"memAvg", "内存平均使用率"}, {"memMax", "内存最大使用率"}}

func (e *Engine) VMRows(ctx context.Context, plats []capacity.Platform, q ListQuery) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, q.Filter.ProviderID)
	if err != nil {
		return nil, err
	}
	use, err := e.St.usageSince(ctx, q.Filter.ProviderID, time.Now().In(CST).AddDate(0, 0, -(UsageWindowDays-1)))
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, x := range ps {
		for _, r := range x.vmSel(q.Filter) {
			ips := ipList(r)
			if !match(q, map[string]string{"name": s(r, "name"), "ip": strings.Join(ips, " ")}) {
				continue
			}
			u := use[x.ID+"/"+s(r, "id")]
			row := map[string]any{
				"key": x.ID + "/" + s(r, "id"), "name": s(r, "name"), "account": x.Name, "flavor": flavorText(r),
				"ips": strings.Join(ips, ", "), "ipList": ips, "status": strings.ToLower(s(r, "status")), "statusText": s(r, "statusText"),
				"host":   s(r, "node"),
				"cpuAvg": nil, "cpuMax": nil, "memAvg": nil, "memMax": nil,
			}
			if u != nil {
				row["cpuAvg"], row["cpuMax"], row["memAvg"], row["memMax"] = nv(u.CPUAvg), nv(u.CPUMax), nv(u.MemAvg), nv(u.MemMax)
			}
			rows = append(rows, row)
		}
	}
	return rows, nil
}

// ---------- 磁盘分析 ----------

// DiskAnalysis 磁盘分析页（unit=gb 时数值为容量 GB，否则为块数）。
type DiskAnalysis struct {
	Accounts []Dist `json:"accounts"`
	Mount    []Dist `json:"mount"`
	Types    []Dist `json:"types"`
	Options  []Opt2 `json:"accounts_opt"`
	Unit     string `json:"unit"`
}

func mountOf(status string) string {
	switch strings.ToLower(status) {
	case "available":
		return "空闲"
	case "in-use":
		return "已挂载"
	}
	return "其他"
}

func (e *Engine) DiskAnalysis(ctx context.Context, plats []capacity.Platform, pid, unit string) (*DiskAnalysis, error) {
	all, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	gb := unit == "gb"
	out := &DiskAnalysis{Options: []Opt2{}, Unit: "count"}
	if gb {
		out.Unit = "gb"
	}
	w := func(r capacity.Row) int {
		if gb {
			return int(fv(r, "sizeGb"))
		}
		return 1
	}
	acc, mnt, typ := map[string]int{}, map[string]int{}, map[string]int{}
	for _, x := range all {
		out.Options = append(out.Options, Opt2{Value: x.ID, Label: x.Name, ProviderID: x.ID})
		if pid != "" && pid != x.ID {
			continue
		}
		for _, v := range x.vols {
			n := w(v)
			acc[x.Name] += n
			mnt[mountOf(s(v, "status"))] += n
			t := s(v, "volumeType")
			if t == "" {
				t = "未知"
			}
			typ[t] += n
		}
	}
	out.Accounts, out.Mount, out.Types = distOf(acc), distOf(mnt), distOf(typ)
	return out, nil
}

// DiskCols 磁盘明细导出列。
var DiskCols = []Col{{"name", "名称"}, {"account", "云账号"}, {"az", "集群/可用区"}, {"server", "所属云主机"}, {"statusText", "状态"}, {"sizeGb", "大小(G)"}}

func (e *Engine) DiskRows(ctx context.Context, plats []capacity.Platform, q ListQuery) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, q.Filter.ProviderID)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, x := range ps {
		for _, v := range x.vols {
			if !match(q, map[string]string{"name": s(v, "name"), "ip": ""}) {
				continue
			}
			rows = append(rows, map[string]any{
				"key": x.ID + "/" + s(v, "id"), "name": s(v, "name"), "account": x.Name, "az": s(v, "az"),
				"server": s(v, "serverNames"), "status": s(v, "status"), "statusText": s(v, "statusText"),
				"sizeGb": nv(f(v, "sizeGb")), "volumeType": s(v, "volumeType"),
			})
		}
	}
	return rows, nil
}
