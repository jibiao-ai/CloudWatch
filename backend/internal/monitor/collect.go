package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

func ptr(v float64, ok bool) *float64 {
	if !ok {
		return nil
	}
	return &v
}

// emlaGet 调用 EMLA 接口并解析为 Metric 列表。
func emlaGet(ctx context.Context, cn *provider.Conn, path string, q url.Values) ([]Metric, error) {
	u := cn.EMLA() + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var raw json.RawMessage
	if err := cn.GetJSON(ctx, u, &raw); err != nil {
		return nil, err
	}
	return ParseEMLA(raw)
}

func filter(names string) url.Values { return url.Values{"metrics_filter": {names}} }

// Result 一次完整采集的产物。
type Result struct {
	Summary  Summary
	Nodes    []Node
	Disks    []Disk
	VMs      []VM
	Services []Service
	Storage  []Series
	Steps    []Step
	Samples  []SamplePoint // 写入 metric_samples 的历史点
	flavorN  int           // 规格条数（仅用于采集明细「条数」）
}

// SamplePoint 历史样本。
type SamplePoint struct {
	Metric string
	Target string
	Value  float64
}

// Collect 依次调用各 EMLA 接口；任一接口失败只记入 Steps，不中断其它接口。全部失败视为采集失败。
func Collect(ctx context.Context, cn *provider.Conn) *Result {
	r := &Result{Nodes: []Node{}, Disks: []Disk{}, VMs: []VM{}, Services: []Service{}, Storage: []Series{}}
	step := func(key, label, path string, fn func() error) {
		t0 := time.Now()
		err := fn()
		s := Step{Key: key, Label: label, Path: path, OK: err == nil, DurationMs: time.Since(t0).Milliseconds()}
		if err != nil {
			s.Error = err.Error()
			if len(s.Error) > 300 {
				s.Error = s.Error[:300] + "…"
			}
		}
		r.Steps = append(r.Steps, s)
	}
	sum := &r.Summary

	step("storage_capacity", "存储集群实际容量", pathStorage, func() error {
		ms, err := emlaGet(ctx, cn, pathStorage, filter(storageCapMetrics))
		if err != nil {
			return err
		}
		// 文档中三个指标分别查询；这里先尝试合并查询，缺失的再逐个补查
		get := func(name string) (float64, bool) {
			if v, ok := Find(ms, name).First(); ok {
				return v, true
			}
			one, err := emlaGet(ctx, cn, pathStorage, filter(name))
			if err != nil {
				return 0, false
			}
			return Find(one, name).First()
		}
		free, ok1 := get("storage_actual_capacity_free_bytes")
		used, ok2 := get("storage_actual_capacity_usage_bytes")
		total, ok3 := get("storage_actual_capacity_total_bytes")
		if !ok1 && !ok2 && !ok3 {
			return fmt.Errorf("未返回存储容量指标")
		}
		sum.Storage.FreeBytes, sum.Storage.UsedBytes, sum.Storage.TotalBytes = ptr(free, ok1), ptr(used, ok2), ptr(total, ok3)
		if ok3 && total > 0 && ok2 {
			sum.Storage.UsedPercent = ptr(used/total*100, true)
		}
		return nil
	})

	usage := func(name string, dst *Usage) func() error {
		return func() error {
			ms, err := emlaGet(ctx, cn, pathDashboard, filter(name))
			if err != nil {
				return err
			}
			m := Find(ms, name)
			if m == nil || len(m.Samples) == 0 {
				return fmt.Errorf("未返回指标 %s", name)
			}
			t, ok1 := m.ByLabel("status", "total")
			u, ok2 := m.ByLabel("status", "usage")
			p, ok3 := m.ByLabel("status", "percent")
			dst.Total, dst.Usage, dst.Percent = ptr(t, ok1), ptr(u, ok2), ptr(p, ok3)
			if dst.Percent == nil && ok1 && ok2 && t > 0 {
				dst.Percent = ptr(u/t*100, true)
			}
			return nil
		}
	}
	step("vcpu", "虚机 vCPU 使用情况", pathDashboard, usage("dashboard_instances_vcpu_usage", &sum.VCPU))
	step("memory", "云主机内存使用情况", pathDashboard, usage("dashboard_instances_memory_usage", &sum.Memory))

	step("instances", "云主机状态分布", pathDashboard, func() error {
		ms, err := emlaGet(ctx, cn, pathDashboard, filter("dashboard_instances_state"))
		if err != nil {
			return err
		}
		m := Find(ms, "dashboard_instances_state")
		if m == nil || len(m.Samples) == 0 {
			return fmt.Errorf("未返回云主机状态")
		}
		a, ok := m.ByLabel("status", "running")
		sum.Instances.Running = ptr(a, ok)
		a, ok = m.ByLabel("status", "error")
		sum.Instances.Error = ptr(a, ok)
		a, ok = m.ByLabel("status", "shutdown")
		sum.Instances.Shutdown = ptr(a, ok)
		a, ok = m.ByLabel("status", "recycle_bin")
		sum.Instances.RecycleBin = ptr(a, ok)
		a, ok = m.ByLabel("status", "others")
		if !ok {
			a, ok = m.ByLabel("status", "other") // 文档字段说明为 other，示例为 others
		}
		sum.Instances.Others = ptr(a, ok)
		return nil
	})

	health := func(name string, dst **float64) func() error {
		return func() error {
			ms, err := emlaGet(ctx, cn, pathDashboard, filter(name))
			if err != nil {
				return err
			}
			v, ok := Find(ms, name).First()
			if !ok {
				return fmt.Errorf("未返回指标 %s", name)
			}
			*dst = ptr(v, true)
			return nil
		}
	}
	step("control_health", "平台控制面健康状态", pathDashboard, health("dashboard_control_plane_service_health", &sum.ControlPlaneHealth))
	step("storage_health", "存储服务健康状态", pathDashboard, health("dashboard_storage_service_health", &sum.StorageServiceHealth))

	step("iops", "存储集群 IOPS", pathDashboard, func() error {
		rd, err := emlaGet(ctx, cn, pathDashboard, filter("dashboard_storage_cluster_iops_read"))
		if err != nil {
			return err
		}
		wr, err2 := emlaGet(ctx, cn, pathDashboard, filter("dashboard_storage_cluster_iops_write"))
		if err2 != nil {
			return err2
		}
		v, ok := Find(rd, "dashboard_storage_cluster_iops_read").First()
		sum.IopsRead = ptr(v, ok)
		v, ok = Find(wr, "dashboard_storage_cluster_iops_write").First()
		sum.IopsWrite = ptr(v, ok)
		if sum.IopsRead == nil && sum.IopsWrite == nil {
			return fmt.Errorf("未返回 IOPS 指标")
		}
		return nil
	})

	step("services", "平台控制服务状态", pathServices, func() error {
		ms, err := emlaGet(ctx, cn, pathServices, nil)
		if err != nil {
			return err
		}
		for _, m := range ms {
			sv := Service{Name: m.Name, Instances: len(m.Samples)}
			for i, sp := range m.Samples {
				if sv.State == nil || sp.Value > *sv.State {
					v := sp.Value
					sv.State = &v
				}
				if i == 0 {
					sv.At, sv.Labels = sp.At, pickServiceLabels(sp.Labels)
				}
			}
			r.Services = append(r.Services, sv)
		}
		sort.Slice(r.Services, func(i, j int) bool { return r.Services[i].Name < r.Services[j].Name })
		if len(r.Services) == 0 {
			return fmt.Errorf("未返回服务状态")
		}
		return nil
	})

	step("storage_cluster", "存储集群状态", pathStorage, func() error {
		ms, err := emlaGet(ctx, cn, pathStorage, nil)
		if err != nil {
			return err
		}
		for _, m := range ms {
			if m.Name == "storage_health_status" {
				if v, ok := m.First(); ok {
					sum.StorageHealth = ptr(v, true)
				}
			}
			for _, s := range m.Samples {
				if len(r.Storage) >= 400 {
					break
				}
				r.Storage = append(r.Storage, Series{Metric: m.Name, Labels: pickLabels(s.Labels), Value: s.Value})
			}
		}
		if len(ms) == 0 {
			return fmt.Errorf("未返回存储集群指标")
		}
		return nil
	})

	step("disks", "物理节点磁盘信息", pathStorage, func() error {
		ms, err := emlaGet(ctx, cn, pathStorage, filter("storage_cluster_disk_info"))
		if err != nil {
			return err
		}
		m := Find(ms, "storage_cluster_disk_info")
		if m == nil {
			return fmt.Errorf("未返回磁盘信息")
		}
		for _, s := range m.Samples {
			l := s.Labels
			node := first(l["node_name"], l["node"], l["nodename"])
			r.Disks = append(r.Disks, Disk{Node: node, HostIP: l["host_ip"], Device: l["device"], Model: l["device_model"], Serial: l["device_serial_number"],
				Type: l["device_type"], Capacity: l["disk_capacity"], Usage: l["disk_usage"], Healthy: l["status_healthy"], UsedLife: l["used_life"],
				Purpose: l["purpose"], OsdID: l["osd_id"], Slot: l["slot_num"], PowerHours: l["power_on_hours"], Rotation: l["rotation_rate"]})
		}
		sort.Slice(r.Disks, func(i, j int) bool {
			if r.Disks[i].Node != r.Disks[j].Node {
				return naturalLess(r.Disks[i].Node, r.Disks[j].Node)
			}
			return r.Disks[i].Device < r.Disks[j].Device
		})
		return nil
	})

	step("nodes", "物理节点资源", pathNodes, func() error {
		ms, err := emlaGet(ctx, cn, pathNodes, filter(nodeMetrics))
		if err != nil {
			return err
		}
		r.Nodes = buildNodes(ms)
		if len(r.Nodes) == 0 {
			return fmt.Errorf("未返回节点指标")
		}
		return nil
	})

	step("hypervisors", "计算节点总核数 / 已用核数（Nova）", "/v2.1/os-hypervisors/detail", func() error {
		hv, err := collectHypervisors(ctx, cn)
		if err != nil {
			return err
		}
		mergeHypervisors(r.Nodes, hv)
		return nil
	})
	step("node_network", "节点网络收发流量", seriesPath, func() error {
		rx, err := seriesByNode(ctx, cn, exprNetRx, sumF)
		if err != nil {
			return err
		}
		mergeNodeSeries(r.Nodes, rx, func(n *Node, v *float64) { n.NetRx = v })
		tx, err := seriesByNode(ctx, cn, exprNetTx, sumF)
		if err != nil {
			return err
		}
		mergeNodeSeries(r.Nodes, tx, func(n *Node, v *float64) { n.NetTx = v })
		return nil
	})
	step("node_disk_io", "节点磁盘 I/O 使用率", seriesPath, func() error {
		io, err := seriesByNode(ctx, cn, exprDiskIO, maxF)
		if err != nil {
			return err
		}
		mergeNodeSeries(r.Nodes, io, func(n *Node, v *float64) {
			if *v > 100 {
				*v = 100
			}
			n.DiskIO = v
		})
		return nil
	})

	step("vms", "云主机列表（Nova）", "/v2.1/servers/detail?all_tenants=true", func() error {
		vms, err := collectVMs(ctx, cn)
		if err != nil {
			return err
		}
		r.VMs = vms
		return nil
	})
	if len(r.VMs) > 0 {
		step("vm_flavors", "云主机规格（Nova，补充 vCPU / 内存）", "/v2.1/flavors/detail", func() error {
			n, err := fillVMFlavors(ctx, cn, r.VMs)
			r.flavorN = n
			return err
		})
		step("vm_metrics", "云主机 CPU / 内存（Gnocchi）", "/v1/resource/generic/{id}/metric/{cpu_util|memory.util}/measures", func() error {
			okN, err := fillVMMetrics(ctx, cn, r.VMs)
			if okN == 0 && err != nil {
				return err
			}
			return nil
		})
	}

	fillStepCounts(r)
	r.Samples = samplesOf(r)
	return r
}

// fillStepCounts 采集明细「条数」：列表类接口为返回/解析的条数，单值类指标接口成功记 1。
func fillStepCounts(r *Result) {
	withMetric := 0
	for _, v := range r.VMs {
		if v.CPUPercent != nil || v.MemPercent != nil {
			withMetric++
		}
	}
	list := map[string]int{"services": len(r.Services), "storage_cluster": len(r.Storage), "disks": len(r.Disks), "nodes": len(r.Nodes), "hypervisors": len(r.Nodes),
		"vms": len(r.VMs), "vm_flavors": r.flavorN, "vm_metrics": withMetric, "node_network": len(r.Nodes), "node_disk_io": len(r.Nodes)}
	for i := range r.Steps {
		s := &r.Steps[i]
		if n, ok := list[s.Key]; ok {
			s.Count = n
		} else if s.OK {
			s.Count = 1
		}
	}
}

// pickServiceLabels 服务指标上对展示有用的标签。
func pickServiceLabels(l map[string]string) map[string]string {
	out := map[string]string{}
	for _, k := range []string{"service", "namespace", "node_name", "host_ip", "pod", "job"} {
		if v := l[k]; v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func first(a ...string) string {
	for _, s := range a {
		if s != "" {
			return s
		}
	}
	return ""
}

// pickLabels 只保留对展示有用的标签，避免快照过大。
func pickLabels(l map[string]string) map[string]string {
	keep := []string{"name", "pool_id", "instance", "device", "osd", "ceph_daemon", "state"}
	out := map[string]string{}
	for _, k := range keep {
		if v := l[k]; v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// naturalLess 让 node-2 排在 node-10 之前。
func naturalLess(a, b string) bool {
	ia, ib := trailingNum(a), trailingNum(b)
	pa, pb := strings.TrimRight(a, "0123456789"), strings.TrimRight(b, "0123456789")
	if pa == pb && ia >= 0 && ib >= 0 {
		return ia < ib
	}
	return a < b
}

func trailingNum(s string) int {
	i := len(s)
	for i > 0 && s[i-1] >= '0' && s[i-1] <= '9' {
		i--
	}
	if i == len(s) {
		return -1
	}
	n := 0
	for _, c := range s[i:] {
		n = n*10 + int(c-'0')
	}
	return n
}

// buildNodes 把 /ecms/nodes 的各指标按 node_name 聚合成节点行。
func buildNodes(ms []Metric) []Node {
	idx := map[string]*Node{}
	get := func(l map[string]string) *Node {
		name := first(l["node_name"], l["node"], l["nodename"], l["host_ip"], l["instance"])
		if name == "" {
			return nil
		}
		n := idx[name]
		if n == nil {
			n = &Node{Name: name}
			idx[name] = n
		}
		if n.HostIP == "" {
			n.HostIP = l["host_ip"]
		}
		return n
	}
	for _, m := range ms {
		for _, s := range m.Samples {
			n := get(s.Labels)
			if n == nil {
				continue
			}
			v := s.Value
			switch m.Name {
			case "node_cpu_utilization_total":
				n.CPUPercent = &v
			case "node_cpu_utilization_user":
				n.CPUUser = &v
			case "node_cpu_utilization_system":
				n.CPUSystem = &v
			case "node_cpu_utilization_iowait":
				n.CPUIowait = &v
			case "node_disk_io_latency":
				if n.DiskLatency == nil || v > *n.DiskLatency {
					n.DiskLatency = &v
				}
			case "node_memory_total":
				n.MemTotal = &v
			case "node_memory_free":
				n.MemFree = &v
			case "node_memory_cached":
				n.MemCached = &v
			}
		}
	}
	out := make([]Node, 0, len(idx))
	for _, n := range idx {
		// 总 CPU 使用率缺失时：100 - idle 太依赖 idle 指标，这里用 user+system+iowait 近似
		if n.CPUPercent == nil && (n.CPUUser != nil || n.CPUSystem != nil) {
			sum := 0.0
			for _, p := range []*float64{n.CPUUser, n.CPUSystem, n.CPUIowait} {
				if p != nil {
					sum += *p
				}
			}
			n.CPUPercent = &sum
		}
		if n.MemTotal != nil && n.MemFree != nil && *n.MemTotal > 0 {
			p := (*n.MemTotal - *n.MemFree) / *n.MemTotal * 100
			n.MemPercent = &p
		}
		out = append(out, *n)
	}
	sort.Slice(out, func(i, j int) bool { return naturalLess(out[i].Name, out[j].Name) })
	return out
}

// samplesOf 抽取要写入历史表的数值点（平台级 + 每个节点）。
func samplesOf(r *Result) []SamplePoint {
	var out []SamplePoint
	add := func(metric, target string, v *float64) {
		if v != nil {
			out = append(out, SamplePoint{Metric: metric, Target: target, Value: *v})
		}
	}
	s := r.Summary
	add("vcpu_percent", "", s.VCPU.Percent)
	add("memory_percent", "", s.Memory.Percent)
	add("storage_used_percent", "", s.Storage.UsedPercent)
	add("storage_used_bytes", "", s.Storage.UsedBytes)
	add("storage_total_bytes", "", s.Storage.TotalBytes)
	add("iops_read", "", s.IopsRead)
	add("iops_write", "", s.IopsWrite)
	add("vm_running", "", s.Instances.Running)
	add("vm_error", "", s.Instances.Error)
	add("vm_shutdown", "", s.Instances.Shutdown)
	for _, n := range r.Nodes {
		add("node_cpu_percent", n.Name, n.CPUPercent)
		add("node_mem_percent", n.Name, n.MemPercent)
		add("node_net_rx", n.Name, n.NetRx)
		add("node_net_tx", n.Name, n.NetTx)
		add("node_disk_io", n.Name, n.DiskIO)
		add("node_disk_latency", n.Name, n.DiskLatency)
	}
	return out
}
