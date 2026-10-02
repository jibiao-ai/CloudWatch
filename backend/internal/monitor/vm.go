package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

// shortHost node-1.domain.tld → node-1。
func shortHost(h string) string {
	h = strings.TrimSpace(h)
	if i := strings.Index(h, "."); i > 0 && !isIP(h) {
		return h[:i]
	}
	return h
}

func isIP(s string) bool {
	for _, c := range s {
		if (c < '0' || c > '9') && c != '.' {
			return false
		}
	}
	return s != ""
}

// ---------- Nova：宿主机核数 ----------

type hypervisor struct {
	Host   string
	IP     string
	VCPUs  float64
	Used   float64
	VMs    float64
	HasVMs bool
}

// collectHypervisors GET {nova}/os-hypervisors/detail → 每台宿主机的总核数 / 已分配核数 / 运行中云主机数。
func collectHypervisors(ctx context.Context, cn *provider.Conn) ([]hypervisor, error) {
	var doc struct {
		Hypervisors []struct {
			Hostname   string   `json:"hypervisor_hostname"`
			HostIP     string   `json:"host_ip"`
			VCPUs      *float64 `json:"vcpus"`
			VCPUsUsed  *float64 `json:"vcpus_used"`
			RunningVMs *float64 `json:"running_vms"`
		} `json:"hypervisors"`
	}
	if err := cn.GetJSON(ctx, cn.Nova()+"/os-hypervisors/detail", &doc); err != nil {
		return nil, err
	}
	if len(doc.Hypervisors) == 0 {
		return nil, fmt.Errorf("未返回宿主机信息")
	}
	out := make([]hypervisor, 0, len(doc.Hypervisors))
	for _, h := range doc.Hypervisors {
		x := hypervisor{Host: shortHost(h.Hostname), IP: h.HostIP}
		if h.VCPUs != nil {
			x.VCPUs = *h.VCPUs
		}
		if h.VCPUsUsed != nil {
			x.Used = *h.VCPUsUsed
		}
		if h.RunningVMs != nil {
			x.VMs, x.HasVMs = *h.RunningVMs, true
		}
		out = append(out, x)
	}
	return out, nil
}

// mergeHypervisors 按节点名（去域名后缀）或 IP 把核数合并到节点行。
func mergeHypervisors(nodes []Node, hv []hypervisor) {
	for i := range nodes {
		for _, h := range hv {
			if h.Host == shortHost(nodes[i].Name) || (h.IP != "" && h.IP == nodes[i].HostIP) {
				t, u := h.VCPUs, h.Used
				nodes[i].CoresTotal, nodes[i].CoresUsed = &t, &u
				if h.HasVMs {
					v := h.VMs
					nodes[i].VMCount = &v
				}
				break
			}
		}
	}
}

// ---------- Nova：云主机列表 ----------

type novaServer struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	TenantID string `json:"tenant_id"`
	Created  string `json:"created"`
	AZ       string `json:"OS-EXT-AZ:availability_zone"`
	Host     string `json:"OS-EXT-SRV-ATTR:host"`
	Hyp      string `json:"OS-EXT-SRV-ATTR:hypervisor_hostname"`
	Flavor   struct {
		ID    string `json:"id"`
		VCPUs int    `json:"vcpus"`
		RAM   int    `json:"ram"`
		Disk  int    `json:"disk"`
		Name  string `json:"original_name"`
	} `json:"flavor"`
	Addresses map[string][]struct {
		Addr string `json:"addr"`
	} `json:"addresses"`
}

// collectVMs GET {nova}/servers/detail?all_tenants=true，按 servers_links 翻页（最多 10 页）。
func collectVMs(ctx context.Context, cn *provider.Conn) ([]VM, error) {
	u := cn.Nova() + "/servers/detail?all_tenants=true&limit=500"
	var out []VM
	for page := 0; page < 10 && u != ""; page++ {
		var doc struct {
			Servers []novaServer `json:"servers"`
			Links   []struct {
				Rel  string `json:"rel"`
				Href string `json:"href"`
			} `json:"servers_links"`
		}
		if err := cn.GetJSON(ctx, u, &doc); err != nil {
			return nil, err
		}
		for _, s := range doc.Servers {
			ips := []string{}
			names := make([]string, 0, len(s.Addresses))
			for k := range s.Addresses {
				names = append(names, k)
			}
			sort.Strings(names)
			for _, k := range names {
				for _, a := range s.Addresses[k] {
					ips = append(ips, a.Addr)
				}
			}
			node := shortHost(first(s.Host, s.Hyp))
			out = append(out, VM{ID: s.ID, Name: s.Name, Status: strings.ToUpper(s.Status), Node: node, IPs: strings.Join(ips, ", "),
				Flavor: s.Flavor.Name, FlavorID: s.Flavor.ID, VCPUs: s.Flavor.VCPUs, RAMMB: s.Flavor.RAM, DiskGB: s.Flavor.Disk, AZ: s.AZ, ProjectID: s.TenantID, CreatedAt: s.Created})
		}
		u = ""
		for _, l := range doc.Links {
			if l.Rel == "next" {
				u = l.Href
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return naturalLess(out[i].Name, out[j].Name) })
	return out, nil
}

// fillVMFlavors 云主机详情只带规格 ID（微版本 < 2.47）或 original_name，vCPU / 内存需到 Nova 规格详情补齐。
// GET {nova}/flavors/detail?is_public=None → 按规格 ID 补 规格名称 / vCPU / 内存 / 磁盘；返回规格条数。
func fillVMFlavors(ctx context.Context, cn *provider.Conn, vms []VM) (int, error) {
	var doc struct {
		Flavors []struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			VCPUs int    `json:"vcpus"`
			RAM   int    `json:"ram"`
			Disk  int    `json:"disk"`
		} `json:"flavors"`
	}
	if err := cn.GetJSON(ctx, cn.Nova()+"/flavors/detail?is_public=None", &doc); err != nil {
		return 0, err
	}
	byID := map[string]int{}
	byName := map[string]int{}
	for i, f := range doc.Flavors {
		byID[f.ID] = i
		byName[f.Name] = i
	}
	for i := range vms {
		v := &vms[i]
		idx, ok := byID[v.FlavorID]
		if !ok {
			idx, ok = byName[v.Flavor]
		}
		if !ok {
			continue
		}
		f := doc.Flavors[idx]
		v.Flavor, v.VCPUs, v.RAMMB, v.DiskGB = first(f.Name, v.Flavor), f.VCPUs, f.RAM, f.Disk
	}
	return len(doc.Flavors), nil
}

