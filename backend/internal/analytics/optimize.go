package analytics

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

// Suggest 一条策略的命中汇总。
type Suggest struct {
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	ResourceType string `json:"resourceType"`
	Enabled      bool   `json:"enabled"`
	Count        int    `json:"count"`
	Hint         string `json:"hint,omitempty"` // 暂无命中时的原因（数据未积累满 / 指标未采集到 / 已评估无命中）
}

// polDiag 一条策略的评估概况：用于在没有命中时说明原因。
type polDiag struct {
	Total int            // 参与评估的资源数
	Have  map[string]int // 各指标有数据的资源数
	Days  map[string]int // 各指标已积累的最大天数
}

// cand 一个命中（或已被忽略）的资源。
type cand struct {
	x       *plat
	res     string
	id      string
	name    string
	row     capacity.Row
	cluster string
	facts   Facts
	reason  string
	ignored Ignore
	isIgn   bool
	matched bool
}

func nv(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func flavorText(r capacity.Row) string {
	cpu, ram := fv(r, "vcpus"), fv(r, "ramMb")
	if cpu == 0 && ram == 0 {
		return s(r, "flavor")
	}
	g := trimNum(math.Round(ram/1024*10) / 10)
	return fmt.Sprintf("%dvCPU %sGB", int(cpu), g)
}

func ipList(r capacity.Row) []string {
	var out []string
	for _, p := range strings.Split(s(r, "ips"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// vmFacts 云主机的评估事实。
func vmFacts(r capacity.Row, st vmState, hasState bool, u *Usage, now time.Time) Facts {
	status := strings.ToLower(s(r, "status"))
	f := newFacts(status)
	if u != nil {
		f.set("cpuAvg", u.CPUAvg, u.Days)
		f.set("cpuMax", u.CPUMax, u.Days)
		f.set("cpuMin", u.CPUMin, u.Days)
		f.set("memAvg", u.MemAvg, u.Days)
		f.set("memMax", u.MemMax, u.Days)
		f.set("memMin", u.MemMin, u.Days)
		f.set("writeAvg", u.WriteAvg, u.WriteDays)
		f.set("readyAvg", u.ReadyAvg, u.ReadyDays)
		f.set("latAvg", u.LatAvg, u.LatDays)
		f.set("fsMax", u.FsMax, u.FsDays)
		if u.SwapMax != nil {
			sw := 0.0
			if *u.SwapMax > 0 {
				sw = 1
			}
			f.set("swap", &sw, u.SwapDays)
		}
	}
	if hasState && st.Status == status {
		d := round1(now.Sub(st.Since).Hours() / 24)
		if d < 0 {
			d = 0
		}
		switch status {
		case "shutoff":
			f.set("shutdownDays", &d, 0)
		case "active":
			f.set("runningDays", &d, 0)
		}
	}
	return f
}

// evaluate 按所有策略评估全部资源；已忽略的记录无论是否仍命中都保留（供「已忽略资源」视图）。
func (e *Engine) evaluate(ctx context.Context, ps []*plat) ([]Policy, map[string][]cand, map[string]*polDiag, error) {
	pols, err := e.St.policies(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	diag := map[string]*polDiag{}
	states := map[string]map[string]vmState{}
	for _, x := range ps {
		if states[x.ID], err = e.St.vmStates(ctx, x.ID); err != nil {
			return nil, nil, nil, err
		}
	}
	usage := map[int]map[string]*Usage{}
	hcpu, hmem := map[int]map[string]HostStat{}, map[int]map[string]HostStat{}
	now := time.Now().UTC()
	out := map[string][]cand{}
	for i := range pols {
		p := &pols[i]
		igs, err := e.St.ignores(ctx, p.Kind)
		if err != nil {
			return nil, nil, nil, err
		}
		dg := &polDiag{Have: map[string]int{}, Days: map[string]int{}}
		diag[p.Kind] = dg
		add := func(c cand) error {
			key := c.x.ID + "/" + c.id
			c.ignored, c.isIgn = igs[key]
			if !p.Enabled && !c.isIgn {
				return nil
			}
			if p.Enabled {
				dg.Total++
				for _, cd := range p.Conds {
					if _, ok := c.facts.Vals[cd.Field]; ok {
						dg.Have[cd.Field]++
						if d := c.facts.Days[cd.Field]; d > dg.Days[cd.Field] {
							dg.Days[cd.Field] = d
						}
					}
				}
			}
			if p.Enabled {
				c.matched, c.reason = p.Eval(c.facts)
			}
			if c.matched || c.isIgn {
				out[p.Kind] = append(out[p.Kind], c)
			}
			return nil
		}
		since := time.Now().In(CST).AddDate(0, 0, -(p.WindowDays - 1))
		switch p.ResourceType {
		case ResVM:
			u, ok := usage[p.WindowDays]
			if !ok {
				if u, err = e.St.usageSince(ctx, "", since); err != nil {
					return nil, nil, nil, err
				}
				usage[p.WindowDays] = u
			}
			for _, x := range ps {
				for _, r := range x.vms {
					id := s(r, "id")
					cl := x.clusterOf(s(r, "node"))
					if !p.Scope.Match(x.ID, cl) {
						continue
					}
					st, has := states[x.ID][id]
					_ = add(cand{x: x, res: ResVM, id: id, name: s(r, "name"), row: r, cluster: cl, facts: vmFacts(r, st, has, u[x.ID+"/"+id], now)})
				}
			}
		case ResHost:
			if _, ok := hcpu[p.WindowDays]; !ok {
				if hcpu[p.WindowDays], err = e.St.metricStats(ctx, "node_cpu_percent", since); err != nil {
					return nil, nil, nil, err
				}
				if hmem[p.WindowDays], err = e.St.metricStats(ctx, "node_mem_percent", since); err != nil {
					return nil, nil, nil, err
				}
			}
			for _, x := range ps {
				for _, h := range x.hosts {
					name := s(h, "name")
					cl := x.clusterOf(name)
					if !p.Scope.Match(x.ID, cl) {
						continue
					}
					f := newFacts("")
					if c, ok := hcpu[p.WindowDays][x.ID+"/"+short(name)]; ok {
						f.set("cpuAvg", c.Avg, c.Days)
						f.set("cpuMax", c.Max, c.Days)
					}
					if m, ok := hmem[p.WindowDays][x.ID+"/"+short(name)]; ok {
						f.set("memAvg", m.Avg, m.Days)
						f.set("memMax", m.Max, m.Days)
					}
					_ = add(cand{x: x, res: ResHost, id: name, name: name, row: h, cluster: cl, facts: f})
				}
			}
		case ResPool:
			for _, x := range ps {
				if !p.Scope.Match(x.ID, "") {
					continue
				}
				for _, r := range x.pools {
					f := newFacts("")
					f.set("usedPercent", f_(r, "usedPercent"), 0)
					alloc := fv(r, "allocatedGb")
					if alloc == 0 {
						alloc = fv(r, "provisionedGb")
					}
					f.set("allocPercent", pct(alloc, fv(r, "totalGb")), 0)
					_ = add(cand{x: x, res: ResPool, id: s(r, "name"), name: poolName(r), row: r, facts: f})
				}
			}
		case ResDisk:
			for _, x := range ps {
				if !p.Scope.Match(x.ID, "") {
					continue
				}
				for _, r := range x.vols {
					f := newFacts("")
					n := fv(r, "attachCount")
					f.set("attachCount", &n, 0)
					_ = add(cand{x: x, res: ResDisk, id: s(r, "id"), name: s(r, "name"), row: r, facts: f})
				}
			}
		}
	}
	return pols, out, diag, nil
}

func f_(r capacity.Row, k string) *float64 { return f(r, k) }

// poolName 集群存储展示名：后端名称优先。
func poolName(r capacity.Row) string {
	if n := s(r, "backendName"); n != "" {
		return n
	}
	if n := s(r, "poolName"); n != "" {
		return n
	}
	return s(r, "name")
}

func (e *Engine) suggestions(ctx context.Context, ps []*plat) ([]Suggest, error) {
	pols, cands, diag, err := e.evaluate(ctx, ps)
	if err != nil {
		return nil, err
	}
	out := make([]Suggest, 0, len(pols))
	for _, p := range pols {
		n := 0
		for _, c := range cands[p.Kind] {
			if c.matched && !c.isIgn {
				n++
			}
		}
		sg := Suggest{Kind: p.Kind, Name: p.Name, ResourceType: p.ResourceType, Enabled: p.Enabled, Count: n}
		if n == 0 && p.Enabled {
			sg.Hint = p.noHitHint(diag[p.Kind])
		}
		out = append(out, sg)
	}
	return out, nil
}

// Suggestions 各策略命中汇总（含所有所属云平台）。
func (e *Engine) Suggestions(ctx context.Context, plats []capacity.Platform) ([]Suggest, error) {
	ps, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	return e.suggestions(ctx, ps)
}

// OptCols 各资源类型「优化建议」导出列。
func OptCols(res string) []Col {
	switch res {
	case ResHost:
		return []Col{{"name", "物理机"}, {"platform", "所属云平台"}, {"cluster", "集群"}, {"ip", "IP地址"}, {"reason", "建议原因"}, {"cpuAvg", "CPU平均使用率"}, {"cpuMax", "CPU最大使用率"}, {"memAvg", "内存平均使用率"}, {"memMax", "内存最大使用率"}}
	case ResPool:
		return []Col{{"name", "后端名称"}, {"platform", "所属云平台"}, {"reason", "建议原因"}, {"totalGb", "总容量(G)"}, {"usedPercent", "存储使用率"}, {"allocPercent", "分配率"}}
	case ResDisk:
		return []Col{{"name", "云硬盘"}, {"platform", "所属云平台"}, {"reason", "建议原因"}, {"sizeGb", "大小(G)"}, {"statusText", "状态"}, {"volumeType", "类型"}}
	}
	return []Col{{"name", "名称"}, {"platform", "所属云平台"}, {"ips", "IP地址"}, {"flavor", "实例规格"}, {"reason", "建议原因"}, {"cpuAvg", "vCPU平均使用率"}, {"memAvg", "内存平均使用率"}, {"writeAvg", "写I/O平均速率(KiB/s)"}, {"readyAvg", "CPU就绪占比"}, {"latAvg", "磁盘时延(ms)"}, {"fsMax", "文件系统使用率"}, {"shutdownDays", "持续关机(天)"}}
}

// OptColsAll 「全部 / 按侧汇总」导出列：公共列 + 各资源类型的关键指标。
func OptColsAll() []Col {
	return []Col{{"policy", "优化策略"}, {"name", "资源名称"}, {"platform", "所属云平台"}, {"ips", "IP地址"}, {"reason", "建议原因"}, {"cpuAvg", "CPU平均使用率"}, {"memAvg", "内存平均使用率"}, {"usedPercent", "存储使用率"}, {"allocPercent", "分配率"}, {"shutdownDays", "持续关机(天)"}}
}

func (c cand) optRow() map[string]any {
	r := c.row
	row := map[string]any{"id": c.id, "providerId": c.x.ID, "key": c.x.ID + "/" + c.id, "resType": c.res, "name": c.name, "platform": c.x.Name, "consoleIp": c.x.ConsoleIP}
	v := func(k string) any {
		if x, ok := c.facts.Vals[k]; ok {
			return x
		}
		return nil
	}
	switch c.res {
	case ResVM:
		ips := ipList(r)
		row["ips"], row["ipList"], row["flavor"] = strings.Join(ips, ", "), ips, flavorText(r)
		row["status"], row["statusText"] = strings.ToLower(s(r, "status")), s(r, "statusText")
		for _, k := range []string{"cpuAvg", "cpuMax", "memAvg", "memMax", "writeAvg", "readyAvg", "latAvg", "fsMax"} {
			row[k] = v(k)
		}
		if sw, ok := c.facts.Vals["swap"]; ok {
			row["swap"] = sw > 0
		}
		if d, ok := c.facts.Vals["shutdownDays"]; ok {
			row["shutdownDays"] = d
		}
	case ResHost:
		row["cluster"], row["ip"], row["stateText"] = c.cluster, s(r, "hostIp"), s(r, "stateText")
		for _, k := range []string{"cpuAvg", "cpuMax", "memAvg", "memMax"} {
			row[k] = v(k)
		}
	case ResPool:
		row["totalGb"], row["usedGb"], row["statusText"], row["status"] = nv(f(r, "totalGb")), nv(f(r, "usedGb")), s(r, "statusText"), s(r, "status")
		row["usedPercent"], row["allocPercent"] = v("usedPercent"), v("allocPercent")
		row["vendorText"] = s(r, "vendorText")
	case ResDisk:
		row["sizeGb"], row["status"], row["statusText"], row["volumeType"], row["az"] = nv(f(r, "sizeGb")), s(r, "status"), s(r, "statusText"), s(r, "volumeType"), s(r, "az")
	}
	return row
}

// OptRows 优化建议明细：Kind 非空为某条策略，否则按 Side（vm 虚拟机侧 / phys 物理侧 / 空 = 全部）汇总所有策略；每行带 kind / policy（策略名称）。
// ignored=true 为「已忽略资源」。同一资源命中多条策略时每条策略各占一行。
func (e *Engine) OptRows(ctx context.Context, plats []capacity.Platform, q ListQuery) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	pols, cands, _, err := e.evaluate(ctx, ps)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, p := range pols {
		if q.Kind != "" && p.Kind != q.Kind {
			continue
		}
		if q.Kind == "" && ((q.Side == "vm") != (p.ResourceType == ResVM) && q.Side != "") {
			continue
		}
		for _, c := range cands[p.Kind] {
			if c.isIgn != (q.Ignored == "1") || (!c.isIgn && !c.matched) {
				continue
			}
			if q.Filter.ProviderID != "" && c.x.ID != q.Filter.ProviderID {
				continue
			}
			row := c.optRow()
			ip, _ := row["ips"].(string)
			if ip == "" {
				ip, _ = row["ip"].(string)
			}
			if !matchAny(q, c.name, ip, c.x.Name, p.Name) {
				continue
			}
			row["kind"], row["policy"] = p.Kind, p.Name
			row["key"] = p.Kind + "|" + c.x.ID + "/" + c.id
			row["reason"] = c.reason
			if c.reason == "" {
				row["reason"] = "当前已不满足策略条件"
			}
			if c.isIgn {
				row["ignoredBy"], row["ignoredAt"] = c.ignored.CreatedBy, c.ignored.CreatedAt
			}
			rows = append(rows, row)
		}
	}
	return rows, nil
}

// matchAny 全局搜索：关键字同时匹配名称 / IP / 所属云平台 / 策略名称（Field 为 name | ip 时仅匹配对应字段）。
func matchAny(q ListQuery, name, ip, platform, policy string) bool {
	k := strings.ToLower(strings.TrimSpace(q.Keyword))
	if k == "" {
		return true
	}
	has := func(v string) bool { return strings.Contains(strings.ToLower(v), k) }
	switch q.Field {
	case "name":
		return has(name)
	case "ip":
		return has(ip)
	}
	return has(name) || has(ip) || has(platform) || has(policy)
}

// OptList 某条策略明细（分页）。
func (e *Engine) OptList(ctx context.Context, plats []capacity.Platform, q ListQuery) (*Page, error) {
	rows, err := e.OptRows(ctx, plats, q)
	if err != nil {
		return nil, err
	}
	return Paginate(rows, q), nil
}

// ErrBadKind 策略不存在。
var ErrBadKind = errors.New("策略不存在")

// SetIgnore 忽略 / 取消忽略：items 仅需 providerId + resId，资源名称由已采集数据补全。
func (e *Engine) SetIgnore(ctx context.Context, plats []capacity.Platform, kind string, items []Ignore, on bool, by string) (int, error) {
	p, err := e.St.Policy(ctx, kind)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrBadKind
		}
		return 0, err
	}
	names := map[string]string{}
	if on {
		tbl := map[string]string{ResVM: "vms", ResHost: "nodes", ResPool: "pools", ResDisk: "volumes"}[p.ResourceType]
		for _, pl := range plats {
			rows, _, err := e.Cap.Rows(ctx, pl, tbl)
			if err != nil {
				return 0, err
			}
			for _, r := range rows {
				switch p.ResourceType {
				case ResHost, ResPool:
					names[pl.ID+"/"+s(r, "name")] = poolOrName(p.ResourceType, r)
				default:
					names[pl.ID+"/"+s(r, "id")] = s(r, "name")
				}
			}
		}
	}
	valid := items[:0:0]
	for _, it := range items {
		if on {
			n, ok := names[it.ProviderID+"/"+it.ResID]
			if !ok {
				continue
			}
			it.Name = n
		}
		valid = append(valid, it)
	}
	return e.St.SetIgnore(ctx, kind, valid, on, by)
}

func poolOrName(res string, r capacity.Row) string {
	if res == ResPool {
		return poolName(r)
	}
	return s(r, "name")
}

// PolicyList 全部策略（含编辑器用的指标定义、资源类型与可选范围）。
type PolicyList struct {
	List      []Policy   `json:"list"`
	Fields    []FieldDef `json:"fields"`
	ResTypes  []Opt      `json:"resTypes"`
	Clusters  []Opt2     `json:"clusters"`
	Platforms []Opt2     `json:"platforms"`
}

func (e *Engine) PolicyList(ctx context.Context, plats []capacity.Platform) (*PolicyList, error) {
	l, err := e.St.policies(ctx)
	if err != nil {
		return nil, err
	}
	out := &PolicyList{List: l, Fields: Fields, ResTypes: ResTypes, Clusters: []Opt2{}, Platforms: []Opt2{}}
	ps, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	for _, x := range ps {
		out.Platforms = append(out.Platforms, Opt2{Value: x.ID, Label: x.Name, ProviderID: x.ID})
		for _, c := range x.clusterList() {
			out.Clusters = append(out.Clusters, Opt2{Value: hostKey(x.ID, c), Label: x.Name + " / " + c, ProviderID: x.ID})
		}
	}
	return out, nil
}

// ResMatch 按名称 / ID 解析到的资源（策略「忽略项」添加时使用）。
type ResMatch struct {
	ProviderID string `json:"providerId"`
	Platform   string `json:"platform"`
	ResID      string `json:"resId"`
	Name       string `json:"name"`
}

var resTable = map[string]string{ResVM: "vms", ResHost: "nodes", ResPool: "pools", ResDisk: "volumes"}

// ResolveRes 在所有平台中按「名称或 ID 完全匹配（不区分大小写）」查找某类资源。
func (e *Engine) ResolveRes(ctx context.Context, plats []capacity.Platform, res, keyword string) ([]ResMatch, error) {
	kw := strings.ToLower(strings.TrimSpace(keyword))
	out := []ResMatch{}
	tbl := resTable[res]
	if kw == "" || tbl == "" {
		return out, nil
	}
	for _, pl := range plats {
		rows, _, err := e.Cap.Rows(ctx, pl, tbl)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			id, name := s(r, "id"), s(r, "name")
			disp := name
			switch res {
			case ResHost:
				id = name
			case ResPool:
				id, disp = name, poolName(r)
			}
			if strings.ToLower(id) == kw || strings.ToLower(name) == kw || strings.ToLower(disp) == kw {
				out = append(out, ResMatch{ProviderID: pl.ID, Platform: pl.Name, ResID: id, Name: disp})
			}
		}
	}
	return out, nil
}

// IgnoreItem 某策略下已被忽略的资源。
type IgnoreItem struct {
	ProviderID string    `json:"providerId"`
	Platform   string    `json:"platform"`
	ResID      string    `json:"resId"`
	Name       string    `json:"name"`
	CreatedBy  string    `json:"createdBy"`
	CreatedAt  time.Time `json:"createdAt"`
}

// IgnoreList 某策略的忽略项（含已不存在的资源，便于清理）。
func (e *Engine) IgnoreList(ctx context.Context, plats []capacity.Platform, kind string) ([]IgnoreItem, error) {
	if _, err := e.St.Policy(ctx, kind); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrBadKind
		}
		return nil, err
	}
	igs, err := e.St.ignores(ctx, kind)
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for _, p := range plats {
		names[p.ID] = p.Name
	}
	out := make([]IgnoreItem, 0, len(igs))
	for _, g := range igs {
		out = append(out, IgnoreItem{ProviderID: g.ProviderID, Platform: names[g.ProviderID], ResID: g.ResID, Name: g.Name, CreatedBy: g.CreatedBy, CreatedAt: g.CreatedAt})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}
