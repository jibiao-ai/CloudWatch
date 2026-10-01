package capacity

import (
	"context"
	"sort"
)

// Sum 一组汇总数值。
type Sum struct {
	Phys              float64 `json:"phys"`
	PhysCores         float64 `json:"physCores"`
	PhysMemGb         float64 `json:"physMemGb"`
	Nodes             float64 `json:"nodes"`
	NodesDown         float64 `json:"nodesDown"`
	VCPUs             float64 `json:"vcpus"`
	VCPUsCap          float64 `json:"vcpusCap"`
	VCPUsUsed         float64 `json:"vcpusUsed"`
	MemMb             float64 `json:"memMb"`
	MemMbCap          float64 `json:"memMbCap"`
	MemMbUsed         float64 `json:"memMbUsed"`
	LocalGb           float64 `json:"localGb"`
	LocalGbUsed       float64 `json:"localGbUsed"`
	VMs               float64 `json:"vms"`
	VMsActive         float64 `json:"vmsActive"`
	VolumeCount       float64 `json:"volumeCount"`
	VolumeGb          float64 `json:"volumeGb"`
	VolumeInUse       float64 `json:"volumeInUse"`
	Ports             float64 `json:"ports"`
	Pools             float64 `json:"pools"`
	PoolsDown         float64 `json:"poolsDown"`
	PoolTotalGb       float64 `json:"poolTotalGb"`
	PoolFreeGb        float64 `json:"poolFreeGb"`
	PoolAllocatedGb   float64 `json:"poolAllocatedGb"`
	PoolProvisionedGb float64 `json:"poolProvisionedGb"`
}

type PlatformSummary struct {
	Platform
	Meta
	Sum Sum `json:"sum"`
}

type Dist struct {
	Label string `json:"label"`
	Tone  string `json:"tone"`
	Count int    `json:"count"`
}

type Overview struct {
	Platforms []PlatformSummary `json:"platforms"`
	Totals    Sum               `json:"totals"`
	Dist      map[string][]Dist `json:"dist"`
}

func f(r Row, k string) float64 {
	if v, ok := r[k].(float64); ok {
		return v
	}
	return 0
}

func (a *Sum) add(b Sum) {
	a.Phys += b.Phys
	a.PhysCores += b.PhysCores
	a.PhysMemGb += b.PhysMemGb
	a.Nodes += b.Nodes
	a.NodesDown += b.NodesDown
	a.VCPUs += b.VCPUs
	a.VCPUsCap += b.VCPUsCap
	a.VCPUsUsed += b.VCPUsUsed
	a.MemMb += b.MemMb
	a.MemMbCap += b.MemMbCap
	a.MemMbUsed += b.MemMbUsed
	a.LocalGb += b.LocalGb
	a.LocalGbUsed += b.LocalGbUsed
	a.VMs += b.VMs
	a.VMsActive += b.VMsActive
	a.VolumeCount += b.VolumeCount
	a.VolumeGb += b.VolumeGb
	a.VolumeInUse += b.VolumeInUse
	a.Ports += b.Ports
	a.Pools += b.Pools
	a.PoolsDown += b.PoolsDown
	a.PoolTotalGb += b.PoolTotalGb
	a.PoolFreeGb += b.PoolFreeGb
	a.PoolAllocatedGb += b.PoolAllocatedGb
	a.PoolProvisionedGb += b.PoolProvisionedGb
}

func summarize(e *entry) Sum {
	var s Sum
	for _, r := range e.rows["phys"] {
		s.Phys++
		s.PhysCores += f(r, "cpuCores")
		s.PhysMemGb += f(r, "memoryGb")
	}
	for _, r := range e.rows["nodes"] {
		s.Nodes++
		if toStr(r["state"]) != "" && toStr(r["state"]) != "up" {
			s.NodesDown++
		}
		s.VCPUs += f(r, "vcpus")
		s.VCPUsCap += f(r, "vcpusCap")
		s.VCPUsUsed += f(r, "vcpusUsed")
		s.MemMb += f(r, "memoryMb")
		s.MemMbCap += f(r, "memoryMbCap")
		s.MemMbUsed += f(r, "memoryMbUsed")
		s.LocalGb += f(r, "localGb")
		s.LocalGbUsed += f(r, "localGbUsed")
	}
	for _, r := range e.rows["vms"] {
		s.VMs++
		if toStr(r["status"]) == "active" {
			s.VMsActive++
		}
	}
	for _, r := range e.rows["volumes"] {
		s.VolumeCount++
		s.VolumeGb += f(r, "sizeGb")
		if toStr(r["status"]) == "in-use" {
			s.VolumeInUse++
		}
	}
	s.Ports = float64(len(e.rows["ports"]))
	for _, r := range e.rows["pools"] {
		s.Pools++
		if toStr(r["status"]) != "" && toStr(r["status"]) != "up" {
			s.PoolsDown++
		}
		s.PoolTotalGb += f(r, "totalGb")
		s.PoolFreeGb += f(r, "freeGb")
		s.PoolAllocatedGb += f(r, "allocatedGb")
		s.PoolProvisionedGb += f(r, "provisionedGb")
	}
	return s
}

// Overview 全部平台的资产汇总 + 各资源状态分布。
func (s *Store) Overview(ctx context.Context, plats []Platform) (*Overview, error) {
	ov := &Overview{Platforms: []PlatformSummary{}, Dist: map[string][]Dist{}}
	cnt := map[string]map[string]*Dist{}
	bump := func(kind string, r Row) {
		code := toStr(r["status"])
		if r["status"] == nil {
			code = toStr(r["state"])
		}
		if code == "" {
			return
		}
		if cnt[kind] == nil {
			cnt[kind] = map[string]*Dist{}
		}
		d := cnt[kind][code]
		if d == nil {
			d = &Dist{Label: toStr(first2(r["statusText"], r["stateText"], code)), Tone: toStr(first2(r["statusTone"], r["stateTone"], "default"))}
			cnt[kind][code] = d
		}
		d.Count++
	}
	for _, p := range plats {
		e, err := s.load(ctx, p)
		if err != nil {
			return nil, err
		}
		sm := summarize(e)
		ov.Platforms = append(ov.Platforms, PlatformSummary{Platform: p, Meta: e.meta, Sum: sm})
		ov.Totals.add(sm)
		for kind, rows := range e.rows {
			for _, r := range rows {
				bump(kind, r)
			}
		}
	}
	for kind, m := range cnt {
		l := make([]Dist, 0, len(m))
		for _, d := range m {
			l = append(l, *d)
		}
		sort.Slice(l, func(i, j int) bool { return l[i].Count > l[j].Count })
		ov.Dist[kind] = l
	}
	return ov, nil
}
