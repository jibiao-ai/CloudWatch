package capacity

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

// Step 一次采集中单个接口的调用结果。
type Step struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	Path       string `json:"path"`
	OK         bool   `json:"ok"`
	Count      int    `json:"count"`
	Error      string `json:"error,omitempty"`
	DurationMs int64  `json:"durationMs"`
}

// Result 一个平台的采集结果；某类资源采集失败时对应切片为 nil（入库时保留上一次成功的数据）。
type Result struct {
	Phys, Nodes, VMs, Volumes, Ports, Pools []Row
	Steps                                   []Step
}

const (
	pageSize = 500
	maxPages = 100 // 单类资源最多 5 万条
)

type fetched struct {
	items []map[string]any
	err   error
	took  time.Duration
}

// getAll 用 limit + marker 翻页（不跟随响应里的 next 链接：其主机名常为集群内部域名，CloudWatch 无法访问）。
func getAll(ctx context.Context, cn *provider.Conn, base, key string, extra url.Values) ([]map[string]any, error) {
	var out []map[string]any
	marker, last := "", ""
	for p := 0; p < maxPages; p++ {
		q := url.Values{}
		for k, v := range extra {
			q[k] = v
		}
		q.Set("limit", fmt.Sprint(pageSize))
		if marker != "" {
			q.Set("marker", marker)
		}
		sep := "?"
		if strings.Contains(base, "?") {
			sep = "&"
		}
		var doc map[string]json.RawMessage
		if err := cn.GetJSON(ctx, base+sep+q.Encode(), &doc); err != nil {
			return out, err
		}
		var page []map[string]any
		if raw, ok := doc[key]; ok {
			if err := json.Unmarshal(raw, &page); err != nil {
				return out, fmt.Errorf("解析 %s 失败：%w", key, err)
			}
		} else {
			return out, fmt.Errorf("响应中没有 %s 字段", key)
		}
		out = append(out, page...)
		var links []struct{ Rel, Href string }
		hasNext := false
		if json.Unmarshal(doc[key+"_links"], &links) == nil {
			for _, l := range links {
				if l.Rel == "next" {
					hasNext = true
				}
			}
		}
		if len(page) == 0 || (!hasNext && len(page) < pageSize) {
			break
		}
		id := toStr(page[len(page)-1]["id"])
		if id == "" || id == last {
			break
		}
		marker, last = id, id
	}
	return out, nil
}

func timed(fn func() ([]map[string]any, error)) fetched {
	t0 := time.Now()
	items, err := fn()
	return fetched{items, err, time.Since(t0)}
}

