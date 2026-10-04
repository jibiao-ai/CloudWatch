// Package analytics 运营中心：聚合配置中心（资源 / 关系）与监控中心（使用率）已落库的数据，
// 并把「资源数量 / 云主机使用率 / 云主机状态」这类现有表里没有的历史按时间积累下来，用于趋势、使用率分布与优化建议。
package analytics

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

// CST 展示与「按天」汇总统一使用东八区。
var CST = time.FixedZone("CST", 8*3600)

// KeepDays 历史样本保留天数（支撑「近一年」趋势，固定值，不随监控数据保留策略变化）。
const KeepDays = 400

func s(r capacity.Row, k string) string {
	switch v := r[k].(type) {
	case nil:
		return ""
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

func f(r capacity.Row, k string) *float64 {
	if v, ok := r[k].(float64); ok {
		return &v
	}
	return nil
}

func fv(r capacity.Row, k string) float64 {
	if p := f(r, k); p != nil {
		return *p
	}
	return 0
}

// short 去掉域名后缀（node-1.domain.tld → node-1）。
func short(h string) string {
	h = strings.TrimSpace(h)
	if i := strings.Index(h, "."); i > 0 && !isIP(h) {
		return h[:i]
	}
	return h
}

func isIP(h string) bool {
	n := 0
	for _, c := range h {
		if c == '.' {
			n++
		} else if c < '0' || c > '9' {
			return false
		}
	}
	return n == 3
}

var timeLayouts = []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999", "2006-01-02T15:04:05", "2006-01-02 15:04:05"}

// parseTime 解析 Nova / Cinder 返回的时间（带或不带时区，不带时区按 UTC）。
func parseTime(v string) (time.Time, bool) {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Time{}, false
	}
	for _, l := range timeLayouts {
		if t, err := time.ParseInLocation(l, v, time.UTC); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// Bands 使用率分布区间。
var Bands = []string{"0-20%", "20-40%", "40-60%", "60-80%", "80-100%"}

// bandOf 使用率 → 区间下标（>=100 归入最后一档）。
func bandOf(v float64) int {
	if v < 0 {
		v = 0
	}
	i := int(v / 20)
	if i > 4 {
		i = 4
	}
	return i
}

func pct(a, b float64) *float64 {
	if b <= 0 {
		return nil
	}
	v := math.Round(a/b*1000) / 10
	return &v
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func ptr(v float64) *float64 { return &v }

// stateGroup 云主机状态归类：running 运行中 / stopped 已停止 / error 异常 / other 其他（过渡态）。
func stateGroup(code string) string {
	switch strings.ToLower(code) {
	case "active":
		return "running"
	case "shutoff", "shelved", "shelved_offloaded", "suspended", "paused", "soft_deleted":
		return "stopped"
	case "error":
		return "error"
	}
	return "other"
}

var stateGroupText = map[string]string{"running": "运行中", "stopped": "已停止", "error": "异常", "other": "其他"}

func sortedKeys(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Dist 一个分布项。
type Dist struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}

// distOf 把计数表转为按数量降序（同数量按名称）的分布。
func distOf(m map[string]int) []Dist {
	out := make([]Dist, 0, len(m))
	for _, k := range sortedKeys(m) {
		out = append(out, Dist{Label: k, Value: m[k]})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Value > out[j].Value })
	return out
}

func natLess(a, b string) bool {
	ai, bi := 0, 0
	for ai < len(a) && bi < len(b) {
		ca, cb := a[ai], b[bi]
		if ca >= '0' && ca <= '9' && cb >= '0' && cb <= '9' {
			sa := ai
			for ai < len(a) && a[ai] >= '0' && a[ai] <= '9' {
				ai++
			}
			sb := bi
			for bi < len(b) && b[bi] >= '0' && b[bi] <= '9' {
				bi++
			}
			na, nb := strings.TrimLeft(a[sa:ai], "0"), strings.TrimLeft(b[sb:bi], "0")
			if len(na) != len(nb) {
				return len(na) < len(nb)
			}
			if na != nb {
				return na < nb
			}
			continue
		}
		if ca != cb {
			return ca < cb
		}
		ai++
		bi++
	}
	return len(a)-ai < len(b)-bi
}
