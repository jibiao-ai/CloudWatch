package inspection

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

// ---------- 性能 ----------

type stat struct {
	avg, max, cur float64
	n             int
}

func seriesStat(pts []monitor.Point) stat {
	var s stat
	sum := 0.0
	for _, p := range pts {
		sum += p.V
		if p.V > s.max {
			s.max = p.V
		}
		s.cur = p.V
		s.n++
	}
	if s.n > 0 {
		s.avg = sum / float64(s.n)
	}
	return s
}

func checkPerfIO(in *Input, c Config) Item {
	s := in.sum()
	t := c.Thresholds
	rd, wr := in.Series["iops_read"], in.Series["iops_write"]
	var haveNow bool
	if s != nil && (s.IopsRead != nil || s.IopsWrite != nil) {
		haveNow = true
	}
	var withIO []monitor.Node
	for _, n := range in.Nodes {
		if n.DiskIO != nil {
			withIO = append(withIO, n)
		}
	}
	if !haveNow && len(rd) == 0 && len(wr) == 0 && len(withIO) == 0 {
		return na("未采集到集群读写 IOPS 与节点磁盘 I/O 使用率。")
	}
	it := Item{Status: OK, Standard: fmt.Sprintf("节点磁盘 I/O 使用率 ≥ %g%% 预警、≥ %g%% 异常；集群 IOPS 为趋势参考指标，不单独判级。", t.DiskIOWarn, t.DiskIOBad)}
	var rows [][]string
	f0 := func(p *float64) string {
		if p == nil {
			return "—"
		}
		return num(*p, 0)
	}
	var curR, curW *float64
	if s != nil {
		curR, curW = s.IopsRead, s.IopsWrite
	}
	for _, x := range []struct {
		n   string
		cur *float64
		pts []monitor.Point
	}{{"读 IOPS", curR, rd}, {"写 IOPS", curW, wr}} {
		st := seriesStat(x.pts)
		if st.n > 0 {
			rows = append(rows, []string{x.n, f0(x.cur), num(st.avg, 0), num(st.max, 0), fmt.Sprint(st.n)})
		} else {
			rows = append(rows, []string{x.n, f0(x.cur), "—", "—", "0"})
		}
	}
	it.Tables = append(it.Tables, Table{Title: "集群读写 IOPS（近 24 小时）", Cols: []string{"指标", "当前值", "24h 平均", "24h 峰值", "样本数"}, Rows: rows})
	it.Value = fmt.Sprintf("当前 读 %s / 写 %s IOPS", f0(curR), f0(curW))
	if wst, rst := seriesStat(wr), seriesStat(rd); wst.n+rst.n > 0 {
		it.Value += fmt.Sprintf("；24h 峰值 读 %s / 写 %s", num(rst.max, 0), num(wst.max, 0))
	}
	if len(withIO) > 0 {
		var nr [][]string
		hot, maxV := 0, 0.0
		for _, n := range withIO {
			lv := grade(*n.DiskIO, t.DiskIOWarn, t.DiskIOBad)
			it.Status = worse(it.Status, lv)
			if *n.DiskIO > maxV {
				maxV = *n.DiskIO
			}
			if lv != OK {
				hot++
			}
			nr = append(nr, []string{n.Name, dash(n.HostIP), pctText(n.DiskIO), StatusText[lv]})
		}
		sort.SliceStable(nr, func(i, j int) bool { return nr[i][3] != "正常" && nr[j][3] == "正常" })
		it.Value += fmt.Sprintf("；节点磁盘 I/O 使用率最高 %s%%", num(maxV, 1))
		it.Tables = append(it.Tables, mkTable("节点磁盘 I/O 使用率", []string{"节点", "管理 IP", "I/O 使用率", "判定"}, nr, int(t.ListMax)))
		if hot > 0 {
			it.Detail = fmt.Sprintf("%d 个节点的磁盘 I/O 使用率超过阈值。", hot)
			it.Advice = "存在磁盘 I/O 使用率偏高的节点，请排查高 IO 云主机或存储慢盘，必要时做 QoS 限速或扩容。"
		}
	}
	if it.Detail == "" {
		it.Detail = "集群存储 IO 无异常，节点磁盘 I/O 使用率在阈值以内。"
	}
	return it
}