// Collect 并发调用接口文档第 6 章的各接口，拼出节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 存储池。
func Collect(ctx context.Context, cn *provider.Conn) *Result {
	var (
		hv, srv, vol, net, sub, port, pool fetched
		phys, proj, flv, sgs               fetched
		wg                                 sync.WaitGroup
	)
	run := func(dst *fetched, fn func() ([]map[string]any, error)) {
		wg.Add(1)
		go func() { defer wg.Done(); *dst = timed(fn) }()
	}
	nova, cinder, neutron := cn.Nova(), cn.Cinder(), cn.Neutron()
	run(&hv, func() ([]map[string]any, error) { // 6.1 计算节点：GET {nova}/os-hypervisors/detail
		var doc struct {
			H []map[string]any `json:"hypervisors"`
		}
		err := cn.GetJSON(ctx, nova+"/os-hypervisors/detail", &doc)
		return doc.H, err
	})
	run(&srv, func() ([]map[string]any, error) { // 6.2 云主机：GET {nova}/servers/detail?all_tenants=true
		return getAll(ctx, cn, nova+"/servers/detail", "servers", url.Values{"all_tenants": {"true"}})
	})
	run(&vol, func() ([]map[string]any, error) { return collectVolumes(ctx, cn, cinder) }) // 6.3 云硬盘
	run(&net, func() ([]map[string]any, error) { return getAll(ctx, cn, neutron+"/networks", "networks", nil) })
	run(&sub, func() ([]map[string]any, error) { return getAll(ctx, cn, neutron+"/subnets", "subnets", nil) })
	run(&port, func() ([]map[string]any, error) { return getAll(ctx, cn, neutron+"/ports", "ports", nil) }) // 6.4 虚拟网卡
	run(&pool, func() ([]map[string]any, error) {                                                           // 6.5 存储后端：GET {cinder}/scheduler-stats/get_pools?detail=True
		var doc struct {
			P []map[string]any `json:"pools"`
		}
		err := cn.GetJSON(ctx, cinder+"/scheduler-stats/get_pools?detail=True", &doc)
		return doc.P, err
	})
	run(&phys, func() ([]map[string]any, error) { // 4.1.11 平台物理节点信息查询：GET coaster.<根域名>/v2/nodes
		var raw json.RawMessage
		if err := cn.GetJSON(ctx, cn.Coaster()+"/v2/nodes", &raw); err != nil {
			return nil, err
		}
		return parseNodes(raw)
	})
	run(&proj, func() ([]map[string]any, error) { // Keystone 项目（ID → 名称）：GET {keystone}/v3/projects
		return getAll(ctx, cn, cn.Keystone()+"/projects", "projects", nil)
	})
	run(&flv, func() ([]map[string]any, error) { // Nova 规格（ID → 名称 / vCPU / 内存）：GET {nova}/flavors/detail
		return getAll(ctx, cn, nova+"/flavors/detail", "flavors", url.Values{"is_public": {"None"}})
	})
	run(&sgs, func() ([]map[string]any, error) { // Neutron 安全组：GET {neutron}/security-groups
		return getAll(ctx, cn, neutron+"/security-groups", "security_groups", nil)
	})
	wg.Wait()

	r := &Result{}
	add := func(key, label, path string, f fetched) bool {
		s := Step{Key: key, Label: label, Path: path, OK: f.err == nil, Count: len(f.items), DurationMs: f.took.Milliseconds()}
		if f.err != nil {
			s.Error = f.err.Error()
			if len(s.Error) > 300 {
				s.Error = s.Error[:300] + "…"
			}
		}
		r.Steps = append(r.Steps, s)
		return f.err == nil
	}
	okPhys := add("phys", "物理节点（平台物理节点信息查询接口）", "coaster /v2/nodes", phys)
	okHV := add("nodes", "计算节点（Nova 虚拟机监控程序）", "/v2.1/os-hypervisors/detail", hv)
	okSrv := add("vms", "虚拟机（Nova 云主机详情）", "/v2.1/servers/detail?all_tenants=true", srv)
	okVol := add("volumes", "云硬盘（Cinder 云硬盘详情）", "/v3/{project_id}/volumes/detail", vol)
	okNet := add("networks", "网络（Neutron，用于解析网卡所属网络）", "/v2.0/networks", net)
	okSub := add("subnets", "子网（Neutron，用于解析网卡所属子网）", "/v2.0/subnets", sub)
	okPort := add("ports", "虚拟网卡（Neutron 端口）", "/v2.0/ports", port)
	okPool := add("pools", "集群存储（Cinder 存储后端详情）", "/v3/{project_id}/scheduler-stats/get_pools?detail=True", pool)
	okProj := add("projects", "项目（Keystone，用于解析项目名称）", "/v3/projects", proj)
	okFlv := add("flavors", "规格（Nova，用于解析规格名称 / vCPU / 内存）", "/v2.1/flavors/detail", flv)
	okSG := add("sgs", "安全组（Neutron，用于展示虚拟机安全组详情）", "/v2.0/security-groups", sgs)

	vmName := map[string]string{}
	for _, s := range srv.items {
		vmName[str(s, "id")] = str(s, "name")
	}
	netName := map[string]string{}
	for _, n := range net.items {
		netName[str(n, "id")] = str(n, "name")
	}
	subCIDR := map[string]string{}
	for _, s := range sub.items {
		subCIDR[str(s, "id")] = str(s, "cidr")
	}
	lk := &lookups{proj: map[string]string{}, flavors: map[string]map[string]any{}, vols: map[string]map[string]any{}, sgs: map[string]map[string]any{}}
	if okProj {
		for _, p := range proj.items {
			lk.proj[str(p, "id")] = str(p, "name")
		}
	}
	if cn.ProjectID() != "" && lk.proj[cn.ProjectID()] == "" {
		lk.proj[cn.ProjectID()] = cn.ProjectName() // 无权列出项目时，至少能解析当前登录项目
	}
	if okFlv {
		for _, f := range flv.items {
			lk.flavors[str(f, "id")] = f
		}
	}
	if okSG {
		for _, g := range sgs.items {
			lk.sgs[str(g, "id")] = g
		}
	}
	if okVol {
		for _, v := range vol.items {
			lk.vols[str(v, "id")] = v
		}
	}
	if okPhys {
		r.Phys = make([]Row, 0, len(phys.items))
		for _, n := range phys.items {
			row := physRow(n)
			if isNovaModel(row) { // 型号为 OpenStack Nova 的是虚拟机资源，不属于物理节点
				continue
			}
			r.Phys = append(r.Phys, row)
		}
	}
	if okHV {
		r.Nodes = make([]Row, 0, len(hv.items))
		for _, h := range hv.items {
			if isIronic(h) { // 过滤 ironic.compute.domain.tld 开头的虚拟机监控程序
				continue
			}
			r.Nodes = append(r.Nodes, nodeRow(h))
		}
	}
	if okSrv {
		r.VMs = make([]Row, 0, len(srv.items))
		for _, s := range srv.items {
			r.VMs = append(r.VMs, vmRow(s, lk))
		}
	}
	if okVol {
		r.Volumes = make([]Row, 0, len(vol.items))
		for _, v := range vol.items {
			r.Volumes = append(r.Volumes, volumeRow(v, vmName, lk))
		}
	}
	if okPort {
		r.Ports = make([]Row, 0, len(port.items))
		for _, p := range port.items {
			r.Ports = append(r.Ports, portRow(p, netName, subCIDR, vmName, okNet, okSub, lk))
		}
	}
	if okPool {
		r.Pools = make([]Row, 0, len(pool.items))
		for _, p := range pool.items {
			r.Pools = append(r.Pools, poolRow(p))
		}
	}
	return r
}

