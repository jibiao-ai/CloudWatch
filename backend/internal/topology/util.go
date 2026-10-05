package topology

import (
	"fmt"
	"sort"
	"strings"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

func s(r capacity.Row, k string) string {
	switch v := r[k].(type) {
	case nil:
		return ""
	case string:
		return v
	case float64:
		return fmt.Sprint(v)
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

func gbText(v float64) string {
	if v >= 1024 {
		return fmt.Sprintf("%.1f TB", v/1024)
	}
	return fmt.Sprintf("%.0f GB", v)
}

func mbText(v float64) string {
	if v >= 1024 {
		return fmt.Sprintf("%.0f GB", v/1024)
	}
	return fmt.Sprintf("%.0f MB", v)
}

func pctPtr(v *float64) string {
	if v == nil {
		return "—"
	}
	return fmt.Sprintf("%.1f%%", *v)
}

// rank 健康度严重程度（越大越严重）。
func rank(h string) int {
	switch h {
	case HDanger:
		return 4
	case HWarning:
		return 3
	case HOK:
		return 2
	case HOff:
		return 1
	}
	return 0
}

func worse(a, b string) string {
	if rank(b) > rank(a) {
		return b
	}
	return a
}

// byLoad 按使用率给健康度：使用率阈值只产生「告警」（>=70 偏高，>=85 严重偏高），不再直接判为「异常」——
// 「异常」仅用于严重级告警与资源自身故障（error / down / offline 等）。
func byLoad(n *Node, label string, v *float64) {
	if v == nil {
		return
	}
	switch {
	case *v >= 85:
		n.Health = worse(n.Health, HWarning)
		n.Reasons = append(n.Reasons, fmt.Sprintf("%s %.1f%%（≥85%%，严重偏高）", label, *v))
	case *v >= 70:
		n.Health = worse(n.Health, HWarning)
		n.Reasons = append(n.Reasons, fmt.Sprintf("%s %.1f%%（≥70%%）", label, *v))
	}
}

func sortNodes(ns []Node) {
	sort.SliceStable(ns, func(i, j int) bool { return natLess(ns[i].Name, ns[j].Name) })
}

func natLess(a, b string) bool {
	a, b = strings.ToLower(a), strings.ToLower(b)
	i, j := 0, 0
	for i < len(a) && j < len(b) {
		if isDigit(a[i]) && isDigit(b[j]) {
			si, sj := i, j
			for i < len(a) && isDigit(a[i]) {
				i++
			}
			for j < len(b) && isDigit(b[j]) {
				j++
			}
			na, nb := strings.TrimLeft(a[si:i], "0"), strings.TrimLeft(b[sj:j], "0")
			if len(na) != len(nb) {
				return len(na) < len(nb)
			}
			if na != nb {
				return na < nb
			}
			continue
		}
		if a[i] != b[j] {
			return a[i] < b[j]
		}
		i++
		j++
	}
	return len(a)-i < len(b)-j
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }
