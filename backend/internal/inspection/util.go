package inspection

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

func cst(t time.Time) string { return t.In(analytics.CST).Format("2006-01-02 15:04:05") }
func cstMin(t time.Time) string {
	return t.In(analytics.CST).Format("2006-01-02 15:04")
}

func pctText(p *float64) string {
	if p == nil {
		return "—"
	}
	return strconv.FormatFloat(math.Round(*p*10)/10, 'f', -1, 64) + "%"
}

func num(v float64, d int) string { return strconv.FormatFloat(v, 'f', d, 64) }

// bytesText 字节 → 可读容量（二进制单位）。
func bytesText(b float64) string {
	u := []string{"B", "KiB", "MiB", "GiB", "TiB", "PiB"}
	i := 0
	for b >= 1024 && i < len(u)-1 {
		b /= 1024
		i++
	}
	if i == 0 {
		return num(b, 0) + " B"
	}
	return num(b, 2) + " " + u[i]
}

// grade 数值 ≥ bad 为异常，≥ warn 为预警。
func grade(v, warn, bad float64) string {
	switch {
	case v >= bad:
		return Bad
	case v >= warn:
		return Warn
	}
	return OK
}

func worse(a, b string) string {
	rank := map[string]int{NA: -1, OK: 0, Warn: 1, Bad: 2}
	if rank[b] > rank[a] {
		return b
	}
	return a
}

// mkTable 生成明细表，超过 max 行时截断并记录剩余行数。
func mkTable(title string, cols []string, rows [][]string, max int) Table {
	t := Table{Title: title, Cols: cols, Rows: rows}
	if max > 0 && len(rows) > max {
		t.More = len(rows) - max
		t.Rows = rows[:max]
	}
	return t
}

var okWord = regexp.MustCompile(`(?i)^(ok|healthy|passed|normal|0)$`)

// diskBad 磁盘健康字段非「正常」类取值即视为异常（与监控中心「磁盘」页一致）。
func diskBad(h string) bool { h = strings.TrimSpace(h); return h != "" && !okWord.MatchString(h) }

var sizeUnit = map[string]float64{"B": 1, "KB": 1e3, "MB": 1e6, "GB": 1e9, "TB": 1e12, "PB": 1e15, "KIB": 1024, "MIB": 1 << 20, "GIB": 1 << 30, "TIB": 1 << 40, "PIB": 1 << 50}
var sizeRe = regexp.MustCompile(`^\s*([\d.]+)\s*([A-Za-z]*)\s*$`)

func parseSize(s string) (float64, bool) {
	m := sizeRe.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	u := strings.ToUpper(m[2])
	if u == "" {
		u = "B"
	}
	k, ok := sizeUnit[u]
	if !ok {
		return 0, false
	}
	v, err := strconv.ParseFloat(m[1], 64)
	return v * k, err == nil
}

// diskUsagePct 物理磁盘使用率：disk_usage 为容量串时与 disk_capacity 相除；为百分比串时直接取值。
func diskUsagePct(usage, capStr string) (float64, bool) {
	u := strings.TrimSpace(usage)
	if u == "" || u == "-" {
		return 0, false
	}
	if strings.HasSuffix(u, "%") {
		v, err := strconv.ParseFloat(strings.TrimSuffix(u, "%"), 64)
		return v, err == nil
	}
	a, ok1 := parseSize(u)
	t, ok2 := parseSize(capStr)
	if !ok1 || !ok2 || t <= 0 {
		return 0, false
	}
	return math.Min(100, a/t*100), true
}

// usedLife 固态盘已用寿命 %（HDD 或「-」无值）。
func usedLife(typ, life string) (float64, bool) {
	l := strings.TrimSpace(life)
	if l == "" || l == "-" || strings.EqualFold(strings.TrimSpace(typ), "HDD") {
		return 0, false
	}
	v, err := strconv.ParseFloat(strings.TrimSuffix(l, "%"), 64)
	return v, err == nil
}

// ---- 资产行取值 ----

func rs(r capacity.Row, k string) string {
	switch v := r[k].(type) {
	case nil:
		return ""
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

// toF 兼容 float64 / *float64 / int / 数字串。
func toF(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case *float64:
		if t != nil {
			return *t, true
		}
	case int:
		return float64(t), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	}
	return 0, false
}

func rf(r capacity.Row, k string) (float64, bool) { return toF(r[k]) }

func ms(r map[string]any, k string) string {
	switch v := r[k].(type) {
	case nil:
		return ""
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case *float64:
		if v == nil {
			return ""
		}
		return strconv.FormatFloat(*v, 'f', -1, 64)
	default:
		return fmt.Sprint(v)
	}
}

func mf(r map[string]any, k string) (float64, bool) { return toF(r[k]) }

func shortName(h string) string { return capacity.ShortName(h) }

func uniqSorted(in []string) []string {
	m := map[string]bool{}
	var out []string
	for _, s := range in {
		if s = strings.TrimSpace(s); s != "" && !m[s] {
			m[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}

func joinMax(in []string, n int) string {
	if len(in) > n {
		return strings.Join(in[:n], "、") + fmt.Sprintf(" 等 %d 项", len(in))
	}
	return strings.Join(in, "、")
}

// linearRate 以首尾点估算每天增量；点数不足或时间跨度不足 6 小时返回 false。
func linearRate(ts []int64, vs []float64) (float64, bool) {
	if len(ts) < 2 {
		return 0, false
	}
	span := float64(ts[len(ts)-1]-ts[0]) / 1000 / 86400
	if span < 0.25 {
		return 0, false
	}
	return (vs[len(vs)-1] - vs[0]) / span, true
}