// collectVolumes 优先 GET /volumes/detail?all_tenants=1（一次取回全部详情）；
// 不支持时退回文档的两步法：GET /volumes 取 ID 列表，再逐个 GET /volumes/{volume_id}。
func collectVolumes(ctx context.Context, cn *provider.Conn, cinder string) ([]map[string]any, error) {
	items, err := getAll(ctx, cn, cinder+"/volumes/detail", "volumes", url.Values{"all_tenants": {"1"}})
	if err == nil || len(items) > 0 {
		return items, err
	}
	brief, err2 := getAll(ctx, cn, cinder+"/volumes", "volumes", url.Values{"all_tenants": {"1"}})
	if err2 != nil {
		return nil, fmt.Errorf("%v；退回列表接口也失败：%v", err, err2)
	}
	out := make([]map[string]any, len(brief))
	var mu sync.Mutex
	var wg sync.WaitGroup
	var firstErr error
	sem := make(chan struct{}, 8)
	for i, b := range brief {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, id string) {
			defer wg.Done()
			defer func() { <-sem }()
			var doc struct {
				V map[string]any `json:"volume"`
			}
			if e := cn.GetJSON(ctx, cinder+"/volumes/"+url.PathEscape(id), &doc); e != nil || doc.V == nil {
				mu.Lock()
				if firstErr == nil && e != nil {
					firstErr = e
				}
				mu.Unlock()
				out[i] = b // 详情失败时至少保留 ID / 名称
				return
			}
			out[i] = doc.V
		}(i, str(b, "id"))
	}
	wg.Wait()
	return out, firstErr
}

// parseNodes 物理节点接口返回 JSON 数组；兼容 {"nodes":[...]} 的包装形式。
func parseNodes(raw json.RawMessage) ([]map[string]any, error) {
	var arr []map[string]any
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr, nil
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("解析物理节点响应失败：%w", err)
	}
	return doc.Nodes, nil
}

// isIronic 裸金属（ironic）虚拟机监控程序：主机名以 ironic.compute.domain.tld 开头。
func isIronic(h map[string]any) bool {
	const p = "ironic.compute.domain.tld"
	return strings.HasPrefix(strings.ToLower(str(h, "hypervisor_hostname")), p) ||
		strings.HasPrefix(strings.ToLower(str(obj(h, "service"), "host")), p)
}

// isNovaModel 物理节点型号为「OpenStack Nova」（虚拟机资源，非真实物理机）。忽略大小写与多余空白。
func isNovaModel(r Row) bool {
	m, _ := r["model"].(string)
	return strings.Contains(strings.Join(strings.Fields(strings.ToLower(m)), " "), "openstack nova")
}
