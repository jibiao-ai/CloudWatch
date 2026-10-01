package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

type seriesRes struct {
	Metric map[string]any    `json:"metric"`
	Value  []json.RawMessage `json:"value"`
}

// ParseSeries 解析 series/query 响应；兼容 EMLA（results[].data.result）、Prometheus（data.result）与顶层 result 三种形态。
func ParseSeries(raw []byte) []Sample {
	var d struct {
		Results []struct {
			Data struct {
				Result []seriesRes `json:"result"`
			} `json:"data"`
		} `json:"results"`
		Data   json.RawMessage `json:"data"`
		Result []seriesRes     `json:"result"`
	}
	if json.Unmarshal(raw, &d) != nil {
		return nil
	}
	var rs []seriesRes
	for _, r := range d.Results {
		rs = append(rs, r.Data.Result...)
	}
	if len(d.Data) > 0 {
		var dd struct {
			Result []seriesRes `json:"result"`
		}
		if json.Unmarshal(d.Data, &dd) == nil {
			rs = append(rs, dd.Result...)
		}
	}
	rs = append(rs, d.Result...)
	out := []Sample{}
	for _, s := range rs {
		if len(s.Value) < 2 {
			continue
		}
		v, ok := parseNum(s.Value[1])
		if !ok {
			continue
		}
		out = append(out, Sample{Labels: strLabels(s.Metric), Value: v})
	}
	return out
}

// seriesByNode 执行 PromQL 即时查询（EMLA series/query），把结果按 node_name 汇总（同节点多条取求和或最大值）。
func seriesByNode(ctx context.Context, cn *provider.Conn, expr string, agg func(a, b float64) float64) (map[string]float64, error) {
	q := url.Values{"expr": {expr}, "all_tenants": {"true"}}
	u := cn.EMLA() + fmt.Sprintf(pathSeries, cn.ProjectID()) + "?" + q.Encode()
	var raw json.RawMessage
	if err := cn.GetJSON(ctx, u, &raw); err != nil {
		return nil, err
	}
	ss := ParseSeries(raw)
	if len(ss) == 0 {
		return nil, fmt.Errorf("查询结果为空：%s", expr)
	}
	out := map[string]float64{}
	for _, s := range ss {
		name := first(s.Labels["node_name"], s.Labels["node"], s.Labels["nodename"], s.Labels["instance"])
		if name == "" {
			continue
		}
		name = shortHost(name)
		if old, ok := out[name]; ok {
			out[name] = agg(old, s.Value)
		} else {
			out[name] = s.Value
		}
	}
	return out, nil
}

func sumF(a, b float64) float64 { return a + b }
func maxF(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// 物理网卡过滤：排除回环 / 虚拟网卡，避免把云主机流量重复计入。
const phyDev = `device!~"lo|veth.*|tap.*|qvo.*|qvb.*|qbr.*|br-.*|docker.*|virbr.*|vnet.*"`

var (
	exprNetRx  = `sum by (node_name) (irate(node_network_receive_bytes_total{` + phyDev + `}[5m]))`
	exprNetTx  = `sum by (node_name) (irate(node_network_transmit_bytes_total{` + phyDev + `}[5m]))`
	exprDiskIO = `max by (node_name) (rate(node_disk_io_time_seconds_total[5m])) * 100`
)

// mergeNodeSeries 把 node_name → 值 写入节点行。
func mergeNodeSeries(nodes []Node, m map[string]float64, set func(*Node, *float64)) {
	for i := range nodes {
		if v, ok := m[shortHost(nodes[i].Name)]; ok {
			x := v
			set(&nodes[i], &x)
		}
	}
}