func checkPerfLat(in *Input, c Config) Item {
	t := c.Thresholds
	type rec struct {
		name, ip string
		cur, pk  *float64
	}
	var recs []rec
	for _, n := range in.Nodes {
		r := rec{name: n.Name, ip: n.HostIP, cur: n.DiskLatency}
		if v, ok := in.NodeLat[n.Name]; ok {
			vv := v
			r.pk = &vv
		}
		if r.cur != nil || r.pk != nil {
			recs = append(recs, r)
		}
	}
	if len(recs) == 0 {
		return na("未采集到节点磁盘 I/O 延迟。")
	}
	it := Item{Status: OK, Standard: fmt.Sprintf("节点磁盘 I/O 延迟（当前值与近 24 小时峰值取较大者）≥ %g ms 预警、≥ %g ms 异常。", t.LatencyWarn, t.LatencyBad)}
	var rows [][]string
	maxV, hot := 0.0, 0
	ms := func(p *float64) string {
		if p == nil {
			return "—"
		}
		return num(*p, 2)
	}
	for _, r := range recs {
		v := 0.0
		if r.cur != nil && *r.cur > v {
			v = *r.cur
		}
		if r.pk != nil && *r.pk > v {
			v = *r.pk
		}
		lv := grade(v, t.LatencyWarn, t.LatencyBad)
		it.Status = worse(it.Status, lv)
		if v > maxV {
			maxV = v
		}
		if lv != OK {
			hot++
		}
		rows = append(rows, []string{r.name, dash(r.ip), ms(r.cur), ms(r.pk), StatusText[lv]})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i][4] != "正常" && rows[j][4] == "正常" })
	it.Value = fmt.Sprintf("%d 个节点；最高延迟 %s ms", len(recs), num(maxV, 2))
	if hot == 0 {
		it.Detail = "各节点磁盘延迟在阈值以内。"
	} else {
		it.Detail = fmt.Sprintf("%d 个节点的磁盘延迟超过阈值。", hot)
		it.Advice = "存在磁盘延迟偏高的节点，请排查慢盘 / 网络抖动 / 高负载，并结合磁盘 SMART 与存储告警定位。"
	}
	it.Tables = []Table{mkTable("节点磁盘 I/O 延迟（ms）", []string{"节点", "管理 IP", "当前值", "24h 峰值", "判定"}, rows, int(t.ListMax))}
	return it
}

// ---------- 告警 ----------

var sevCN = map[string]string{"critical": "严重", "warning": "警告", "info": "提示"}

type alertGrp struct {
	name, sev string
	n         int
	nodes     []string
	last      string
	lastT     int64
}

func checkAlerts(in *Input, c Config) Item {
	it := Item{Standard: "存在严重（critical）告警判定为异常，仅有警告 / 提示级告警判定为预警，无告警为正常。"}
	if in.Snap != nil && in.Snap.AlertSyncAt == nil && len(in.Alerts) == 0 {
		return na("尚未同步过告警数据。")
	}
	if len(in.Alerts) == 0 {
		it.Status, it.Value, it.Detail = OK, "当前无告警中的事件", "告警中心没有正在告警的事件。"
		return it
	}
	m := map[string]*alertGrp{}
	var order []string
	cnt := map[string]int{}
	for _, a := range in.Alerts {
		cnt[a.Severity]++
		k := a.Name + "\x00" + a.Severity
		g := m[k]
		if g == nil {
			g = &alertGrp{name: a.Name, sev: a.Severity}
			m[k] = g
			order = append(order, k)
		}
		g.n++
		if a.NodeName != "" {
			g.nodes = append(g.nodes, a.NodeName)
		} else if a.HostIP != "" {
			g.nodes = append(g.nodes, a.HostIP)
		}
		if a.FiredAt.UnixMilli() >= g.lastT {
			g.lastT, g.last = a.FiredAt.UnixMilli(), cstMin(a.FiredAt)
		}
	}
	gs := make([]*alertGrp, 0, len(order))
	for _, k := range order {
		gs = append(gs, m[k])
	}
	rank := map[string]int{"critical": 0, "warning": 1, "info": 2}
	sort.SliceStable(gs, func(i, j int) bool {
		if rank[gs[i].sev] != rank[gs[j].sev] {
			return rank[gs[i].sev] < rank[gs[j].sev]
		}
		return gs[i].n > gs[j].n
	})
	var rows [][]string
	for _, g := range gs {
		rows = append(rows, []string{dash(g.name), firstNonEmpty(sevCN[g.sev], g.sev), fmt.Sprint(g.n), dash(joinMax(uniqSorted(g.nodes), 4)), g.last})
	}
	it.Status = Warn
	if cnt["critical"] > 0 {
		it.Status = Bad
	}
	it.Value = fmt.Sprintf("告警中 %d 条（严重 %d、警告 %d、提示 %d），%d 种告警类型", len(in.Alerts), cnt["critical"], cnt["warning"], cnt["info"], len(gs))
	it.Detail = "存在尚未恢复的告警事件，请在「告警中心」查看详情与处理建议。"
	it.Advice = fmt.Sprintf("当前有 %d 条告警未恢复（严重 %d 条），请优先处理严重级别告警：%s。", len(in.Alerts), cnt["critical"], joinMax(topNames(derefGrp(gs), 4), 4))
	it.Tables = []Table{mkTable("告警中的事件（按告警类型归拢）", []string{"告警名称", "级别", "数量", "涉及节点", "最近触发"}, rows, int(c.Thresholds.ListMax))}
	return it
}

