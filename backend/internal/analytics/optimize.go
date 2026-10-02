package analytics

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

// Suggest 一类优化建议的汇总。
type Suggest struct {
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Count   int    `json:"count"`
}

// cand 一台命中（或已被忽略）的云主机。
type cand struct {
	x       *plat
	row     capacity.Row
	use     *Usage
	facts   VMFacts
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

func factsOf(r capacity.Row, st vmState, hasState bool, u *Usage, now time.Time) VMFacts {
	status := strings.ToLower(s(r, "status"))
	v := VMFacts{Status: status}
	if u != nil {
		v.CPUAvg, v.CPUMax, v.MemAvg, v.MemMax, v.DaysWithData = u.CPUAvg, u.CPUMax, u.MemAvg, u.MemMax, u.Days
	}
	if hasState && st.Status == status {
		d := round1(now.Sub(st.Since).Hours() / 24)
		if d < 0 {
			d = 0
		}
		switch status {
		case "shutoff":
			v.ShutdownDays = d
		case "active":
			v.RunningDays = d
		}
	}
	return v
}

// evaluate 按所有已启用策略评估全部云主机；已忽略的记录无论是否仍命中都保留（供「已忽略资源」视图）。
func (e *Engine) evaluate(ctx context.Context, ps []*plat) ([]Policy, map[string][]cand, error) {
	pols, err := e.St.policies(ctx)
	if err != nil {
		return nil, nil, err
	}
	states := map[string]map[string]vmState{}
	for _, x := range ps {
		if states[x.ID], err = e.St.vmStates(ctx, x.ID); err != nil {
			return nil, nil, err
		}
	}
	usage := map[int]map[string]*Usage{}
	now := time.Now().UTC()
	out := map[string][]cand{}
	for i := range pols {
		p := &pols[i]
		igs, err := e.St.ignores(ctx, p.Kind)
		if err != nil {
			return nil, nil, err
		}
		u, ok := usage[p.WindowDays]
		if !ok {
			since := time.Now().In(CST).AddDate(0, 0, -(p.WindowDays - 1))
			if u, err = e.St.usageSince(ctx, "", since); err != nil {
				return nil, nil, err
			}
			usage[p.WindowDays] = u
		}
		for _, x := range ps {
			for _, r := range x.vms {
				id := s(r, "id")
				key := x.ID + "/" + id
				ig, isIgn := igs[key]
				if !p.Enabled && !isIgn {
					continue
				}
				st, has := states[x.ID][id]
				facts := factsOf(r, st, has, u[key], now)
				ok, reason := false, ""
				if p.Enabled {
					ok, reason = p.Eval(facts)
				}
				if ok || isIgn {
					out[p.Kind] = append(out[p.Kind], cand{x: x, row: r, use: u[key], facts: facts, reason: reason, ignored: ig, isIgn: isIgn, matched: ok})
				}
			}
		}
	}
	return pols, out, nil
}

func (e *Engine) suggestions(ctx context.Context, ps []*plat) ([]Suggest, error) {
	pols, cands, err := e.evaluate(ctx, ps)
	if err != nil {
		return nil, err
	}
	byKind := map[string]Policy{}
	for _, p := range pols {
		byKind[p.Kind] = p
	}
	out := make([]Suggest, 0, len(Kinds))
	for _, k := range Kinds {
		p := byKind[k]
		n := 0
		for _, c := range cands[k] {
			if c.matched && !c.isIgn {
				n++
			}
		}
		out = append(out, Suggest{Kind: k, Name: p.Name, Enabled: p.Enabled, Count: n})
	}
	return out, nil
}

// Suggestions 四类建议汇总（含所有云账号）。
func (e *Engine) Suggestions(ctx context.Context, plats []capacity.Platform) ([]Suggest, error) {
	ps, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	return e.suggestions(ctx, ps)
}

// OptRows 某类建议的明细（ignored=true 为「已忽略资源」）。
func (e *Engine) OptRows(ctx context.Context, plats []capacity.Platform, q ListQuery) ([]map[string]any, error) {
	ps, err := e.load(ctx, plats, "")
	if err != nil {
		return nil, err
	}
	_, cands, err := e.evaluate(ctx, ps)
	if err != nil {
		return nil, err
	}
	rows := []map[string]any{}
	for _, c := range cands[q.Kind] {
		if c.isIgn != (q.Ignored == "1") || (!c.isIgn && !c.matched) {
			continue
		}
		r := c.row
		ips := ipList(r)
		if !match(q, map[string]string{"name": s(r, "name"), "ip": strings.Join(ips, " ")}) {
			continue
		}
		reason := c.reason
		if reason == "" {
			reason = "当前已不满足策略条件"
		}
		row := map[string]any{
			"id": s(r, "id"), "providerId": c.x.ID, "key": c.x.ID + "/" + s(r, "id"), "name": s(r, "name"), "account": c.x.Name,
			"ips": strings.Join(ips, ", "), "ipList": ips, "flavor": flavorText(r), "reason": reason,
			"cpuAvg": nv(c.facts.CPUAvg), "cpuMax": nv(c.facts.CPUMax), "memAvg": nv(c.facts.MemAvg), "memMax": nv(c.facts.MemMax),
			"status": strings.ToLower(s(r, "status")), "statusText": s(r, "statusText"),
		}
		if c.isIgn {
			row["ignoredBy"], row["ignoredAt"] = c.ignored.CreatedBy, c.ignored.CreatedAt
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// OptList 某类建议明细（分页）。
func (e *Engine) OptList(ctx context.Context, plats []capacity.Platform, q ListQuery) (*Page, error) {
	rows, err := e.OptRows(ctx, plats, q)
	if err != nil {
		return nil, err
	}
	return Paginate(rows, q), nil
}

// SetIgnore 忽略 / 取消忽略：items 仅需 providerId + vmId，云主机名称由已采集数据补全。
func (e *Engine) SetIgnore(ctx context.Context, plats []capacity.Platform, kind string, items []Ignore, on bool, by string) (int, error) {
	if kind != KindDowngrade && kind != KindUpgrade && kind != KindRecycle {
		return 0, fmt.Errorf("建议类型不合法")
	}
	names := map[string]string{}
	if on {
		for _, p := range plats {
			rows, _, err := e.Cap.Rows(ctx, p, "vms")
			if err != nil {
				return 0, err
			}
			for _, r := range rows {
				names[p.ID+"/"+s(r, "id")] = s(r, "name")
			}
		}
	}
	valid := items[:0:0]
	for _, it := range items {
		if on {
			n, ok := names[it.ProviderID+"/"+it.VMID]
			if !ok {
				continue
			}
			it.VMName = n
		}
		valid = append(valid, it)
	}
	return e.St.SetIgnore(ctx, kind, valid, on, by)
}

// PolicyList 四条策略（含编辑器用的字段定义）。
type PolicyList struct {
	List   []Policy   `json:"list"`
	Fields []FieldDef `json:"fields"`
}

func (e *Engine) PolicyList(ctx context.Context) (*PolicyList, error) {
	l, err := e.St.policies(ctx)
	if err != nil {
		return nil, err
	}
	return &PolicyList{List: l, Fields: Fields}, nil
}
