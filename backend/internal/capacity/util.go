package capacity

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Row 一条资源：平铺的展示字段 + raw（接口返回的完整原始对象）。
type Row = map[string]any

func str(m map[string]any, k string) string { return toStr(m[k]) }

func toStr(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e15 {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	}
	return fmt.Sprint(v)
}

// num 数值字段（接口里可能是数字或数字字符串；「infinite」「unknown」等返回 nil）。
func num(v any) *float64 {
	switch t := v.(type) {
	case float64:
		return &t
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(t), 64); err == nil && !math.IsNaN(f) && !math.IsInf(f, 0) {
			return &f
		}
	}
	return nil
}

func flt(m map[string]any, k string) *float64 { return num(m[k]) }

func boolean(v any) *bool {
	switch t := v.(type) {
	case bool:
		return &t
	case string:
		switch strings.ToLower(t) {
		case "true", "yes", "1":
			x := true
			return &x
		case "false", "no", "0":
			x := false
			return &x
		}
	}
	return nil
}

func obj(m map[string]any, k string) map[string]any {
	o, _ := m[k].(map[string]any)
	return o
}

func list(m map[string]any, k string) []any {
	l, _ := m[k].([]any)
	return l
}

func pct(used, total *float64) *float64 {
	if used == nil || total == nil || *total <= 0 {
		return nil
	}
	v := *used / *total * 100
	return &v
}

func mul(a, b *float64) *float64 {
	if a == nil {
		return nil
	}
	if b == nil || *b <= 0 {
		return a
	}
	v := *a * *b
	return &v
}

func sub(a, b *float64) *float64 {
	if a == nil || b == nil {
		return nil
	}
	v := *a - *b
	return &v
}

func shortHost(h string) string {
	h = strings.TrimSpace(h)
	if i := strings.Index(h, "."); i > 0 {
		ok := false
		for _, c := range h[:i] {
			if c < '0' || c > '9' {
				ok = true
			}
		}
		if ok {
			return h[:i]
		}
	}
	return h
}

func joinUniq(in []string, sep string) string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return strings.Join(out, sep)
}

func sortedKeys[V any](m map[string]V) []string {
	k := make([]string, 0, len(m))
	for x := range m {
		k = append(k, x)
	}
	sort.Strings(k)
	return k
}

// flatten 把 raw 递归展开成可搜索的文本（仅取标量值，最多 4 层）。
func flatten(v any, depth int, sb *strings.Builder) {
	if depth > 4 {
		return
	}
	switch t := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(t) {
			flatten(t[k], depth+1, sb)
		}
	case []any:
		for _, x := range t {
			flatten(x, depth+1, sb)
		}
	case nil:
	default:
		s := toStr(t)
		if s != "" {
			sb.WriteString(s)
			sb.WriteByte(' ')
		}
	}
}
