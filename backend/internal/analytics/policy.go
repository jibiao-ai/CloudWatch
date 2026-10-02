package analytics

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// 优化策略类型（与页面四张建议卡片一一对应）。
const (
	KindDowngrade = "downgrade"
	KindUpgrade   = "upgrade"
	KindRecycle   = "recycle"
)

// Kinds 页面展示顺序：降配 / 升配 / 回收。
var Kinds = []string{KindDowngrade, KindUpgrade, KindRecycle}

// Cond 一个条件：field op value；Join 为与「上一条件」的连接（AND 优先于 OR）。
type Cond struct {
	Field string   `json:"field"`
	Op    string   `json:"op"`
	Value any      `json:"value"`
	Join  string   `json:"join,omitempty"`
	num   *float64 // 解析后的数值
}

// Policy 一条优化策略。
type Policy struct {
	Kind       string     `json:"kind"`
	Name       string     `json:"name"`
	Enabled    bool       `json:"enabled"`
	WindowDays int        `json:"windowDays"`
	Conds      []Cond     `json:"conds"`
	Reason     string     `json:"reason"` // 由条件生成的「建议原因」文案
	Scope      string     `json:"scope"`  // 优化范围
	UpdatedAt  *time.Time `json:"updatedAt"`
	UpdatedBy  string     `json:"updatedBy"`
}

// FieldDef 条件字段定义（前端编辑器按此渲染，后端按此校验）。
type FieldDef struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Type    string   `json:"type"` // percent | days | enum
	Unit    string   `json:"unit"`
	Ops     []string `json:"ops"`
	Options []Opt    `json:"options,omitempty"`
}

// Opt 枚举选项。
type Opt struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

var numOps = []string{">=", ">", "<=", "<"}

// Fields 可用的条件字段。
var Fields = []FieldDef{
	{Key: "cpuMax", Label: "CPU使用率最大值", Type: "percent", Unit: "%", Ops: numOps},
	{Key: "cpuAvg", Label: "CPU使用率平均值", Type: "percent", Unit: "%", Ops: numOps},
	{Key: "memMax", Label: "内存使用率最大值", Type: "percent", Unit: "%", Ops: numOps},
	{Key: "memAvg", Label: "内存使用率平均值", Type: "percent", Unit: "%", Ops: numOps},
	{Key: "shutdownDays", Label: "持续关机时长", Type: "days", Unit: "天", Ops: numOps},
	{Key: "runningDays", Label: "持续运行时长", Type: "days", Unit: "天", Ops: numOps},
	{Key: "status", Label: "实例状态", Type: "enum", Ops: []string{"="}, Options: []Opt{{"soft_deleted", "待回收"}, {"shutoff", "已关机"}, {"error", "异常"}}},
}

func fieldOf(key string) *FieldDef {
	for i := range Fields {
		if Fields[i].Key == key {
			return &Fields[i]
		}
	}
	return nil
}

func (c *Cond) isUsage() bool {
	return strings.HasPrefix(c.Field, "cpu") || strings.HasPrefix(c.Field, "mem")
}

// lowOp 「越低越命中」的比较（需要完整观察窗口，避免刚开始采样就误判为低负载）。
func (c *Cond) lowOp() bool { return c.Op == "<=" || c.Op == "<" }

// Validate 校验并规范化策略条件，返回字段级错误。
func (p *Policy) Validate() map[string]string {
	e := map[string]string{}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" || len([]rune(p.Name)) > 32 {
		e["name"] = "策略名称为 1-32 个字符"
	}
	if p.WindowDays < 1 || p.WindowDays > 90 {
		e["windowDays"] = "统计周期为 1-90 天"
	}
	if len(p.Conds) == 0 || len(p.Conds) > 8 {
		e["conds"] = "条件数量为 1-8 条"
		return e
	}
	for i := range p.Conds {
		c := &p.Conds[i]
		fd := fieldOf(c.Field)
		if fd == nil {
			e["conds"] = fmt.Sprintf("第 %d 个条件的字段不合法", i+1)
			return e
		}
		okOp := false
		for _, o := range fd.Ops {
			if o == c.Op {
				okOp = true
			}
		}
		if !okOp {
			e["conds"] = fmt.Sprintf("第 %d 个条件的运算符不合法", i+1)
			return e
		}
		switch fd.Type {
		case "enum":
			v, _ := c.Value.(string)
			okV := false
			for _, o := range fd.Options {
				if o.Value == v {
					okV = true
				}
			}
			if !okV {
				e["conds"] = fmt.Sprintf("第 %d 个条件的取值不合法", i+1)
				return e
			}
			c.Value = v
		default:
			n, ok := toNum(c.Value)
			max := 100.0
			if fd.Type == "days" {
				max = 3650
			}
			if !ok || n < 0 || n > max {
				e["conds"] = fmt.Sprintf("第 %d 个条件的数值需在 0-%v 之间", i+1, max)
				return e
			}
			c.Value, c.num = n, &n
		}
		if i == 0 {
			c.Join = ""
		} else if c.Join != "AND" && c.Join != "OR" {
			e["conds"] = fmt.Sprintf("第 %d 个条件需选择 AND / OR", i+1)
			return e
		}
	}
	return e
}

func toNum(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return 0, false
}

