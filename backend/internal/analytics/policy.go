package analytics

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// 资源类型：优化策略作用于哪一类资源。
const (
	ResVM   = "vm"   // 虚拟机
	ResHost = "host" // 物理机（计算节点）
	ResPool = "pool" // 集群存储
	ResDisk = "disk" // 云硬盘
)

// ResTypes 资源类型及中文名。
var ResTypes = []Opt{{ResVM, "虚拟机"}, {ResHost, "物理机"}, {ResPool, "集群存储"}, {ResDisk, "云硬盘"}}

func isRes(t string) bool {
	for _, r := range ResTypes {
		if r.Value == t {
			return true
		}
	}
	return false
}

// Scope 策略范围：all 所有受支持的集群；part 仅限所选集群（虚拟机 / 物理机按「平台ID/集群」，集群存储 / 云硬盘按「平台ID」）。
type Scope struct {
	Mode  string   `json:"mode"`
	Items []string `json:"items"`
}

// Match 资源是否在范围内：key 为「平台ID/集群」或「平台ID」。
func (sc Scope) Match(pid, cluster string) bool {
	if sc.Mode != "part" {
		return true
	}
	for _, it := range sc.Items {
		if it == pid || (cluster != "" && it == pid+"/"+cluster) {
			return true
		}
	}
	return false
}

// ScopeText 范围的展示文案。
func (sc Scope) Text() string {
	if sc.Mode == "part" {
		return fmt.Sprintf("部分集群（%d）", len(sc.Items))
	}
	return "所有受支持的集群"
}

// Cond 一个条件：field op value；Join 为与「上一条件」的连接（AND 优先于 OR）。
type Cond struct {
	Field string   `json:"field"`
	Op    string   `json:"op"`
	Value any      `json:"value"`
	Join  string   `json:"join,omitempty"`
	num   *float64 // 解析后的数值
}

// Policy 一条优化策略。Kind 为策略 ID（内置策略为固定英文标识，自定义策略为 c_ 开头的随机 ID）。
type Policy struct {
	Kind         string     `json:"kind"`
	Name         string     `json:"name"`
	ResourceType string     `json:"resourceType"`
	Enabled      bool       `json:"enabled"`
	WindowDays   int        `json:"windowDays"`
	Conds        []Cond     `json:"conds"`
	Scope        Scope      `json:"scope"`
	Advice       string     `json:"advice"`
	Builtin      bool       `json:"builtin"`
	Reason       string     `json:"reason"`    // 由条件生成的「建议原因」文案
	ScopeText    string     `json:"scopeText"` // 范围展示文案
	UpdatedAt    *time.Time `json:"updatedAt"`
	UpdatedBy    string     `json:"updatedBy"`
}