// ---------- Gnocchi：云主机性能 ----------

// Gnocchi 指标名（接口文档 4.x 云主机监控指标）。
const (
	gCPU   = "cpu_util"
	gMem   = "memory.util"
	gDiskR = "disk.read.bytes.rate"
	gDiskW = "disk.write.bytes.rate"
)

// gnocchiMeasures GET {gnocchi}/v1/resource/generic/{id}/metric/{metric}/measures → [[时间, 粒度, 值], …]
func gnocchiMeasures(ctx context.Context, cn *provider.Conn, id, metric string, since time.Time, gran int) ([]Point, error) {
	q := url.Values{"start": {since.UTC().Format("2006-01-02T15:04:05Z")}, "granularity": {fmt.Sprint(gran)}, "aggregation": {"mean"}}
	u := cn.Gnocchi() + "/v1/resource/generic/" + url.PathEscape(id) + "/metric/" + metric + "/measures?" + q.Encode()
	var raw [][]json.RawMessage
	if err := cn.GetJSON(ctx, u, &raw); err != nil {
		return nil, err
	}
	pts := make([]Point, 0, len(raw))
	for _, r := range raw {
		if len(r) < 3 {
			continue
		}
		var ts string
		if json.Unmarshal(r[0], &ts) != nil {
			continue
		}
		t, err := time.Parse(time.RFC3339, ts)
		if err != nil {
			continue
		}
		v, ok := parseNum(r[2])
		if !ok {
			continue
		}
		pts = append(pts, Point{T: t.UnixMilli(), V: v})
	}
	return pts, nil
}

// fillVMMetrics 为运行中的云主机并发读取最近一次 cpu_util / memory.util（最多 300 台，整体限时 50 秒）。
func fillVMMetrics(ctx context.Context, cn *provider.Conn, vms []VM) (okN int, firstErr error) {
	ctx, cancel := context.WithTimeout(ctx, 50*time.Second)
	defer cancel()
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	since := time.Now().Add(-30 * time.Minute)
	last := func(p []Point) *float64 {
		if len(p) == 0 {
			return nil
		}
		v := p[len(p)-1].V
		return &v
	}
	n := 0
	for i := range vms {
		if vms[i].Status != "ACTIVE" || n >= 300 {
			continue
		}
		n++
		wg.Add(1)
		sem <- struct{}{}
		go func(v *VM) {
			defer wg.Done()
			defer func() { <-sem }()
			c, err1 := gnocchiMeasures(ctx, cn, v.ID, gCPU, since, 300)
			m, err2 := gnocchiMeasures(ctx, cn, v.ID, gMem, since, 300)
			w, _ := gnocchiMeasures(ctx, cn, v.ID, gDiskW, since, 300) // 写速率缺失不影响 CPU / 内存采集结论
			mu.Lock()
			defer mu.Unlock()
			v.CPUPercent, v.MemPercent, v.WriteBps = last(c), last(m), last(w)
			if err1 == nil || err2 == nil {
				okN++
			} else if firstErr == nil {
				firstErr = err1
			}
		}(&vms[i])
	}
	wg.Wait()
	return okN, firstErr
}

var vmRanges = map[string]struct {
	D    time.Duration
	Gran int
}{
	"1h": {time.Hour, 300}, "6h": {6 * time.Hour, 300}, "24h": {24 * time.Hour, 900}, "7d": {7 * 24 * time.Hour, 7200}, "30d": {30 * 24 * time.Hour, 86400},
}

// VMMetrics 云主机详情弹窗：实时向 Gnocchi 取 CPU / 内存 / 磁盘读写速率的历史曲线。
func (m *Manager) VMMetrics(ctx context.Context, providerID, vmID, rng string) (map[string][]Point, error) {
	for _, c := range vmID {
		if !(c == '-' || c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return nil, httpx.Err(400, "云主机 ID 格式不正确")
		}
	}
	r, ok := vmRanges[rng]
	if !ok {
		r = vmRanges["6h"]
	}
	cn, _, err := m.Provider.Connect(ctx, providerID)
	if err != nil {
		return nil, httpx.Err(502, err.Error())
	}
	since := time.Now().Add(-r.D)
	out := map[string][]Point{}
	var firstErr error
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, name := range []string{gCPU, gMem, gDiskR, gDiskW} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			p, err := gnocchiMeasures(ctx, cn, vmID, name, since, r.Gran)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				p = []Point{}
			}
			out[name] = p
		}(name)
	}
	wg.Wait()
	if firstErr != nil {
		bad := 0
		for _, p := range out {
			if len(p) == 0 {
				bad++
			}
		}
		if bad == len(out) {
			return nil, httpx.Err(502, "读取 Gnocchi 指标失败："+firstErr.Error())
		}
	}
	return out, nil
}
