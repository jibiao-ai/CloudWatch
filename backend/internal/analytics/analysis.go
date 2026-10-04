package analytics

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

// Opt2 筛选下拉项（带所属所属云平台，前端据此级联）。
type Opt2 struct {
	Value      string `json:"value"`
	Label      string `json:"label"`
	ProviderID string `json:"providerId"`
	Cluster    string `json:"cluster,omitempty"` // 计算节点 / 存储器选项所属集群，供前端级联过滤
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

// HostVM 计算节点上的云主机分布。
type HostVM struct {
	Host    string `json:"host"`
	Running int    `json:"running"`
	Stopped int    `json:"stopped"`
}

// BaseOptions 筛选项。
type BaseOptions struct {
	Platforms []Opt2 `json:"platforms"`
	Clusters  []Opt2 `json:"clusters"`
	Hosts     []Opt2 `json:"hosts"`
	Pools     []Opt2 `json:"pools"`
}

// BackendRate 一套存储后端（同一平台下按后端名称归并）的容量、分配率与使用率。
type BackendRate struct {
	Key          string   `json:"key"`
	Name         string   `json:"name"`
	Platform     string   `json:"platform"`
	Pools        int      `json:"pools"`
	TotalGb      float64  `json:"totalGb"`
	AllocPercent *float64 `json:"allocPercent"`
	UsedPercent  *float64 `json:"usedPercent"`
}

// Base 基础资源分析页。
type Base struct {
	Rates    RatesOut      `json:"rates"`
	Backends []BackendRate `json:"backends"`
	Options  BaseOptions   `json:"options"`
	Hosts    []Dist        `json:"hostDist"`
	Pools    []Dist        `json:"poolDist"`
	HostVMs  []HostVM      `json:"hostVms"`
}

// backendRates 按「平台 + 后端名称」归并存储池，逐套存储后端计算分配率 / 使用率。
func backendRates(ps []*plat, flt Filter) []BackendRate {
	type acc struct {
		BackendRate
		alloc, used float64
	}
	idx := map[string]*acc{}
	var order []string
	for _, x := range ps {
		for _, p := range x.poolSel(flt) {
			name := poolName(p)
			k := hostKey(x.ID, name)
			a := idx[k]
			if a == nil {
				a = &acc{BackendRate: BackendRate{Key: k, Name: name, Platform: x.Name}}
				idx[k] = a
				order = append(order, k)
			}
			a.Pools++
			a.TotalGb += fv(p, "totalGb")
			a.used += fv(p, "usedGb")
			al := fv(p, "allocatedGb")
			if al == 0 {
				al = fv(p, "provisionedGb")
			}
			a.alloc += al
		}
	}
	out := make([]BackendRate, 0, len(order))
	for _, k := range order {
		a := idx[k]
		a.AllocPercent, a.UsedPercent = pct(a.alloc, a.TotalGb), pct(a.used, a.TotalGb)
		out = append(out, a.BackendRate)
	}
	sort.SliceStable(out, func(i, j int) bool { return natLess(out[i].Name, out[j].Name) })
	return out
}

// poolLabels 存储池筛选项的显示名：以后端名称显示，同一平台下后端名称重复时追加存储池名以便区分。
func poolLabels(x *plat) map[string]string {
	cnt := map[string]int{}
	for _, p := range x.pools {
		cnt[poolName(p)]++
	}
	out := map[string]string{}
	for _, p := range x.pools {
		n := poolName(p)
		if cnt[n] > 1 {
			n += " · " + s(p, "poolName")
		}
		out[s(p, "name")] = n
	}
	return out
}

func (e *Engine) Base(ctx context.Context, plats []capacity.Platform, flt Filter) (*Base, error) {
	all, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	b := &Base{Options: BaseOptions{Platforms: []Opt2{}, Clusters: []Opt2{}, Hosts: []Opt2{}, Pools: []Opt2{}}, HostVMs: []HostVM{}}
	for _, x := range all {
		b.Options.Platforms = append(b.Options.Platforms, Opt2{Value: x.ID, Label: x.Name, ProviderID: x.ID})
		for _, c := range x.clusterList() {
			b.Options.Clusters = append(b.Options.Clusters, Opt2{Value: hostKey(x.ID, c), Label: c, ProviderID: x.ID})
		}
		for _, h := range x.hosts {
			b.Options.Hosts = append(b.Options.Hosts, Opt2{Value: hostKey(x.ID, s(h, "name")), Label: s(h, "name"), ProviderID: x.ID, Cluster: hostKey(x.ID, x.clusterOf(s(h, "name")))})
		}
		lb := poolLabels(x)
		for _, p := range x.pools {
			b.Options.Pools = append(b.Options.Pools, Opt2{Value: hostKey(x.ID, s(p, "name")), Label: lb[s(p, "name")], ProviderID: x.ID})
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
	b.Backends = backendRates(ps, flt)
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

// BaseBands 计算节点 / 存储器按使用率分布。metric: cpu | mem | storage。
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

// Col 导出列。
type Col struct{ Key, Title string }

// HostRows 监控中心「计算节点」：某一云平台的计算节点分配率（来自 Nova 超分配）与使用率（监控中心实时），比率统一保留 1 位小数。
func (e *Engine) HostRows(ctx context.Context, plats []capacity.Platform, providerID string) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, providerID)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, x := range ps {
		cpu, mem := map[string]*float64{}, map[string]*float64{}
		for _, n := range x.snap.Nodes {
			cpu[short(n.Name)], mem[short(n.Name)] = n.CPUPercent, n.MemPercent
		}
		r1 := func(p *float64) any {
			if p == nil {
				return nil
			}
			return round1(*p)
		}
		for _, h := range x.hosts {
			name := s(h, "name")
			cu, mu := f(h, "vcpuPercent"), f(h, "memPercent")
			if v := cpu[name]; v != nil {
				cu = v
			}
			if v := mem[name]; v != nil {
				mu = v
			}
			rows = append(rows, map[string]any{
				"name": name, "ip": s(h, "hostIp"), "state": s(h, "state"), "stateText": s(h, "stateText"), "stateTone": s(h, "stateTone"), "runningVms": fv(h, "runningVms"),
				"vcpusUsed": fv(h, "vcpusUsed"), "vcpusCap": fv(h, "vcpusCap"),
				"cpuAlloc": r1(f(h, "vcpuPercent")), "memAlloc": r1(f(h, "memPercent")), "cpuUse": r1(cu), "memUse": r1(mu),
			})
		}
	}
	return rows, nil
}

// PoolRows 监控中心「集群存储」：某一云平台的存储后端（字段与配置中心「集群存储」一致 + 分配率），比率统一保留 1 位小数。
func (e *Engine) PoolRows(ctx context.Context, plats []capacity.Platform, providerID string) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, providerID)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, x := range ps {
		for _, p := range x.pools {
			alloc := fv(p, "allocatedGb")
			if alloc == 0 {
				alloc = fv(p, "provisionedGb")
			}
			used := f(p, "usedPercent")
			if used != nil {
				used = ptr(round1(*used))
			}
			rows = append(rows, map[string]any{
				"name": s(p, "name"), "backendName": poolName(p), "poolName": s(p, "poolName"),
				"totalGb": nv(f(p, "totalGb")), "freeGb": nv(f(p, "freeGb")), "usedGb": nv(f(p, "usedGb")), "allocatedGb": nv(f(p, "allocatedGb")), "provisionedGb": nv(f(p, "provisionedGb")),
				"usedPercent": nv(used), "allocPercent": nv(pct(alloc, fv(p, "totalGb"))),
				"vendorName": s(p, "vendorName"), "vendorText": s(p, "vendorText"), "protocolText": s(p, "protocolText"), "status": s(p, "status"), "statusText": s(p, "statusText"), "statusTone": s(p, "statusTone"),
			})
		}
	}
	return rows, nil
}

