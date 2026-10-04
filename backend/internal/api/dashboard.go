package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

const gib = 1024.0 * 1024 * 1024

type dashUsage struct {
	Used float64 `json:"used"`
	Cap  float64 `json:"cap"`
}

// dashPlatform 平台概览里「各平台概况」的一行：资产（Nova/Cinder）+ 监控（EMLA）+ 告警汇总。
type dashPlatform struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	EnvType     string     `json:"envType"`
	ConsoleIP   string     `json:"consoleIp"`
	Status      string     `json:"status"` // online / warning / error（平台连通）
	CollectedAt *time.Time `json:"collectedAt"`
	CollectOK   bool       `json:"collectOk"`
	Phys        int        `json:"phys"`
	Nodes       int        `json:"nodes"`
	NodesDown   int        `json:"nodesDown"`
	VMs         int        `json:"vms"`
	VMsActive   int        `json:"vmsActive"`
	VCPU        dashUsage  `json:"vcpu"`    // 已分配 / 可分配（含超分比）
	Memory      dashUsage  `json:"memory"`  // MiB
	Storage     dashUsage  `json:"storage"` // 字节
	CPUUse      *float64   `json:"cpuUse"`  // 实际使用率（监控）
	MemUse      *float64   `json:"memUse"`
	SvcBad      int        `json:"servicesBad"`
	SvcTotal    int        `json:"servicesTotal"`
	AlertFiring int        `json:"alertFiring"`
}

type dashNode struct {
	Provider   string   `json:"provider"`
	ProviderID string   `json:"providerId"`
	Node       string   `json:"node"`
	HostIP     string   `json:"hostIp"`
	CPU        *float64 `json:"cpu"`
	Mem        *float64 `json:"mem"`
}

type dashAlert struct {
	ID         int64     `json:"id"`
	Name       string    `json:"name"`
	Severity   string    `json:"severity"`
	Provider   string    `json:"provider"`
	ProviderID string    `json:"providerId"`
	Object     string    `json:"object"`
	FiredAt    time.Time `json:"firedAt"`
	Acked      bool      `json:"acked"`
}

type dashSuggest struct {
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	ResourceType string `json:"resourceType"`
	Count        int    `json:"count"`
}

func avgPtr(sum float64, n int) *float64 {
	if n == 0 {
		return nil
	}
	v := sum / float64(n)
	return &v
}

