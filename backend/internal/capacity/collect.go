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
	Nodes, VMs, Volumes, Ports, Pools []Row
	Steps                             []Step
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
	okHV := add("nodes", "计算节点（Nova 虚拟机监控程序）", "/v2.1/os-hypervisors/detail", hv)
	okSrv := add("vms", "虚拟机（Nova 云主机详情）", "/v2.1/servers/detail?all_tenants=true", srv)
	okVol := add("volumes", "云硬盘（Cinder 云硬盘详情）", "/v3/{project_id}/volumes/detail", vol)
	okNet := add("networks", "网络（Neutron，用于解析网卡所属网络）", "/v2.0/networks", net)
	okSub := add("subnets", "子网（Neutron，用于解析网卡所属子网）", "/v2.0/subnets", sub)
	okPort := add("ports", "虚拟网卡（Neutron 端口）", "/v2.0/ports", port)
	okPool := add("pools", "集群存储（Cinder 存储后端详情）", "/v3/{project_id}/scheduler-stats/get_pools?detail=True", pool)

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
	if okHV {
		r.Nodes = make([]Row, 0, len(hv.items))
		for _, h := range hv.items {
			r.Nodes = append(r.Nodes, nodeRow(h))
		}
	}
	if okSrv {
		r.VMs = make([]Row, 0, len(srv.items))
		for _, s := range srv.items {
			r.VMs = append(r.VMs, vmRow(s))
		}
	}
	if okVol {
		r.Volumes = make([]Row, 0, len(vol.items))
		for _, v := range vol.items {
			r.Volumes = append(r.Volumes, volumeRow(v, vmName))
		}
	}
	if okPort {
		r.Ports = make([]Row, 0, len(port.items))
		for _, p := range port.items {
			r.Ports = append(r.Ports, portRow(p, netName, subCIDR, vmName, okNet, okSub))
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