// VMUsageStat 一台云主机统计窗口内的使用率汇总（监控中心「虚拟机」的 CPU / 内存最大使用率列）。
type VMUsageStat struct {
	CPUAvg *float64 `json:"cpuAvg"`
	CPUMax *float64 `json:"cpuMax"`
	MemAvg *float64 `json:"memAvg"`
	MemMax *float64 `json:"memMax"`
	Days   int      `json:"days"`
}

// VMUsageDays 监控中心云主机最大 / 平均使用率的统计窗口。
const VMUsageDays = 30

// VMUsage 某一云平台各云主机近 VMUsageDays 天的使用率汇总，键为云主机 ID。
func (e *Engine) VMUsage(ctx context.Context, providerID string) (map[string]VMUsageStat, error) {
	use, err := e.St.usageSince(ctx, providerID, time.Now().In(CST).AddDate(0, 0, -(VMUsageDays-1)))
	if err != nil {
		return nil, err
	}
	out := map[string]VMUsageStat{}
	for k, u := range use {
		out[strings.TrimPrefix(k, providerID+"/")] = VMUsageStat{CPUAvg: u.CPUAvg, CPUMax: u.CPUMax, MemAvg: u.MemAvg, MemMax: u.MemMax, Days: u.Days}
	}
	return out, nil
}

// ---------- 虚拟机分析 ----------

// VMAnalysis 虚拟机分析页。
type VMAnalysis struct {
	Platforms []Dist   `json:"platforms"`
	Status    []Dist   `json:"status"`
	Options   VMOption `json:"options"`
}

// VMOption 虚拟机分析筛选项。
type VMOption struct {
	Platforms []Opt2 `json:"platforms"`
	Hosts     []Opt2 `json:"hosts"`
}

func (e *Engine) VMAnalysis(ctx context.Context, plats []capacity.Platform, flt Filter) (*VMAnalysis, error) {
	all, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	out := &VMAnalysis{Options: VMOption{Platforms: []Opt2{}, Hosts: []Opt2{}}}
	var ps []*plat
	acc, st := map[string]int{}, map[string]int{}
	for _, x := range all {
		out.Options.Platforms = append(out.Options.Platforms, Opt2{Value: x.ID, Label: x.Name, ProviderID: x.ID})
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
	out.Platforms, out.Status = distOf(acc), distOf(st)
	return out, nil
}

// VMBands 虚拟机按使用率分布（每天落入各区间的云主机数）。
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

// ---------- 磁盘分析 ----------

// DiskAnalysis 磁盘分析页（unit=gb 时数值为容量 GB，否则为块数）。
type DiskAnalysis struct {
	Platforms []Dist `json:"platforms"`
	Mount     []Dist `json:"mount"`
	Types     []Dist `json:"types"`
	Options   []Opt2 `json:"platforms_opt"`
	Unit      string `json:"unit"`
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
	out.Platforms, out.Mount, out.Types = distOf(acc), distOf(mnt), distOf(typ)
	return out, nil
}