// FieldDef 条件字段（指标）定义（前端编辑器按此渲染，后端按此校验）。Res 为适用的资源类型。
type FieldDef struct {
	Key     string   `json:"key"`
	Res     string   `json:"res"`
	Label   string   `json:"label"`
	Type    string   `json:"type"` // percent | days | rate | ms | count | enum
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
var eqNumOps = []string{"=", ">=", ">", "<=", "<"}

func pf(key, res, label string) FieldDef {
	return FieldDef{Key: key, Res: res, Label: label, Type: "percent", Unit: "%", Ops: numOps}
}

// Fields 可用的指标（条件字段）。
var Fields = []FieldDef{
	// 虚拟机
	pf("cpuAvg", ResVM, "vCPU平均使用率"), pf("cpuMax", ResVM, "vCPU最大使用率"), pf("cpuMin", ResVM, "vCPU最小使用率"),
	pf("memAvg", ResVM, "内存平均使用率"), pf("memMax", ResVM, "内存最大使用率"), pf("memMin", ResVM, "内存最小使用率"),
	pf("readyAvg", ResVM, "CPU就绪时间占比"),
	{Key: "swap", Res: ResVM, Label: "内存交换(Swap)", Type: "enum", Ops: []string{"="}, Options: []Opt{{"yes", "存在"}, {"no", "不存在"}}},
	{Key: "latAvg", Res: ResVM, Label: "磁盘平均读/写时延", Type: "ms", Unit: "ms", Ops: numOps},
	pf("fsMax", ResVM, "文件系统使用率"),
	{Key: "writeAvg", Res: ResVM, Label: "磁盘平均写I/O速率", Type: "rate", Unit: "KiB/s", Ops: numOps},
	{Key: "shutdownDays", Res: ResVM, Label: "持续关机时长", Type: "days", Unit: "天", Ops: numOps},
	{Key: "runningDays", Res: ResVM, Label: "持续运行时长", Type: "days", Unit: "天", Ops: numOps},
	{Key: "status", Res: ResVM, Label: "电源状态", Type: "enum", Ops: []string{"="}, Options: []Opt{{"active", "运行中"}, {"shutoff", "关机"}, {"soft_deleted", "待回收"}, {"error", "异常"}}},
	// 物理机
	pf("cpuAvg", ResHost, "物理机CPU平均使用率"), pf("cpuMax", ResHost, "物理机CPU最大使用率"),
	pf("memAvg", ResHost, "物理机内存平均使用率"), pf("memMax", ResHost, "物理机内存最大使用率"),
	// 集群存储
	pf("usedPercent", ResPool, "存储裸容量已使用占比"), pf("allocPercent", ResPool, "存储容量分配率"),
	// 云硬盘
	{Key: "attachCount", Res: ResDisk, Label: "关联虚拟机数量", Type: "count", Unit: "台", Ops: eqNumOps},
}

func fieldFor(res, key string) *FieldDef {
	for i := range Fields {
		if Fields[i].Key == key && Fields[i].Res == res {
			return &Fields[i]
		}
	}
	return nil
}

// condRes 条件所属资源类型（Validate / 评估时由策略设置）。
func (c *Cond) isUsage() bool {
	for _, p := range []string{"cpu", "mem", "write", "ready", "lat", "fs", "swap"} {
		if strings.HasPrefix(c.Field, p) {
			return true
		}
	}
	return false
}

// lowOp 「越低越命中」的比较（需要完整观察窗口，避免刚开始采样就误判为低负载）。
func (c *Cond) lowOp() bool { return c.Op == "<=" || c.Op == "<" }

// sustained 「持续」型条件：越低越命中，或取最小值判断「持续偏高」；都需要积累满整个统计周期的数据才生效。
func (c *Cond) sustained() bool {
	return c.isUsage() && (c.lowOp() || strings.HasSuffix(c.Field, "Min"))
}

// Validate 校验并规范化策略，返回字段级错误。
func (p *Policy) Validate() map[string]string {
	e := map[string]string{}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" || len([]rune(p.Name)) > 32 {
		e["name"] = "策略名称为 1-32 个字符"
	}
	if p.ResourceType == "" {
		p.ResourceType = ResVM
	}
	if !isRes(p.ResourceType) {
		e["resourceType"] = "资源类型不合法"
		return e
	}
	if p.Scope.Mode != "part" {
		p.Scope = Scope{Mode: "all", Items: []string{}}
	} else if len(p.Scope.Items) == 0 {
		e["scope"] = "请至少选择一个集群"
	}
	p.Advice = strings.TrimSpace(p.Advice)
	if len([]rune(p.Advice)) > 100 {
		e["advice"] = "处置建议不超过 100 个字符"
	}
	if p.WindowDays < 1 || p.WindowDays > 90 {
		e["windowDays"] = "统计周期为 1-90 天"
	}
	if len(p.Conds) == 0 || len(p.Conds) > 8 {
		e["conds"] = "筛选条件数量为 1-8 条，请选择指标"
		return e
	}
	for i := range p.Conds {
		c := &p.Conds[i]
		fd := fieldFor(p.ResourceType, c.Field)
		if fd == nil {
			e["conds"] = fmt.Sprintf("第 %d 个条件的指标不适用于该资源类型", i+1)
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
			switch fd.Type {
			case "days":
				max = 3650
			case "rate":
				max = 1048576
			case "ms":
				max = 100000
			case "count":
				max = 100000
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
			c.Join = "AND"
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

func opText(op string) string {
	return map[string]string{">=": "大于等于", ">": "大于", "<=": "小于等于", "<": "小于", "=": "等于"}[op]
}

func condText(res string, c Cond) string {
	fd := fieldFor(res, c.Field)
	if fd == nil {
		return ""
	}
	val := fmt.Sprint(c.Value)
	if fd.Type == "enum" {
		for _, o := range fd.Options {
			if o.Value == val {
				val = o.Label
			}
		}
	} else if n, ok := toNum(c.Value); ok {
		val = trimNum(n) + fd.Unit
	}
	return fmt.Sprintf("%s %s %s", fd.Label, opText(c.Op), val)
}

// trimNum2 最多两位小数（写速率常小于 1，一位小数会显示成 0）。
func trimNum2(n float64) string {
	s := fmt.Sprintf("%.2f", n)
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}

func trimNum(n float64) string {
	s := fmt.Sprintf("%.1f", n)
	return strings.TrimSuffix(s, ".0")
}

// ReasonText 条件 → 「建议原因」文案（针对过去 N 天的数据分析, … ,建议 …）。
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
			if c.Join == "OR" {
				b.WriteString(" 或 ")
			} else {
				b.WriteString(" 且 ")
			}
		}
		b.WriteString(condText(p.ResourceType, c))
	}
	adv := p.Advice
	if adv == "" {
		adv = p.Name
	}
	b.WriteString("," + adv)
	return b.String()
}

// Facts 评估一个资源所需的事实数据：Vals 为各指标的取值（缺失表示未采集到），Days 为各指标已积累的有数据天数。
type Facts struct {
	Status string
	Vals   map[string]float64
	Days   map[string]int
}

func newFacts(status string) Facts {
	return Facts{Status: status, Vals: map[string]float64{}, Days: map[string]int{}}
}

func (f Facts) set(key string, v *float64, days int) {
	if v != nil {
		f.Vals[key] = *v
		f.Days[key] = days
	}
}

// hit 一次命中：被命中的条件文案（用于「建议原因」展示实际值）。
type hit struct {
	ok   bool
	text string
}

func actualText(fd *FieldDef, v float64) string {
	switch fd.Type {
	case "percent":
		return fmt.Sprintf("%s %.1f%%", fd.Label, v)
	case "rate":
		return fmt.Sprintf("%s %sKiB/s", fd.Label, trimNum2(v))
	case "ms":
		return fmt.Sprintf("%s %.1fms", fd.Label, v)
	case "days":
		return fmt.Sprintf("%s %s天", fd.Label, trimNum(v))
	case "count":
		return fmt.Sprintf("%s %d台", fd.Label, int(v))
	}
	return fd.Label
}

func (p *Policy) condEval(c Cond, f Facts) hit {
	fd := fieldFor(p.ResourceType, c.Field)
	if fd == nil {
		return hit{}
	}
	if c.Field == "status" {
		return hit{ok: f.Status == fmt.Sprint(c.Value), text: "电源状态 " + stateLabel(f.Status)}
	}
	if p.ResourceType == ResVM && c.isUsage() && f.Status != "active" { // 使用率类条件只对当前运行中的云主机生效
		return hit{}
	}
	v, has := f.Vals[c.Field]
	if !has {
		return hit{}
	}
	if fd.Type == "enum" { // swap：1 存在 / 0 不存在
		return hit{ok: (v > 0) == (fmt.Sprint(c.Value) == "yes"), text: fd.Label + " " + map[bool]string{true: "存在", false: "不存在"}[v > 0]}
	}
	if c.num == nil {
		return hit{}
	}
	if c.sustained() && f.Days[c.Field] < p.WindowDays { // 「持续」型判断需积累满整个统计周期，避免刚开始采样就误判
		return hit{}
	}
	ok := false
	switch c.Op {
	case "=":
		ok = v == *c.num
	case ">=":
		ok = v >= *c.num
	case ">":
		ok = v > *c.num
	case "<=":
		ok = v <= *c.num
	case "<":
		ok = v < *c.num
	}
	return hit{ok, actualText(fd, v)}
}

func stateLabel(code string) string {
	switch code {
	case "soft_deleted":
		return "待回收"
	case "shutoff":
		return "关机"
	case "active":
		return "运行中"
	case "error":
		return "异常"
	}
	return code
}

// Eval 按「AND 优先于 OR」计算条件；命中时返回命中分组里各条件的实际值文案。
func (p *Policy) Eval(f Facts) (bool, string) {
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
		cur = append(cur, p.condEval(c, f))
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

// noHitHint 策略没有命中时给出原因：无资源 / 指标未采集到 / 历史数据未积累满统计周期 / 已评估但无满足条件的资源。
func (p *Policy) noHitHint(dg *polDiag) string {
	if dg == nil || dg.Total == 0 {
		return "当前范围内没有可评估的资源"
	}
	var missing, short []string
	seen := map[string]bool{}
	for i := range p.Conds {
		c := &p.Conds[i]
		fd := fieldFor(p.ResourceType, c.Field)
		if fd == nil || c.Field == "status" || seen[c.Field] {
			continue
		}
		seen[c.Field] = true
		if c.isUsage() {
			if dg.Have[c.Field] == 0 {
				missing = append(missing, fd.Label)
				continue
			}
			if c.sustained() && dg.Days[c.Field] < p.WindowDays {
				short = append(short, fmt.Sprintf("%s已积累 %d/%d 天", fd.Label, dg.Days[c.Field], p.WindowDays))
			}
		}
	}
	switch {
	case len(missing) > 0:
		return "平台暂未采集到「" + strings.Join(missing, "、") + "」指标，无法判定（需云平台提供该指标）"
	case len(short) > 0:
		return "历史数据尚未积累满统计周期（" + strings.Join(short, "；") + "），积累满后才会判定"
	}
	return fmt.Sprintf("已评估 %d 个资源，暂无满足条件的", dg.Total)
}
