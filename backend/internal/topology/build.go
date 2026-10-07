package topology

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

// Builder 拓扑构建器：只读取已落库的平台 / 资产 / 监控 / 告警数据。
type Builder struct {
	Capacity *capacity.Store
	Monitor  *monitor.Store
}

type g struct {
	nodes []Node
	edges []Edge
	idx   map[string]int
}

func (x *g) add(n Node) {
	if n.Reasons == nil {
		n.Reasons = []string{}
	}
	if n.Attrs == nil {
		n.Attrs = [][2]string{}
	}
	x.idx[n.ID] = len(x.nodes)
	x.nodes = append(x.nodes, n)
}
func (x *g) edge(from, to, t string) {
	if _, ok := x.idx[from]; !ok {
		return
	}
	if _, ok := x.idx[to]; !ok {
		return
	}
	x.edges = append(x.edges, Edge{from, to, t})
}
func (x *g) get(id string) *Node {
	if i, ok := x.idx[id]; ok {
		return &x.nodes[i]
	}
	return nil
}

// Build 构建单个平台的拓扑。
func (b *Builder) Build(ctx context.Context, p *provider.Provider) (*Graph, error) {
	plat := capacity.Platform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP}
	get := func(kind string) ([]capacity.Row, *capacity.Meta, error) { return b.Capacity.Rows(ctx, plat, kind) }
	phys, meta, err := get("phys")
	if err != nil {
		return nil, err
	}
	hosts, _, err := get("nodes")
	if err != nil {
		return nil, err
	}
	vms, _, _ := get("vms")
	vols, _, _ := get("volumes")
	ports, _, _ := get("ports")
	pools, _, _ := get("pools")
	snap, err := b.Monitor.Snapshot(ctx, p.ID)
	if err != nil {
		return nil, err
	}

	x := &g{idx: map[string]int{}}
	// 监控中心的指标：节点 / 云主机 CPU 与内存使用率
	monNode := map[string]monitor.Node{}
	for _, n := range snap.Nodes {
		monNode[short(n.Name)] = n
	}
	monVM := map[string]monitor.VM{}
	for _, v := range snap.VMs {
		monVM[v.ID] = v
	}

	physByName, physByIP, hostByName := map[string]string{}, map[string]string{}, map[string]string{}
	// ---- 物理节点 ----
	for _, r := range phys {
		st := s(r, "status")
		n := Node{ID: "phys:" + s(r, "id"), Type: TPhys, Name: first(s(r, "hostname"), s(r, "id")), Health: HOK, StatusText: s(r, "statusText"), Ref: &Ref{"phys", s(r, "id")},
			Sub: strings.Trim(strings.Join(nz(s(r, "ip"), s(r, "model")), " · "), " ")}
		switch strings.ToLower(st) {
		case "ready", "":
		case "error", "offline":
			n.Health = HDanger
			n.Reasons = append(n.Reasons, "物理节点状态："+first(s(r, "statusText"), st))
		case "maintenance", "deleting", "discover", "provisioning", "deploying":
			n.Health = HWarning
			n.Reasons = append(n.Reasons, "物理节点状态："+first(s(r, "statusText"), st))
		case "stopped":
			n.Health = HOff
		}
		n.Attrs = [][2]string{{"管理 IP", s(r, "ip")}, {"带外 IP", s(r, "ipmiIp")}, {"型号", s(r, "model")}, {"序列号", s(r, "serial")}, {"CPU", first(s(r, "cpuModel"), "—")}, {"CPU 核数", s(r, "cpuCores")}, {"网卡数量", s(r, "nicCount")}}
		x.add(n)
		physByName[short(n.Name)] = n.ID
		if ip := s(r, "ip"); ip != "" {
			physByIP[ip] = n.ID
		}
	}
	// ---- 计算节点 ----
	for _, r := range hosts {
		name := first(s(r, "name"), short(s(r, "hostname")))
		n := Node{ID: "host:" + name, Type: THost, Name: name, Health: HOK, StatusText: s(r, "stateText"), Ref: &Ref{"nodes", s(r, "id")}}
		cpu, mem := f(r, "vcpuPercent"), f(r, "memPercent")
		if m, ok := monNode[name]; ok { // 监控中心的实时使用率优先
			if m.CPUPercent != nil {
				cpu = m.CPUPercent
			}
			if m.MemPercent != nil {
				mem = m.MemPercent
			}
		}
		n.CPU, n.Mem = cpu, mem
		n.Sub = strings.Join(nz(s(r, "hostIp"), fmt.Sprintf("%.0f 台云主机", fv(r, "runningVms"))), " · ")
		if s(r, "state") != "" && s(r, "state") != "up" {
			n.Health = HDanger
			n.Reasons = append(n.Reasons, "计算节点状态："+first(s(r, "stateText"), s(r, "state")))
		}
		if s(r, "enabled") == "disabled" {
			n.Health = worse(n.Health, HWarning)
			n.Reasons = append(n.Reasons, "计算服务已禁用"+reasonSuffix(s(r, "disabledReason")))
		}
		n.Attrs = [][2]string{{"管理 IP", s(r, "hostIp")}, {"运行状态", s(r, "stateText")}, {"服务状态", s(r, "enabledText")}, {"vCPU 已用/容量", fmt.Sprintf("%.0f / %.0f", fv(r, "vcpusUsed"), fv(r, "vcpusCap"))},
			{"内存 已用/容量", mbText(fv(r, "memoryMbUsed")) + " / " + mbText(fv(r, "memoryMbCap"))}, {"CPU 使用率（监控）", pctPtr(cpu)}, {"内存使用率（监控）", pctPtr(mem)}, {"运行云主机", s(r, "runningVms")}, {"虚拟化", s(r, "hypervisorType")}}
		x.add(n)
		hostByName[name] = n.ID
	}
	// 物理节点 → 计算节点（同名）
	for name, hid := range hostByName {
		if pid, ok := physByName[name]; ok {
			x.edge(pid, hid, "hosts")
		}
	}
	// ---- 虚拟机 ----
	vmByID := map[string]string{}
	vmByMAC := map[string]string{}
	for _, r := range vms {
		id := s(r, "id")
		n := Node{ID: "vm:" + id, Type: TVM, Name: first(s(r, "name"), id), Health: HOK, StatusText: s(r, "statusText"), Ref: &Ref{"vms", id}}
		switch strings.ToLower(s(r, "status")) {
		case "active":
		case "error":
			n.Health = HDanger
			n.Reasons = append(n.Reasons, "云主机状态：异常")
		case "shutoff", "stopped", "paused", "suspended", "shelved", "shelved_offloaded":
			n.Health = HOff
		default:
			n.Health = HWarning
			n.Reasons = append(n.Reasons, "云主机状态："+first(s(r, "statusText"), s(r, "status")))
		}
		if m, ok := monVM[id]; ok {
			n.CPU, n.Mem = m.CPUPercent, m.MemPercent
			if n.Health == HOK {
			}
		}
		spec := ""
		if vc := f(r, "vcpus"); vc != nil {
			spec = fmt.Sprintf("%.0f核/%s", *vc, mbText(fv(r, "ramMb")))
		}
		n.Sub = strings.Join(nz(s(r, "ips"), spec), " · ")
		n.Attrs = [][2]string{{"UUID", id}, {"IP", s(r, "ips")}, {"规格", first(s(r, "flavor"), "—")}, {"vCPU / 内存", spec}, {"所在节点", s(r, "node")}, {"项目", s(r, "projectName")}, {"CPU 使用率（监控）", pctPtr(n.CPU)}, {"内存使用率（监控）", pctPtr(n.Mem)}, {"创建时间", s(r, "createdAt")}}
		x.add(n)
		vmByID[id] = n.ID
		for _, m := range strings.Split(s(r, "macs"), ",") { // 网卡 device_id 对不上时按 MAC 回退关联
			if m = strings.ToLower(strings.TrimSpace(m)); m != "" {
				vmByMAC[m] = n.ID
			}
		}
		x.edge(hostByName[s(r, "node")], n.ID, "hosts")
	}
	// ---- 存储池 ----
	poolIDs := map[string]string{}
	for _, r := range pools {
		id := s(r, "id")
		n := Node{ID: "pool:" + id, Type: TPool, Name: first(s(r, "backendName"), s(r, "poolName"), id), Health: HOK, StatusText: s(r, "statusText"), Ref: &Ref{"pools", id}}
		if s(r, "status") != "" && s(r, "status") != "up" {
			n.Health = HDanger
			n.Reasons = append(n.Reasons, "存储后端状态："+first(s(r, "statusText"), s(r, "status")))
		}
		up := f(r, "usedPercent")
		n.Mem = up
		n.Sub = fmt.Sprintf("%s / %s", gbText(fv(r, "usedGb")), gbText(fv(r, "totalGb")))
		n.Attrs = [][2]string{{"后端名称", s(r, "backendName")}, {"存储池", s(r, "poolName")}, {"协议", s(r, "protocolText")}, {"总容量", gbText(fv(r, "totalGb"))}, {"已用容量", gbText(fv(r, "usedGb"))}, {"存储使用率", pctPtr(up)}}
		x.add(n)
		poolIDs[id] = n.ID
	}
	// ---- 云硬盘 ----
	for _, r := range vols {
		id := s(r, "id")
		n := Node{ID: "volume:" + id, Type: TVolume, Name: first(s(r, "name"), id), Health: HOK, StatusText: s(r, "statusText"), Ref: &Ref{"volumes", id}}
		st := strings.ToLower(s(r, "status"))
		switch {
		case strings.HasPrefix(st, "error"):
			n.Health = HDanger
			n.Reasons = append(n.Reasons, "云硬盘状态："+first(s(r, "statusText"), st))
		case st == "in-use" || st == "available" || st == "":
		default:
			n.Health = HWarning
			n.Reasons = append(n.Reasons, "云硬盘状态："+first(s(r, "statusText"), st))
		}
		n.Sub = strings.Join(nz(gbText(fv(r, "sizeGb")), s(r, "volumeType")), " · ")
		n.SizeGB, n.CreatedAt = f(r, "sizeGb"), s(r, "createdAt")
		n.Orphan = strings.TrimSpace(s(r, "serverIds")) == ""
		n.Attrs = [][2]string{{"UUID", id}, {"容量", gbText(fv(r, "sizeGb"))}, {"类型", s(r, "volumeType")}, {"启动盘", s(r, "bootable")}, {"挂载虚拟机", s(r, "serverNames")}, {"挂载点", s(r, "devices")}, {"存储后端", s(r, "backend")}, {"创建时间", s(r, "createdAt")}}
		x.add(n)
		for _, sid := range strings.Split(s(r, "serverIds"), ",") {
			if v, ok := vmByID[strings.TrimSpace(sid)]; ok {
				x.edge(v, n.ID, "attach")
			}
		}
		if pid := poolOf(poolIDs, s(r, "backend")); pid != "" {
			x.edge(n.ID, pid, "store")
		}
	}
	// ---- 网络 + 虚拟网卡 ----
	netNodes := map[string]string{}
	netPorts := map[string]int{}
	for _, r := range ports {
		nid := first(s(r, "networkId"), s(r, "networkName"))
		if nid == "" {
			continue
		}
		if _, ok := netNodes["net:"+nid]; !ok {
			netNodes["net:"+nid] = first(s(r, "networkName"), nid)
		}
		netPorts["net:"+nid]++
	}
	for _, nid := range sortedKeys(netNodes) {
		x.add(Node{ID: nid, Type: TNetwork, Name: netNodes[nid], Health: HOK, StatusText: "网络", Sub: fmt.Sprintf("%d 个云主机网卡", netPorts[nid]),
			Attrs: [][2]string{{"网络", netNodes[nid]}, {"网卡数", fmt.Sprint(netPorts[nid])}}})
	}
	for _, r := range ports {
		id := s(r, "id")
		n := Node{ID: "port:" + id, Type: TPort, Name: first(s(r, "name"), id), Health: HOK, StatusText: s(r, "statusText"), Ref: &Ref{"ports", id}}
		switch strings.ToLower(s(r, "status")) {
		case "active":
		case "down":
			n.Health = HOff
		case "error":
			n.Health = HDanger
			n.Reasons = append(n.Reasons, "网卡状态：异常")
		case "build":
			n.Health = HWarning
			n.Reasons = append(n.Reasons, "网卡状态：创建中")
		case "n/a", "":
			n.Health = HUnknown
		}
		n.Sub = s(r, "ips")
		n.Attrs = [][2]string{{"UUID", id}, {"IP 地址", s(r, "ips")}, {"MAC 地址", s(r, "mac")}, {"所属网络", s(r, "networkName")}, {"挂载虚拟机", s(r, "deviceName")}}
		x.add(n)
		vm := vmByID[s(r, "deviceId")]
		if vm == "" {
			vm = vmByMAC[strings.ToLower(s(r, "mac"))]
		}
		x.edge(vm, n.ID, "nic")
		if nid := first(s(r, "networkId"), s(r, "networkName")); nid != "" {
			x.edge(n.ID, "net:"+nid, "net")
		}
	}

	// 父级健康度向上汇总：计算节点承载的云主机异常 → 计算节点 warning 提示（不覆盖自身状态）
	childBad := map[string]int{}
	for _, e := range x.edges {
		if e.Type == "hosts" && strings.HasPrefix(e.From, "host:") {
			if c := x.get(e.To); c != nil && (c.Health == HDanger) {
				childBad[e.From]++
			}
		}
	}
	for id, k := range childBad {
		if n := x.get(id); n != nil && rank(n.Health) < rank(HWarning) {
			n.Health = HWarning
			n.Reasons = append(n.Reasons, fmt.Sprintf("承载的 %d 台云主机状态异常", k))
		}
	}

	out := &Graph{Nodes: x.nodes, Edges: x.edges, Counts: map[string]Count{}}
	if out.Nodes == nil {
		out.Nodes = []Node{}
	}
	if out.Edges == nil {
		out.Edges = []Edge{}
	}
	for _, t := range []string{TPhys, THost, TVM, TVolume, TPort, TPool, TNetwork} {
		out.Counts[t] = Count{}
	}
	for _, n := range out.Nodes {
		c := out.Counts[n.Type]
		c.Total++
		switch n.Health {
		case HDanger:
			c.Danger++
			c.Abnormal++
		case HWarning:
			c.Warning++
			c.Abnormal++
		}
		if n.Health == HOff {
			c.Off++
		}
		out.Counts[n.Type] = c
	}
	out.Usage = usageOf(hosts, pools)
	out.Orphan = orphanOf(out.Nodes, time.Now())
	out.Platform = platformOf(p, meta, out)
	return out, nil
}

// poolOf 云硬盘所在后端 → 存储池节点：先按完整的 host@backend#pool 精确匹配；
// 再忽略 host 部分（不同服务节点可能给出不同主机名）按 backend#pool、最后按 backend 名匹配。
func poolOf(pools map[string]string, be string) string {
	if be == "" {
		return ""
	}
	if id, ok := pools[be]; ok {
		return id
	}
	tail := func(v string) string {
		if i := strings.Index(v, "@"); i >= 0 {
			return v[i+1:]
		}
		return v
	}
	head := func(v string) string {
		v = tail(v)
		if i := strings.Index(v, "#"); i >= 0 {
			return v[:i]
		}
		return v
	}
	keys := sortedKeys2(pools)
	for _, k := range keys {
		if tail(k) == tail(be) {
			return pools[k]
		}
	}
	for _, k := range keys {
		if head(k) == head(be) {
			return pools[k]
		}
	}
	return ""
}

func sortedKeys2(m map[string]string) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

func usageOf(hosts, pools []capacity.Row) Usage {
	var vu, vc, mu, mc, pu, pt float64
	for _, r := range hosts {
		vu, vc, mu, mc = vu+fv(r, "vcpusUsed"), vc+fv(r, "vcpusCap"), mu+fv(r, "memoryMbUsed"), mc+fv(r, "memoryMbCap")
	}
	for _, r := range pools {
		pu, pt = pu+fv(r, "usedGb"), pt+fv(r, "totalGb")
	}
	p := func(a, b float64) *float64 {
		if b <= 0 {
			return nil
		}
		v := a / b * 100
		return &v
	}
	return Usage{VCPU: p(vu, vc), Mem: p(mu, mc), Storage: p(pu, pt)}
}

