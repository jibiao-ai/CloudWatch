package monitor

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Parsed 解析后的一条 EMLA 告警（与 alert_events 列对应）。
type Parsed struct {
	Fingerprint string
	Name        string
	NameEN      string
	Severity    string // critical / warning / info
	Category    string
	AlertType   string // service / storage / log / host / others
	Component   string
	NodeName    string
	HostIP      string
	Project     string
	Description string
	Summary     string
	Solution    string
	RuleID      string
	Status      string // firing / resolved
	StartsAt    time.Time
	EndsAt      time.Time // 零值表示未恢复
	Labels      map[string]string
	Annotations map[string]string
}

// 兼容两种响应：
//  1. 文档示例：{alerts_status,total,level_info,type_info,alerts_meta:{results:[{startsAt,endsAt,status,labels,annotations}]}}
//  2. 文档字段表：{code,error,data:{statistics,items:[{id,alertNameCN,...,annotations:{summaryCN...}}]}}
type alertDoc struct {
	Code  *int   `json:"code"`
	Error string `json:"error"`
	Meta  struct {
		Results []json.RawMessage `json:"results"`
	} `json:"alerts_meta"`
	Data struct {
		Items      []json.RawMessage `json:"items"`
		Statistics map[string]any    `json:"statistics"`
	} `json:"data"`
	Items []json.RawMessage `json:"items"`
}

type rawAlert map[string]any

func anyStr(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(x)
	case float64, bool, json.Number:
		return fmt.Sprint(x)
	}
	return ""
}

func strMap(v any) map[string]string {
	m, _ := v.(map[string]any)
	out := make(map[string]string, len(m))
	for k, x := range m {
		if s := anyStr(x); s != "" {
			out[k] = s
		} else if x != nil {
			if _, isStr := x.(string); !isStr {
				b, _ := json.Marshal(x)
				out[k] = string(b)
			}
		}
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func parseTS(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}
	}
	for _, l := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000Z", "2006-01-02 15:04:05", time.RFC3339} {
		if t, err := time.Parse(l, s); err == nil {
			if t.Year() <= 1 {
				return time.Time{}
			}
			return t.UTC().Truncate(time.Millisecond)
		}
	}
	return time.Time{}
}

func normSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical", "fatal", "emergency", "error", "严重", "紧急":
		return "critical"
	case "info", "information", "notice", "提示", "信息":
		return "info"
	}
	return "warning"
}

func classify(group, category, component string) string {
	for _, v := range []string{group, category, component} {
		switch strings.ToLower(v) {
		case "service", "storage", "log", "host":
			return strings.ToLower(v)
		case "node", "physical", "hardware":
			return "host"
		case "ceph", "disk", "osd":
			return "storage"
		}
	}
	return "others"
}

func fingerprintOf(labels map[string]string, starts time.Time) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	h := sha1.New()
	for _, k := range keys {
		h.Write([]byte(k + "=" + labels[k] + ";"))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func parseOne(raw json.RawMessage, status string) (*Parsed, bool) {
	var a rawAlert
	if json.Unmarshal(raw, &a) != nil {
		return nil, false
	}
	labels := strMap(a["labels"])
	ann := strMap(a["annotations"])
	p := &Parsed{Labels: labels, Annotations: ann}

	var ruleNameCN, ruleNameEN, ruleID string
	if r, ok := a["rule"].(map[string]any); ok {
		ruleNameCN, ruleNameEN, ruleID = anyStr(r["ruleNameCN"]), anyStr(r["ruleNameEN"]), anyStr(r["ruleID"])
		if ruleID == "" {
			ruleID = anyStr(r["rulelD"])
		}
	}
	p.Name = firstNonEmpty(anyStr(a["alertNameCN"]), labels["alertname"], ruleNameCN)
	p.NameEN = firstNonEmpty(anyStr(a["alertNameEN"]), ann["alertname_en"], ruleNameEN)
	if p.Name == "" {
		p.Name = firstNonEmpty(p.NameEN, "未命名告警")
	}
	p.Severity = normSeverity(firstNonEmpty(anyStr(a["severity"]), labels["severity"]))
	p.Category = firstNonEmpty(anyStr(a["category"]), labels["category"])
	p.Component = firstNonEmpty(anyStr(a["component"]), labels["component"], labels["service"], labels["job"])
	p.NodeName = firstNonEmpty(labels["node_name"], labels["node"], labels["hostname"])
	p.HostIP = firstNonEmpty(labels["host_ip"], labels["ip"])
	p.Project = firstNonEmpty(anyStr(a["projectName"]), labels["project"])
	p.Description = firstNonEmpty(ann["description"], ann["descriptionCN"])
	p.Summary = firstNonEmpty(ann["summary"], ann["summaryCN"], p.Description)
	p.Solution = firstNonEmpty(ann["solution"], ann["solutionCN"])
	p.RuleID = firstNonEmpty(ruleID, labels["rule_id"])
	p.AlertType = classify(labels["alertgroup"], p.Category, p.Component)
	p.StartsAt = parseTS(anyStr(a["startsAt"]))
	p.EndsAt = parseTS(anyStr(a["endsAt"]))
	if p.StartsAt.IsZero() {
		p.StartsAt = time.Now().UTC().Truncate(time.Millisecond)
	}
	p.Status = status
	if s := strings.ToLower(anyStr(a["status"])); s == "resolved" {
		p.Status = "resolved"
	} else if s == "firing" || s == "active" {
		p.Status = "firing"
	}
	if p.Status == "resolved" && p.EndsAt.IsZero() {
		p.EndsAt = p.StartsAt
	}
	p.Fingerprint = firstNonEmpty(anyStr(a["fingerprint"]), fingerprintOf(labels, p.StartsAt))
	if len(p.Fingerprint) > 64 {
		p.Fingerprint = p.Fingerprint[:64]
	}
	return p, true
}

// ParseAlerts 解析 /ecms/alerts 响应。status 为请求时的预期状态（firing / resolved），响应里的逐条 status 优先。
func ParseAlerts(body []byte, status string) ([]*Parsed, error) {
	var d alertDoc
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, fmt.Errorf("告警响应不是合法 JSON：%w", err)
	}
	if d.Code != nil && *d.Code != 0 && *d.Code != 200 {
		return nil, fmt.Errorf("EMLA 返回错误：%s（code=%d）", firstNonEmpty(d.Error, "未知错误"), *d.Code)
	}
	raws := d.Meta.Results
	if len(raws) == 0 {
		raws = d.Data.Items
	}
	if len(raws) == 0 {
		raws = d.Items
	}
	out := make([]*Parsed, 0, len(raws))
	seen := map[string]bool{}
	for _, r := range raws {
		p, ok := parseOne(r, status)
		if !ok {
			continue
		}
		k := p.Fingerprint + p.StartsAt.String()
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, p)
	}
	return out, nil
}