// dashboardOverview GET /dashboard/overview：平台概览。聚合资产、监控、告警、运营中心；各板块按权限裁剪，无权限的板块不返回。
func (s *Server) dashboardOverview(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	ctx := r.Context()
	pg, err := s.Providers.Store.List(ctx, provider.Query{})
	if err != nil {
		return err
	}
	plats := make([]capacity.Platform, 0, len(pg.List))
	for _, pv := range pg.List {
		plats = append(plats, capacity.Platform{ID: pv.ID, Name: pv.Name, EnvType: pv.EnvType, ConsoleIP: pv.ConsoleIP})
	}
	canCap, canMon, canAlert, canAn := p.Can("capacity:view"), p.Can("monitor:view"), p.Can("alert:view"), p.Can("analytics:view")

	rows := make([]dashPlatform, 0, len(pg.List))
	idx := map[string]int{}
	for i, pv := range pg.List {
		rows = append(rows, dashPlatform{ID: pv.ID, Name: pv.Name, EnvType: pv.EnvType, ConsoleIP: pv.ConsoleIP, Status: pv.Status})
		idx[pv.ID] = i
	}
	totals := map[string]float64{"platforms": float64(len(rows))}
	for _, x := range rows {
		if x.Status == "online" {
			totals["online"]++
		}
	}
	out := map[string]any{"perms": map[string]bool{"capacity": canCap, "monitor": canMon, "alert": canAlert, "analytics": canAn}}

	if canCap {
		ov, err := s.Capacity.Store.Overview(ctx, plats)
		if err != nil {
			return err
		}
		for _, ps := range ov.Platforms {
			i, ok := idx[ps.ID]
			if !ok {
				continue
			}
			x := &rows[i]
			x.CollectedAt, x.CollectOK = ps.CollectedAt, ps.OK
			x.Phys, x.Nodes, x.NodesDown = int(ps.Sum.Phys), int(ps.Sum.Nodes), int(ps.Sum.NodesDown)
			x.VMs, x.VMsActive = int(ps.Sum.VMs), int(ps.Sum.VMsActive)
			x.VCPU = dashUsage{Used: ps.Sum.VCPUsUsed, Cap: ps.Sum.VCPUsCap}
			x.Memory = dashUsage{Used: ps.Sum.MemMbUsed, Cap: ps.Sum.MemMbCap}
			x.Storage = dashUsage{Used: (ps.Sum.PoolTotalGb - ps.Sum.PoolFreeGb) * gib, Cap: ps.Sum.PoolTotalGb * gib}
		}
		t := ov.Totals
		for k, v := range map[string]float64{"phys": t.Phys, "nodes": t.Nodes, "nodesDown": t.NodesDown, "vms": t.VMs, "vmsActive": t.VMsActive, "volumes": t.VolumeCount,
			"volumeGb": t.VolumeGb, "ports": t.Ports, "pools": t.Pools, "poolsDown": t.PoolsDown, "vcpuUsed": t.VCPUsUsed, "vcpuCap": t.VCPUsCap, "memUsed": t.MemMbUsed, "memCap": t.MemMbCap} {
			totals[k] = v
		}
		out["vmDist"] = ov.Dist["vms"]
		for _, ps := range ov.Platforms {
			if ps.CollectedAt == nil || !ps.OK {
				totals["collectBad"]++
			}
		}
	}

	var cpuNodes, memNodes []dashNode
	if canMon {
		var cpuSum, memSum float64
		var cpuN, memN int
		for i := range rows {
			sn, err := s.Monitor.Store.Snapshot(ctx, rows[i].ID)
			if err != nil {
				return err
			}
			x := &rows[i]
			x.AlertFiring = sn.AlertFiring
			x.SvcTotal = len(sn.Services)
			for _, sv := range sn.Services {
				if sv.Healthy != nil && !*sv.Healthy {
					x.SvcBad++
				}
			}
			totals["servicesTotal"] += float64(x.SvcTotal)
			totals["servicesBad"] += float64(x.SvcBad)
			if sm := sn.Summary; sm != nil {
				x.CPUUse, x.MemUse = sm.VCPU.Percent, sm.Memory.Percent
				if sm.VCPU.Percent != nil {
					cpuSum += *sm.VCPU.Percent
					cpuN++
				}
				if sm.Memory.Percent != nil {
					memSum += *sm.Memory.Percent
					memN++
				}
				if c := sm.Storage; c.TotalBytes != nil && *c.TotalBytes > 0 { // 实际存储容量优先于 Cinder 存储池口径
					used := 0.0
					if c.UsedBytes != nil {
						used = *c.UsedBytes
					}
					x.Storage = dashUsage{Used: used, Cap: *c.TotalBytes}
				}
			}
			for _, n := range s.visibleNodes(ctx, plats[i], sn.Nodes) { // 排除 OpenStack Nova 虚拟机
				dn := dashNode{Provider: x.Name, ProviderID: x.ID, Node: n.Name, HostIP: n.HostIP, CPU: n.CPUPercent, Mem: n.MemPercent}
				if n.CPUPercent != nil {
					cpuNodes = append(cpuNodes, dn)
				}
				if n.MemPercent != nil {
					memNodes = append(memNodes, dn)
				}
			}
		}
		out["cpuUseAvg"], out["memUseAvg"] = avgPtr(cpuSum, cpuN), avgPtr(memSum, memN)
		top := func(l []dashNode, val func(dashNode) float64) []dashNode {
			sort.SliceStable(l, func(i, j int) bool { return val(l[i]) > val(l[j]) })
			if len(l) > 5 {
				l = l[:5]
			}
			if l == nil {
				l = []dashNode{}
			}
			return l
		}
		out["topCpu"] = top(cpuNodes, func(n dashNode) float64 { return *n.CPU })
		out["topMem"] = top(memNodes, func(n dashNode) float64 { return *n.Mem })
	}
	for _, x := range rows { // 存储合计：全部平台实际/存储池口径相加
		totals["storageUsed"] += x.Storage.Used
		totals["storageCap"] += x.Storage.Cap
	}

	if canAlert {
		st, err := s.Monitor.Store.Stats(ctx, "")
		if err != nil {
			return err
		}
		out["alertStats"] = st
		al, err := s.Monitor.Store.ListAlerts(ctx, monitor.AlertQuery{Status: "firing", Page: 1, PageSize: 6, SortKey: "severity", SortOrder: "asc"})
		if err != nil {
			return err
		}
		recent := make([]dashAlert, 0, len(al.List))
		for _, a := range al.List {
			obj := a.NodeName
			if obj == "" {
				obj = a.HostIP
			}
			recent = append(recent, dashAlert{ID: a.ID, Name: a.Name, Severity: a.Severity, Provider: a.ProviderName, ProviderID: a.ProviderID, Object: obj, FiredAt: a.FiredAt, Acked: a.Acked})
		}
		out["recentAlerts"] = recent
	}

	if canAn {
		sg, err := s.Analytics.Suggestions(ctx, plats)
		if err != nil {
			return err
		}
		list := []dashSuggest{}
		for _, g := range sg {
			if g.Enabled && g.Count > 0 {
				list = append(list, dashSuggest{Kind: g.Kind, Name: g.Name, ResourceType: g.ResourceType, Count: g.Count})
			}
		}
		sort.SliceStable(list, func(i, j int) bool { return list[i].Count > list[j].Count })
		out["suggestions"] = list
	}
	out["totals"], out["platforms"] = totals, rows
	httpx.OK(w, out)
	return nil
}

var dashRanges = map[string]struct {
	Dur time.Duration
	Pts int
}{"6h": {6 * time.Hour, 72}, "24h": {24 * time.Hour, 96}, "7d": {7 * 24 * time.Hour, 84}, "30d": {30 * 24 * time.Hour, 90}}

// dashboardTrend GET /dashboard/trend?range=6h|24h|7d|30d&providerId=：所有（或指定）平台的 vCPU / 内存 / 存储使用率，按时间桶取平均；数据来自监控采集落库的历史样本。
func (s *Server) dashboardTrend(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	rg, ok := dashRanges[r.URL.Query().Get("range")]
	if !ok {
		rg = dashRanges["24h"]
	}
	pid := r.URL.Query().Get("providerId")
	pg, err := s.Providers.Store.List(r.Context(), provider.Query{})
	if err != nil {
		return err
	}
	since := time.Now().Add(-rg.Dur)
	bucket := rg.Dur.Milliseconds() / int64(rg.Pts)
	metrics := []string{"vcpu_percent", "memory_percent", "storage_used_percent"}
	type acc struct {
		sum [3]float64
		n   [3]int
	}
	bk := map[int64]*acc{}
	for _, pv := range pg.List {
		if pid != "" && pv.ID != pid {
			continue
		}
		for mi, m := range metrics {
			pts, err := s.Monitor.Store.Trend(r.Context(), pv.ID, m, "", since, 0)
			if err != nil {
				return err
			}
			for _, pt := range pts {
				k := pt.T / bucket * bucket
				a := bk[k]
				if a == nil {
					a = &acc{}
					bk[k] = a
				}
				a.sum[mi] += pt.V
				a.n[mi]++
			}
		}
	}
	keys := make([]int64, 0, len(bk))
	for k := range bk {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	pts := make([]map[string]any, 0, len(keys))
	for _, k := range keys {
		a := bk[k]
		row := map[string]any{"t": k + bucket/2}
		for mi, name := range []string{"cpu", "mem", "storage"} {
			if a.n[mi] > 0 {
				row[name] = float64(int(a.sum[mi]/float64(a.n[mi])*10+0.5)) / 10
			}
		}
		pts = append(pts, row)
	}
	httpx.OK(w, map[string]any{"points": pts})
	return nil
}