func platformOf(p *provider.Provider, meta *capacity.Meta, gr *Graph) Platform {
	pl := Platform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP, Status: p.Status, AssetAt: meta.CollectedAt, AssetOK: meta.OK}
	h := HOK
	switch {
	case meta.CollectedAt == nil:
		h = HUnknown
	case p.Status == "error", gr.hasDanger():
		h = HDanger
	}
	if h == HOK {
		if !meta.OK || p.Status == "warning" {
			h = HWarning
		}
		for _, c := range gr.Counts {
			if c.Danger+c.Warning > 0 {
				h = worse(h, HWarning)
			}
		}
	}
	pl.Health = h
	return pl
}

// Overview 全部平台的摘要。
func (b *Builder) Overview(ctx context.Context, list []*provider.Provider) ([]OverviewItem, error) {
	out := make([]OverviewItem, 0, len(list))
	for _, p := range list {
		gr, err := b.Build(ctx, p)
		if err != nil {
			return nil, err
		}
		out = append(out, OverviewItem{Platform: gr.Platform, Counts: gr.Counts, Usage: gr.Usage, Hosts: hostCells(gr), Orphan: gr.Orphan})
	}
	return out, nil
}

func first(v ...string) string {
	for _, x := range v {
		if x != "" {
			return x
		}
	}
	return ""
}

func nz(v ...string) []string {
	out := []string{}
	for _, x := range v {
		if strings.TrimSpace(x) != "" && x != "0 台云主机" {
			out = append(out, x)
		}
	}
	return out
}

func reasonSuffix(r string) string {
	if r == "" {
		return ""
	}
	return "（" + r + "）"
}

func sortedKeys(m map[string]string) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	ns := make([]Node, len(ks))
	for i, k := range ks {
		ns[i] = Node{Name: m[k], ID: k}
	}
	sortNodes(ns)
	for i := range ns {
		ks[i] = ns[i].ID
	}
	return ks
}
