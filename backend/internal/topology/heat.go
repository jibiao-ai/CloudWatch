package topology

import (
	"sort"
	"strings"
	"time"
)

// hasDanger 平台下是否存在「异常」资源（严重告警 / 资源故障）。
func (g *Graph) hasDanger() bool {
	for _, c := range g.Counts {
		if c.Danger > 0 {
			return true
		}
	}
	return false
}

// hostCells 总览热力图：每台计算节点一个单元，附带其承载虚拟机的状态汇总；异常优先、同级按虚拟机数倒序。
func hostCells(gr *Graph) []HostCell {
	health := map[string]string{}
	for _, n := range gr.Nodes {
		health[n.ID] = n.Health
	}
	cells := map[string]*HostCell{}
	list := []*HostCell{}
	for _, n := range gr.Nodes {
		if n.Type == THost {
			c := &HostCell{Name: n.Name, NodeID: n.ID, Health: n.Health}
			cells[n.ID] = c
			list = append(list, c)
		}
	}
	for _, e := range gr.Edges {
		c, ok := cells[e.From]
		if !ok || e.Type != "hosts" || !strings.HasPrefix(e.To, "vm:") {
			continue
		}
		c.VMTotal++
		switch health[e.To] {
		case HDanger:
			c.VMDanger++
		case HWarning:
			c.VMWarning++
		case HOff:
			c.VMOff++
		}
	}
	for _, e := range gr.Edges { // 同名物理节点的状态一并计入
		if c, ok := cells[e.To]; ok && e.Type == "hosts" && strings.HasPrefix(e.From, "phys:") {
			if h := health[e.From]; h == HDanger || h == HWarning {
				c.Health = worse(c.Health, h)
			}
		}
	}
	for _, c := range list { // 单元整体健康度 = 自身 / 物理节点 / 所承载虚拟机的最差问题状态（已停止不算问题）
		if c.VMDanger > 0 {
			c.Health = worse(c.Health, HDanger)
		} else if c.VMWarning > 0 {
			c.Health = worse(c.Health, HWarning)
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		if ri, rj := rank(list[i].Health), rank(list[j].Health); ri != rj {
			return ri > rj
		}
		if list[i].VMDanger != list[j].VMDanger {
			return list[i].VMDanger > list[j].VMDanger
		}
		return list[i].VMTotal > list[j].VMTotal
	})
	out := make([]HostCell, len(list))
	for i, c := range list {
		out[i] = *c
	}
	return out
}

// parseTime 兼容 OpenStack 常见的几种时间格式。
func parseTime(v string) (time.Time, bool) {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Time{}, false
	}
	for _, l := range []string{time.RFC3339, "2006-01-02T15:04:05.000000", "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(l, v); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// orphanOf 未挂载云硬盘治理摘要：数量、总容量、闲置天数分布、状态异常数。
func orphanOf(nodes []Node, now time.Time) OrphanSummary {
	var o OrphanSummary
	for _, n := range nodes {
		if n.Type != TVolume || !n.Orphan {
			continue
		}
		o.Count++
		if n.SizeGB != nil {
			o.SizeGB += *n.SizeGB
		}
		switch n.Health {
		case HDanger:
			o.Danger++
		case HWarning:
			o.Warning++
		}
		if t, ok := parseTime(n.CreatedAt); ok {
			d := now.Sub(t)
			if d > 30*24*time.Hour {
				o.Idle30++
			}
			if d > 90*24*time.Hour {
				o.Idle90++
			}
		}
	}
	return o
}