func topNames(gs []alertGrp, n int) []string {
	var out []string
	for _, g := range gs {
		if len(out) >= n {
			break
		}
		out = append(out, g.name)
	}
	return out
}

// ---------- 云主机 ----------

func checkVMState(in *Input, c Config) Item {
	s := in.sum()
	if s == nil || (s.Instances.Running == nil && s.Instances.Shutdown == nil && s.Instances.Error == nil) {
		return na("未采集到云主机状态分布。")
	}
	g := func(p *float64) int {
		if p == nil {
			return 0
		}
		return int(*p)
	}
	st := s.Instances
	it := Item{Status: OK, Standard: "存在错误（ERROR）状态的云主机判定为异常；其余状态仅作统计。"}
	it.Value = fmt.Sprintf("共 %d 台：运行 %d、关机 %d、错误 %d、回收站 %d、其他 %d", vmTotal(st), g(st.Running), g(st.Shutdown), g(st.Error), g(st.RecycleBin), g(st.Others))
	rows := [][]string{{"运行中", fmt.Sprint(g(st.Running))}, {"已关机", fmt.Sprint(g(st.Shutdown))}, {"错误", fmt.Sprint(g(st.Error))}, {"回收站", fmt.Sprint(g(st.RecycleBin))}, {"其他", fmt.Sprint(g(st.Others))}}
	it.Tables = []Table{{Title: "云主机状态分布", Cols: []string{"状态", "数量"}, Rows: rows}}
	var errRows [][]string
	if in.Snap != nil {
		for _, v := range in.Snap.VMs {
			if strings.EqualFold(v.Status, "ERROR") {
				errRows = append(errRows, []string{dash(v.Name), dash(v.Node), dash(v.IPs), dash(v.Flavor), v.Status})
			}
		}
	}
	if len(errRows) > 0 || g(st.Error) > 0 {
		it.Status = Bad
		it.Detail = fmt.Sprintf("存在 %d 台错误状态的云主机。", maxInt(len(errRows), g(st.Error)))
		it.Advice = "存在 ERROR 状态的云主机，请查看其故障原因（nova show 的 fault 信息），按需重置状态或重建。"
		if len(errRows) > 0 {
			it.Tables = append(it.Tables, mkTable("错误状态的云主机", []string{"名称", "所在节点", "IP", "规格", "状态"}, errRows, int(c.Thresholds.ListMax)))
		}
	} else {
		it.Detail = "没有处于错误状态的云主机。"
	}
	return it
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func policyOff(in *Input, kind string) (bool, string) {
	p, ok := in.Policies[kind]
	if ok && !p.Enabled {
		return true, "运营中心中的「" + p.Name + "」策略已停用，本项不参与判定。"
	}
	if !ok && in.Policies != nil { // 策略已在运营中心被删除
		return true, "运营中心中对应的优化策略已被删除，本项不参与判定。"
	}
	return false, ""
}

func hitRows(h []map[string]any, max int, cols ...string) ([][]string, []string) {
	var rows [][]string
	var names []string
	for _, r := range h {
		row := []string{dash(ms(r, "name")), dash(ms(r, "ips"))}
		for _, c := range cols {
			v := ms(r, c)
			if v != "" && c != "statusText" && c != "flavor" {
				if f, ok := mf(r, c); ok {
					v = num(f, 1)
				}
			}
			row = append(row, dash(v))
		}
		rows = append(rows, row)
		names = append(names, ms(r, "name"))
	}
	return rows, names
}

func policyItem(in *Input, c Config, kind, label, std, advice string, cols []string, heads []string) Item {
	if off, msg := policyOff(in, kind); off {
		return Item{Status: NA, Value: "策略已停用/已删除", Detail: msg}
	}
	if in.Hits == nil {
		return na("未能读取运营中心策略结果。")
	}
	h := in.Hits[kind]
	p := in.Policies[kind]
	it := Item{Standard: std}
	if p.Reason != "" {
		it.Standard = std + "当前策略：" + p.Reason + "。"
	}
	if len(h) == 0 {
		it.Status, it.Value, it.Detail = OK, "0 台", "未发现"+label+"。"
		return it
	}
	rows, names := hitRows(h, int(c.Thresholds.ListMax), cols...)
	it.Status = Warn
	it.Value = fmt.Sprintf("%d 台", len(h))
	it.Detail = fmt.Sprintf("发现 %d 台%s，建议核实后处理（占用资源但价值较低）。", len(h), label)
	it.Advice = fmt.Sprintf("发现 %d 台%s（如 %s），%s", len(h), label, joinMax(names, 3), advice)
	it.Tables = []Table{mkTable(label+"明细", append([]string{"名称", "IP"}, heads...), rows, int(c.Thresholds.ListMax))}
	return it
}

func checkLongOff(in *Input, c Config) Item {
	return policyItem(in, c, "longoff", "长期关机云主机", "按运营中心「长期关机虚机」策略判定：已关机超过设定天数的云主机。",
		"请与业务方确认后释放或归档，回收其占用的云硬盘与配额。", []string{"shutdownDays", "flavor"}, []string{"已关机天数", "规格"})
}

func checkZombie(in *Input, c Config) Item {
	return policyItem(in, c, "zombie", "僵尸云主机", "按运营中心「僵尸型虚机」策略判定：运行中但长期几乎没有业务负载。",
		"请与业务方确认后关机观察或释放，回收计算资源。", []string{"writeAvg", "cpuAvg", "flavor"}, []string{"磁盘写速率均值(KiB/s)", "CPU 均值(%)", "规格"})
}

func vmHigh(in *Input, c Config, memory bool) Item {
	t := c.Thresholds
	th, label, cur := t.VMCPUHigh, "CPU", func(v monitor.VM) *float64 { return v.CPUPercent }
	if memory {
		th, label, cur = t.VMMemHigh, "内存", func(v monitor.VM) *float64 { return v.MemPercent }
	}
	it := Item{Standard: fmt.Sprintf("运行中云主机当前%s使用率或近 30 天平均%s使用率 ≥ %g%% 判定为偏高。", label, label, th)}
	if in.Snap == nil || len(in.Snap.VMs) == 0 {
		return na("未采集到云主机使用率数据。")
	}
	type rec struct {
		v        monitor.VM
		cur, avg float64
		hasAvg   bool
	}
	var hot []rec
	n := 0
	for _, v := range in.Snap.VMs {
		if !strings.EqualFold(v.Status, "ACTIVE") {
			continue
		}
		n++
		r := rec{v: v}
		hit := false
		if p := cur(v); p != nil {
			r.cur = *p
			hit = hit || *p >= th
		}
		if u, ok := in.Usage[v.ID]; ok {
			a := u.CPUAvg
			if memory {
				a = u.MemAvg
			}
			if a != nil {
				r.avg, r.hasAvg = *a, true
				hit = hit || *a >= th
			}
		}
		if hit {
			hot = append(hot, r)
		}
	}
	if n == 0 {
		it.Status, it.Value, it.Detail = NA, "无运行中云主机", "没有运行中的云主机。"
		return it
	}
	it.Value = fmt.Sprintf("%d 台（运行中共 %d 台）", len(hot), n)
	if len(hot) == 0 {
		it.Status, it.Detail = OK, "没有"+label+"使用率偏高的云主机。"
		return it
	}
	sort.SliceStable(hot, func(i, j int) bool { return maxF(hot[i].cur, hot[i].avg) > maxF(hot[j].cur, hot[j].avg) })
	var rows [][]string
	for _, r := range hot {
		a := "—"
		if r.hasAvg {
			a = num(r.avg, 1) + "%"
		}
		rows = append(rows, []string{dash(r.v.Name), dash(r.v.Node), dash(r.v.IPs), dash(r.v.Flavor), num(r.cur, 1) + "%", a})
	}
	it.Status = Warn
	it.Detail = fmt.Sprintf("%d 台云主机%s使用率偏高，可能存在性能瓶颈。", len(hot), label)
	it.Advice = fmt.Sprintf("%d 台云主机%s使用率持续偏高，请评估是否需要升配或优化应用。", len(hot), label)
	it.Tables = []Table{mkTable(label+"使用率偏高的云主机", []string{"名称", "所在节点", "IP", "规格", "当前" + label, "30 天平均"}, rows, int(t.ListMax))}
	return it
}

func maxF(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func checkVMCPU(in *Input, c Config) Item { return vmHigh(in, c, false) }
func checkVMMem(in *Input, c Config) Item { return vmHigh(in, c, true) }

func checkVolState(in *Input, c Config) Item {
	if len(in.Vols) == 0 {
		return na("未采集到云硬盘数据。")
	}
	it := Item{Status: OK, Standard: "云硬盘处于 error / error_* 状态判定为异常，处于 maintenance / reserved 等状态判定为预警。"}
	var rows [][]string
	nb := 0
	for _, r := range in.Vols {
		st := strings.ToLower(rs(r, "status"))
		lv := OK
		switch {
		case st == "error" || strings.HasPrefix(st, "error_"):
			lv = Bad
		case st == "maintenance" || st == "reserved" || st == "awaiting-transfer":
			lv = Warn
		}
		if lv != OK {
			it.Status = worse(it.Status, lv)
			if lv == Bad {
				nb++
			}
			sz, _ := rf(r, "sizeGb")
			rows = append(rows, []string{dash(rs(r, "name")), dash(rs(r, "statusText")), num(sz, 0) + " GiB", dash(rs(r, "serverNames")), StatusText[lv]})
		}
	}
	it.Value = fmt.Sprintf("共 %d 块云硬盘，错误 %d 块", len(in.Vols), nb)
	if it.Status == OK {
		it.Detail = "云硬盘状态正常。"
		return it
	}
	it.Detail = "存在状态异常的云硬盘。"
	it.Advice = "存在异常状态的云硬盘，请核查对应存储后端与挂载关系，必要时重置状态。"
	it.Tables = []Table{mkTable("状态异常的云硬盘", []string{"名称", "状态", "容量", "挂载云主机", "判定"}, rows, int(c.Thresholds.ListMax))}
	return it
}

// ---------- 数据采集 ----------

func checkFresh(in *Input, c Config) Item {
	it := Item{Standard: fmt.Sprintf("监控数据超过 %g 分钟未更新判定为过期（预警）；监控采集接口调用失败判定为异常。", c.Thresholds.StaleMin)}
	if in.Snap == nil || in.Snap.CollectedAt == nil {
		it.Status, it.Value, it.Detail = Bad, "从未成功采集", "该平台尚未成功采集过监控数据。"
		it.Advice = "该平台尚无监控数据，请在「平台管理」检查对接配置并在监控中心手动采集。"
		return it
	}
	age := math.Max(0, in.Now.Sub(*in.Snap.CollectedAt).Minutes())
	it.Status = OK
	var rows [][]string
	rows = append(rows, []string{"监控数据采集时间", cst(*in.Snap.CollectedAt), fmt.Sprintf("%s 分钟前", num(age, 0))})
	if age > c.Thresholds.StaleMin {
		it.Status = Warn
	}
	if in.CapMeta != nil && in.CapMeta.CollectedAt != nil {
		rows = append(rows, []string{"资产数据采集时间", cst(*in.CapMeta.CollectedAt), fmt.Sprintf("%s 分钟前", num(math.Max(0, in.Now.Sub(*in.CapMeta.CollectedAt).Minutes()), 0))})
	}
	failed := 0
	var frows [][]string
	for _, s := range in.Snap.Steps {
		if !s.OK {
			failed++
			frows = append(frows, []string{"监控", s.Label, dash(s.Error)})
		}
	}
	if in.CapMeta != nil {
		for _, s := range in.CapMeta.Steps {
			if !s.OK {
				failed++
				frows = append(frows, []string{"资产", s.Label, dash(s.Error)})
			}
		}
	}
	if !in.Snap.OK && in.Snap.Error != "" {
		it.Status = worse(it.Status, Bad)
		rows = append(rows, []string{"最近一次采集", "失败", in.Snap.Error})
	}
	if failed > 0 {
		it.Status = worse(it.Status, Bad)
	}
	it.Value = fmt.Sprintf("数据采集于 %s（%s 分钟前）；失败接口 %d 个", cstMin(*in.Snap.CollectedAt), num(age, 0), failed)
	switch it.Status {
	case OK:
		it.Detail = "监控数据及时更新，各采集接口调用成功。"
	default:
		it.Detail = "监控数据已过期或部分采集接口调用失败，本次巡检结论可能不完整。"
		it.Advice = "监控数据过期或采集接口异常，请检查平台连通性、凭证有效期以及采集调度是否正常。"
	}
	it.Tables = []Table{{Title: "数据采集情况", Cols: []string{"项目", "时间 / 结果", "说明"}, Rows: rows}}
	if len(frows) > 0 {
		it.Tables = append(it.Tables, mkTable("调用失败的接口", []string{"来源", "接口", "错误"}, frows, int(c.Thresholds.ListMax)))
	}
	return it
}

func derefGrp(in []*alertGrp) []alertGrp {
	out := make([]alertGrp, len(in))
	for i, g := range in {
		out[i] = *g
	}
	return out
}