func condText(c Cond, window int) string {
	fd := fieldOf(c.Field)
	if fd == nil {
		return ""
	}
	opText := map[string]string{">=": "大于等于", ">": "大于", "<=": "小于等于", "<": "小于", "=": "等于"}[c.Op]
	val := fmt.Sprint(c.Value)
	switch fd.Type {
	case "enum":
		for _, o := range fd.Options {
			if o.Value == val {
				val = o.Label
			}
		}
	default:
		if n, ok := toNum(c.Value); ok {
			val = trimNum(n) + fd.Unit
		}
	}
	return fmt.Sprintf("%s %s %s", fd.Label, opText, val)
}

func trimNum(n float64) string {
	s := fmt.Sprintf("%.1f", n)
	return strings.TrimSuffix(s, ".0")
}

// ReasonText 条件 → 「建议原因」文案（与页面样例一致：针对过去 N 天的数据分析, … ,建议升配）。
func (p *Policy) ReasonText() string {
	var b strings.Builder
	usage := false
	for _, c := range p.Conds {
		if c.isUsage() {
			usage = true
		}
	}
	if usage {
		fmt.Fprintf(&b, "针对过去%d天的数据分析,", p.WindowDays)
	}
	for i, c := range p.Conds {
		if i > 0 {
			b.WriteString(" " + c.Join + " ")
		}
		b.WriteString(condText(c, p.WindowDays))
	}
	b.WriteString("," + p.Name)
	return b.String()
}

// VMFacts 评估一台云主机所需的事实数据。
type VMFacts struct {
	CPUAvg, CPUMax, MemAvg, MemMax *float64
	DaysWithData                   int
	ShutdownDays, RunningDays      float64
	Status                         string
}

// Hit 一次命中：被命中的条件文案（用于「建议原因」展示实际值）。
type hit struct {
	ok   bool
	text string
}

func (p *Policy) condEval(c Cond, v VMFacts) hit {
	cmp := func(val *float64) hit {
		if val == nil || c.num == nil {
			return hit{}
		}
		if c.isUsage() && c.lowOp() && v.DaysWithData < p.WindowDays { // 低负载判断需积累满整个统计周期
			return hit{}
		}
		ok := false
		switch c.Op {
		case ">=":
			ok = *val >= *c.num
		case ">":
			ok = *val > *c.num
		case "<=":
			ok = *val <= *c.num
		case "<":
			ok = *val < *c.num
		}
		return hit{ok, ""}
	}
	var h hit
	var actual string
	fd := fieldOf(c.Field)
	switch c.Field {
	case "cpuMax":
		h = cmp(v.CPUMax)
		if v.CPUMax != nil {
			actual = fmt.Sprintf("%s %.1f%%", fd.Label, *v.CPUMax)
		}
	case "cpuAvg":
		h = cmp(v.CPUAvg)
		if v.CPUAvg != nil {
			actual = fmt.Sprintf("%s %.1f%%", fd.Label, *v.CPUAvg)
		}
	case "memMax":
		h = cmp(v.MemMax)
		if v.MemMax != nil {
			actual = fmt.Sprintf("%s %.1f%%", fd.Label, *v.MemMax)
		}
	case "memAvg":
		h = cmp(v.MemAvg)
		if v.MemAvg != nil {
			actual = fmt.Sprintf("%s %.1f%%", fd.Label, *v.MemAvg)
		}
	case "shutdownDays": // 仅「已关机」的云主机才有持续关机时长
		d := v.ShutdownDays
		if v.Status == "shutoff" {
			h = cmp(&d)
			actual = fmt.Sprintf("%s %s天", fd.Label, trimNum(d))
		}
	case "runningDays": // 仅「运行中」的云主机才有持续运行时长
		d := v.RunningDays
		if v.Status == "active" {
			h = cmp(&d)
			actual = fmt.Sprintf("%s %s天", fd.Label, trimNum(d))
		}
	case "status":
		h = hit{ok: v.Status == fmt.Sprint(c.Value)}
		actual = "实例状态 " + stateLabel(v.Status)
	}
	h.text = actual
	return h
}

func stateLabel(code string) string {
	switch code {
	case "soft_deleted":
		return "待回收"
	case "shutoff":
		return "已关机"
	case "active":
		return "运行中"
	case "error":
		return "异常"
	}
	return code
}

// Eval 按「AND 优先于 OR」计算条件；命中时返回命中分组里各条件的实际值文案。
func (p *Policy) Eval(v VMFacts) (bool, string) {
	if len(p.Conds) == 0 {
		return false, ""
	}
	var groups [][]hit
	cur := []hit{}
	for i, c := range p.Conds {
		if i > 0 && c.Join == "OR" {
			groups = append(groups, cur)
			cur = []hit{}
		}
		cur = append(cur, p.condEval(c, v))
	}
	groups = append(groups, cur)
	var reasons []string
	for _, g := range groups {
		all := len(g) > 0
		for _, h := range g {
			if !h.ok {
				all = false
			}
		}
		if all {
			for _, h := range g {
				if h.text != "" {
					reasons = append(reasons, h.text)
				}
			}
		}
	}
	if len(reasons) == 0 {
		return false, ""
	}
	return true, strings.Join(dedup(reasons), "；")
}

func dedup(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func parseConds(raw string) []Cond {
	var cs []Cond
	if json.Unmarshal([]byte(raw), &cs) != nil {
		return nil
	}
	for i := range cs {
		if n, ok := toNum(cs[i].Value); ok {
			cs[i].Value, cs[i].num = n, &n
		}
	}
	return cs
}
