package monitor

import (
	"context"
	"math"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

// VisibleNodes 物理节点：排除 OpenStack Nova 虚拟机，并按配置中心补全核数 / 已用核数（监控中心与自动巡检共用）。
func VisibleNodes(ctx context.Context, cs *capacity.Store, pl capacity.Platform, nodes []Node) []Node {
	nova, err := cs.NovaKeys(ctx, pl)
	if err != nil {
		nova = nil
	}
	out := make([]Node, 0, len(nodes))
	for _, n := range nodes {
		if nova[capacity.ShortName(n.Name)] || (n.HostIP != "" && nova[n.HostIP]) {
			continue
		}
		out = append(out, n)
	}
	cores, err := cs.PhysCores(ctx, pl)
	if err != nil || len(cores) == 0 {
		return out
	}
	for i := range out {
		n := &out[i]
		if n.CoresTotal == nil { // Nova 已给出的核数优先；其余按配置中心匹配
			t, ok := cores[capacity.ShortName(n.Name)]
			if !ok && n.HostIP != "" {
				t, ok = cores[n.HostIP]
			}
			if ok {
				n.CoresTotal = &t
			}
		}
		if n.CoresUsed == nil && n.CoresTotal != nil && n.CPUPercent != nil { // 无 Nova 已分配 vCPU：按 CPU 使用率估算
			u := math.Round(*n.CPUPercent * *n.CoresTotal / 100) // 取整核数
			n.CoresUsed = &u
		}
	}
	return out
}
