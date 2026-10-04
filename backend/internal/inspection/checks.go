package inspection

import (
	"fmt"
	"sort"
	"strings"

	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

func na(detail string) Item { return Item{Status: NA, Value: "未采集", Detail: detail} }

func (in *Input) sum() *monitor.Summary {
	if in.Snap == nil {
		return nil
	}
	return in.Snap.Summary
}

func fp(p *float64) (float64, bool) {
	if p == nil {
		return 0, false
	}
	return *p, true
}

func dash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

// ---------- 平台服务 ----------

func checkSvcState(in *Input, c Config) Item {
	if in.Snap == nil || len(in.Snap.Services) == 0 {
		return na("尚未采集到平台控制服务状态，请先在监控中心完成一次数据采集。")
	}
	total, bad, unk := 0, 0, 0
	var rows [][]string
	for _, s := range in.Snap.Services {
		total++
		switch {
		case s.Healthy == nil:
			unk++
		case !*s.Healthy:
			bad++
			v := "—"
			if s.State != nil {
				v = num(*s.State, 2)
			}
			rows = append(rows, []string{ServiceName(s.Name), s.Name, v, "异常"})
		}
	}
	it := Item{Standard: "全部控制服务处于健康状态；任一服务异常判定为异常。"}
	it.Value = fmt.Sprintf("共 %d 项，正常 %d 项，异常 %d 项", total, total-bad-unk, bad)
	if unk > 0 {
		it.Value += fmt.Sprintf("，未采集 %d 项", unk)
	}
	if bad > 0 {
		it.Status = Bad
		it.Detail = "存在运行异常的控制服务，请登录平台核查对应服务进程与日志。"
		it.Advice = "请优先排查异常的平台控制服务：" + joinMax(namesOf(rows, 0), 6) + "，确认进程、依赖组件与日志后恢复。"
		it.Tables = []Table{mkTable("异常的控制服务", []string{"服务名称", "指标", "当前值", "状态"}, rows, int(c.Thresholds.ListMax))}
		return it
	}
	it.Status = OK
	it.Detail = "平台各控制服务运行正常。"
	return it
}

func namesOf(rows [][]string, i int) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r[i])
	}
	return out
}

func checkSvcCore(in *Input, c Config) Item {
	s := in.sum()
	if s == nil || (s.ControlPlaneHealth == nil && s.StorageServiceHealth == nil) {
		return na("未采集到控制面 / 存储服务整体健康度。")
	}
	it := Item{Standard: "控制面与存储服务健康度均为 0（健康）；任一不为 0 判定为异常。", Status: OK}
	var rows [][]string
	txt := func(v *float64) string {
		if v == nil {
			return "未采集"
		}
		if *v == 0 {
			return "健康"
		}
		return "不健康"
	}
	for _, x := range []struct {
		n string
		v *float64
	}{{"控制面服务", s.ControlPlaneHealth}, {"存储服务", s.StorageServiceHealth}} {
		rows = append(rows, []string{x.n, txt(x.v)})
		if x.v != nil && *x.v != 0 {
			it.Status = Bad
		}
	}
	it.Value = "控制面：" + txt(s.ControlPlaneHealth) + "；存储服务：" + txt(s.StorageServiceHealth)
	if it.Status == Bad {
		it.Detail = "核心服务整体健康度异常。"
		it.Advice = "核心服务健康度异常，请结合「平台控制服务状态」与告警列表定位故障组件。"
	} else {
		it.Detail = "控制面与存储服务整体健康。"
	}
	it.Tables = []Table{{Title: "核心服务健康度", Cols: []string{"项目", "状态"}, Rows: rows}}
	return it
}

// ---------- 节点与计算 ----------

func checkNodeState(in *Input, c Config) Item {
	if len(in.Phys) == 0 && len(in.Computes) == 0 {
		return na("尚未采集到配置中心中的物理节点 / 计算节点数据。")
	}
	it := Item{Status: OK, Standard: "物理节点就绪且在线、计算服务运行且已启用；离线 / 故障 / 宕机为异常，维护 / 禁用为预警。"}
	var rows [][]string
	nb, nw := 0, 0
	for _, r := range in.Phys {
		st, text, online := rs(r, "status"), rs(r, "statusText"), rs(r, "online")
		lv := OK
		switch {
		case online == "离线" || st == "error" || st == "unmaintain_error" || st == "offline":
			lv = Bad
		case st == "maintenance" || st == "deleting":
			lv = Warn
		}
		if lv != OK {
			rows = append(rows, []string{"物理节点", dash(rs(r, "hostname")), dash(rs(r, "ip")), dash(text) + " / " + dash(online), StatusText[lv]})
			it.Status = worse(it.Status, lv)
			if lv == Bad {
				nb++
			} else {
				nw++
			}
		}
	}
	for _, r := range in.Computes {
		lv := OK
		switch {
		case rs(r, "state") == "down":
			lv = Bad
		case rs(r, "enabled") == "disabled":
			lv = Warn
		}
		if lv != OK {
			rows = append(rows, []string{"计算服务", dash(rs(r, "name")), dash(rs(r, "hostIp")), dash(rs(r, "stateText")) + " / " + dash(rs(r, "enabledText")), StatusText[lv]})
			it.Status = worse(it.Status, lv)
			if lv == Bad {
				nb++
			} else {
				nw++
			}
		}
	}
	it.Value = fmt.Sprintf("物理节点 %d 个，计算节点 %d 个；异常 %d、预警 %d", len(in.Phys), len(in.Computes), nb, nw)
	switch it.Status {
	case OK:
		it.Detail = "所有物理节点在线就绪，计算服务运行并已启用。"
	default:
		it.Detail = "存在状态异常或被维护 / 禁用的节点。"
		it.Advice = "请核查异常 / 禁用的节点：确认硬件、网络与 nova-compute 服务状态；若为计划内维护，请在维护结束后恢复启用。"
		it.Tables = []Table{mkTable("状态异常的节点", []string{"类型", "节点", "IP", "状态", "判定"}, rows, int(c.Thresholds.ListMax))}
	}
	return it
}

func checkNodeRes(in *Input, c Config) Item {
	var have []monitor.Node
	for _, n := range in.Nodes {
		if n.CPUPercent != nil || n.MemPercent != nil {
			have = append(have, n)
		}
	}
	if len(have) == 0 {
		return na("未采集到物理节点 CPU / 内存使用率。")
	}
	t := c.Thresholds
	it := Item{Status: OK, Standard: fmt.Sprintf("CPU ≥ %g%% / 内存 ≥ %g%% 预警；CPU ≥ %g%% / 内存 ≥ %g%% 异常。", t.NodeCPUWarn, t.NodeMemWarn, t.NodeCPUBad, t.NodeMemBad)}
	var rows [][]string
	var maxCPU, maxMem float64
	hot := 0
	for _, n := range have {
		lv := OK
		if n.CPUPercent != nil {
			lv = worse(lv, grade(*n.CPUPercent, t.NodeCPUWarn, t.NodeCPUBad))
			if *n.CPUPercent > maxCPU {
				maxCPU = *n.CPUPercent
			}
		}
		if n.MemPercent != nil {
			lv = worse(lv, grade(*n.MemPercent, t.NodeMemWarn, t.NodeMemBad))
			if *n.MemPercent > maxMem {
				maxMem = *n.MemPercent
			}
		}
		it.Status = worse(it.Status, lv)
		if lv != OK {
			hot++
		}
		rows = append(rows, []string{n.Name, dash(n.HostIP), pctText(n.CPUPercent), pctText(n.MemPercent), StatusText[lv]})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i][4] != "正常" && rows[j][4] == "正常" })
	it.Value = fmt.Sprintf("%d 个节点；CPU 最高 %s%%，内存最高 %s%%", len(have), num(maxCPU, 1), num(maxMem, 1))
	if hot == 0 {
		it.Detail = "各物理节点 CPU、内存使用率均在阈值以内。"
	} else {
		it.Detail = fmt.Sprintf("%d 个节点的 CPU 或内存使用率超过阈值。", hot)
		it.Advice = "存在高负载物理节点，请排查占用资源的云主机或进程，必要时迁移云主机或扩容节点。"
	}
	it.Tables = []Table{mkTable("物理节点资源使用率", []string{"节点", "管理 IP", "CPU 使用率", "内存使用率", "判定"}, rows, int(c.Thresholds.ListMax))}
	return it
}

func checkComputeCap(in *Input, c Config) Item {
	s := in.sum()
	if s == nil || (s.VCPU.Percent == nil && s.Memory.Percent == nil) {
		return na("未采集到云平台 vCPU / 内存使用情况。")
	}
	t := c.Thresholds
	it := Item{Status: OK, Standard: fmt.Sprintf("vCPU ≥ %g%% / 内存 ≥ %g%% 预警；vCPU ≥ %g%% / 内存 ≥ %g%% 异常。", t.VCPUWarn, t.MemWarn, t.VCPUBad, t.MemBad)}
	var rows [][]string
	row := func(n string, u monitor.Usage, unit string, div, w, b float64) {
		lv := NA
		if u.Percent != nil {
			lv = grade(*u.Percent, w, b)
			it.Status = worse(it.Status, lv)
		}
		tot, use := "—", "—"
		if u.Total != nil {
			tot = num(*u.Total/div, 0) + unit
		}
		if u.Usage != nil {
			use = num(*u.Usage/div, 0) + unit
		}
		rows = append(rows, []string{n, tot, use, pctText(u.Percent), StatusText[lv]})
	}
	row("vCPU", s.VCPU, " 核", 1, t.VCPUWarn, t.VCPUBad)
	row("内存", s.Memory, " GiB", 1024, t.MemWarn, t.MemBad)
	it.Value = "vCPU " + pctText(s.VCPU.Percent) + "；内存 " + pctText(s.Memory.Percent)
	if it.Status == OK {
		it.Detail = "云平台 vCPU、内存使用率正常，资源余量充足。"
	} else {
		it.Detail = "云平台资源使用率偏高。"
		it.Advice = "云平台 vCPU / 内存使用率偏高，请评估扩容计算节点或回收闲置云主机。"
	}
	it.Tables = []Table{{Title: "云平台资源使用情况", Cols: []string{"资源", "总量", "已用", "使用率", "判定"}, Rows: rows}}
	return it
}

// ---------- 存储集群 ----------

func checkStoHealth(in *Input, c Config) Item {
	s := in.sum()
	if s == nil || s.StorageHealth == nil {
		return na("未采集到存储集群健康状态。")
	}
	it := Item{Standard: "存储集群健康指标为 0 表示健康，非 0 判定为异常。"}
	if *s.StorageHealth == 0 {
		it.Status, it.Value, it.Detail = OK, "健康", "分布式存储集群健康（HEALTH_OK）。"
		return it
	}
	it.Status, it.Value = Bad, "不健康（"+num(*s.StorageHealth, 0)+"）"
	it.Detail = "分布式存储集群健康状态异常。"
	it.Advice = "存储集群健康异常，请立即登录存储管理页面或执行 ceph health detail 核查（OSD down、PG 异常等）。"
	return it
}

func checkStoCap(in *Input, c Config) Item {
	s := in.sum()
	if s == nil || s.Storage.UsedPercent == nil {
		return na("未采集到存储集群容量数据。")
	}
	t := c.Thresholds
	st := s.Storage
	it := Item{Standard: fmt.Sprintf("原始容量使用率 ≥ %g%% 预警、≥ %g%% 异常；按近 7 天增速预测，预计 ≤ %g 天写满为预警、≤ %g 天为异常。", t.StorageWarn, t.StorageBad, t.RunwayWarn, t.RunwayBad)}
	it.Status = grade(*st.UsedPercent, t.StorageWarn, t.StorageBad)
	rows := [][]string{{"容量使用率", pctText(st.UsedPercent), StatusText[it.Status]}}
	if st.TotalBytes != nil {
		rows = append(rows, []string{"原始总容量", bytesText(*st.TotalBytes), ""})
	}
	if st.UsedBytes != nil {
		rows = append(rows, []string{"已用容量", bytesText(*st.UsedBytes), ""})
	}
	if st.FreeBytes != nil {
		rows = append(rows, []string{"可用容量", bytesText(*st.FreeBytes), ""})
	}
	it.Value = "已用 " + pctText(st.UsedPercent)
	if st.TotalBytes != nil && st.UsedBytes != nil {
		it.Value += "（" + bytesText(*st.UsedBytes) + " / " + bytesText(*st.TotalBytes) + "）"
	}
	it.Detail = "存储集群容量使用率正常。"
	// 容量耗尽预测
	pts := in.Series["storage_used_bytes"]
	var ts []int64
	var vs []float64
	for _, p := range pts {
		ts, vs = append(ts, p.T), append(vs, p.V)
	}
	free := 0.0
	if st.FreeBytes != nil {
		free = *st.FreeBytes
	} else if st.TotalBytes != nil && st.UsedBytes != nil {
		free = *st.TotalBytes - *st.UsedBytes
	}
	if rate, ok := linearRate(ts, vs); ok && free > 0 {
		if rate > 0 {
			days := free / rate
			lv := OK
			if days <= t.RunwayBad {
				lv = Bad
			} else if days <= t.RunwayWarn {
				lv = Warn
			}
			it.Status = worse(it.Status, lv)
			rows = append(rows, []string{"近 7 天日均增长", bytesText(rate) + " / 天", ""}, []string{"预计写满", fmt.Sprintf("约 %s 天后", num(days, 0)), StatusText[lv]})
			it.Value += fmt.Sprintf("；按近期增速预计约 %s 天后写满", num(days, 0))
		} else {
			rows = append(rows, []string{"近 7 天日均增长", "无增长或已回落", StatusText[OK]})
		}
	} else {
		rows = append(rows, []string{"容量预测", "历史样本不足（需连续采集 6 小时以上）", ""})
	}
	if it.Status != OK {
		it.Detail = "存储集群容量使用率偏高或预计将在短期内耗尽。"
		it.Advice = "存储集群容量紧张，请尽快规划扩容或清理无用云硬盘 / 快照 / 镜像。"
	}
	it.Tables = []Table{{Title: "集群容量", Cols: []string{"项目", "数值", "判定"}, Rows: rows}}
	return it
}

func checkStoPool(in *Input, c Config) Item {
	if len(in.Pools) == 0 {
		return na("未采集到块存储后端（存储池）数据。")
	}
	t := c.Thresholds
	it := Item{Status: OK, Standard: fmt.Sprintf("后端状态 down 为异常；使用率 ≥ %g%% 预警、≥ %g%% 异常。", t.PoolWarn, t.PoolBad)}
	var rows [][]string
	maxU, bad := 0.0, 0
	for _, r := range in.Pools {
		lv := OK
		if rs(r, "status") == "down" {
			lv = Bad
		}
		u, hasU := rf(r, "usedPercent")
		if hasU {
			lv = worse(lv, grade(u, t.PoolWarn, t.PoolBad))
			if u > maxU {
				maxU = u
			}
		}
		it.Status = worse(it.Status, lv)
		if lv != OK {
			bad++
		}
		up := "—"
		if hasU {
			up = num(u, 1) + "%"
		}
		tg, _ := rf(r, "totalGb")
		ug, _ := rf(r, "usedGb")
		rows = append(rows, []string{dash(rs(r, "poolName")), dash(rs(r, "statusText")), num(tg, 0) + " GiB", num(ug, 0) + " GiB", up, StatusText[lv]})
	}
	it.Value = fmt.Sprintf("%d 个存储池；最高使用率 %s%%", len(in.Pools), num(maxU, 1))
	if it.Status == OK {
		it.Detail = "所有存储池状态正常，容量使用率在阈值以内。"
	} else {
		it.Detail = fmt.Sprintf("%d 个存储池状态异常或使用率偏高。", bad)
		it.Advice = "存储池状态异常或容量偏高，请核查存储后端并规划扩容。"
	}
	it.Tables = []Table{mkTable("存储池", []string{"存储池", "状态", "总容量", "已用", "使用率", "判定"}, rows, int(c.Thresholds.ListMax))}
	return it
}

// ---------- 磁盘 ----------

func diskName(d monitor.Disk) string { return shortName(d.Node) + " / " + dash(d.Device) }

func checkDiskSmart(in *Input, c Config) Item {
	if in.Snap == nil || len(in.Snap.Disks) == 0 {
		return na("未采集到物理磁盘信息。")
	}
	it := Item{Status: OK, Standard: "磁盘健康状态为 OK / Healthy / Passed 视为正常，其他取值判定为异常。"}
	var rows [][]string
	known := 0
	for _, d := range in.Snap.Disks {
		h := strings.TrimSpace(d.Healthy)
		if h == "" || h == "-" {
			continue
		}
		known++
		if diskBad(h) {
			rows = append(rows, []string{diskName(d), dash(d.Type), dash(d.Model), dash(d.Serial), h})
		}
	}
	it.Value = fmt.Sprintf("共 %d 块磁盘，异常 %d 块", len(in.Snap.Disks), len(rows))
	if known == 0 {
		it.Status, it.Value, it.Detail = NA, "未采集", "磁盘健康字段未返回。"
		return it
	}
	if len(rows) == 0 {
		it.Detail = "所有磁盘健康状态正常。"
		return it
	}
	it.Status = Bad
	it.Detail = "存在健康状态异常的物理磁盘。"
	it.Advice = "存在 SMART 异常的磁盘：" + joinMax(namesOf(rows, 0), 5) + "，请核查并按流程更换，更换前确认存储集群数据副本完整。"
	it.Tables = []Table{mkTable("健康异常的磁盘", []string{"节点 / 设备", "类型", "型号", "序列号", "健康状态"}, rows, int(c.Thresholds.ListMax))}
	return it
}

func checkDiskLife(in *Input, c Config) Item {
	if in.Snap == nil || len(in.Snap.Disks) == 0 {
		return na("未采集到物理磁盘信息。")
	}
	t := c.Thresholds
	it := Item{Status: OK, Standard: fmt.Sprintf("固态盘已用寿命 ≥ %g%% 预警、≥ %g%% 异常。", t.SSDLifeWarn, t.SSDLifeBad)}
	type rec struct {
		d  monitor.Disk
		v  float64
		lv string
	}
	var all []rec
	maxV := 0.0
	for _, d := range in.Snap.Disks {
		if v, ok := usedLife(d.Type, d.UsedLife); ok {
			lv := grade(v, t.SSDLifeWarn, t.SSDLifeBad)
			all = append(all, rec{d, v, lv})
			it.Status = worse(it.Status, lv)
			if v > maxV {
				maxV = v
			}
		}
	}
	if len(all) == 0 {
		it.Status, it.Value, it.Detail = NA, "无固态盘", "未发现带寿命指标的固态盘（HDD 无此指标）。"
		return it
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].v > all[j].v })
	var rows [][]string
	for _, r := range all {
		if r.lv != OK {
			rows = append(rows, []string{diskName(r.d), dash(r.d.Model), dash(r.d.Purpose), num(r.v, 0) + "%", StatusText[r.lv]})
		}
	}
	it.Value = fmt.Sprintf("共 %d 块固态盘，最高已用寿命 %s%%", len(all), num(maxV, 0))
	if len(rows) == 0 {
		it.Detail = "所有固态盘剩余寿命充足。"
		return it
	}
	it.Detail = fmt.Sprintf("%d 块固态盘已用寿命超过阈值。", len(rows))
	it.Advice = "部分固态盘寿命接近耗尽，请提前备件并安排更换。"
	it.Tables = []Table{mkTable("寿命偏高的固态盘", []string{"节点 / 设备", "型号", "用途", "已用寿命", "判定"}, rows, int(c.Thresholds.ListMax))}
	return it
}

func checkDiskUsage(in *Input, c Config) Item {
	if in.Snap == nil || len(in.Snap.Disks) == 0 {
		return na("未采集到物理磁盘信息。")
	}
	t := c.Thresholds
	it := Item{Status: OK, Standard: fmt.Sprintf("物理磁盘容量使用率 ≥ %g%% 预警、≥ %g%% 异常。", t.DiskUsageWarn, t.DiskUsageBad)}
	n, maxV := 0, 0.0
	type rec struct {
		d  monitor.Disk
		v  float64
		lv string
	}
	var hot []rec
	for _, d := range in.Snap.Disks {
		v, ok := diskUsagePct(d.Usage, d.Capacity)
		if !ok {
			continue
		}
		n++
		if v > maxV {
			maxV = v
		}
		if lv := grade(v, t.DiskUsageWarn, t.DiskUsageBad); lv != OK {
			hot = append(hot, rec{d, v, lv})
			it.Status = worse(it.Status, lv)
		}
	}
	if n == 0 {
		it.Status, it.Value, it.Detail = NA, "未采集", "未采集到磁盘容量使用情况。"
		return it
	}
	it.Value = fmt.Sprintf("统计 %d 块磁盘，最高使用率 %s%%", n, num(maxV, 1))
	if len(hot) == 0 {
		it.Detail = "所有磁盘容量使用率在阈值以内。"
		return it
	}
	sort.SliceStable(hot, func(i, j int) bool { return hot[i].v > hot[j].v })
	var rows [][]string
	for _, r := range hot {
		rows = append(rows, []string{diskName(r.d), dash(r.d.Type), dash(r.d.Capacity), dash(r.d.Usage), num(r.v, 1) + "%", StatusText[r.lv]})
	}
	it.Detail = fmt.Sprintf("%d 块磁盘使用率超过阈值。", len(hot))
	it.Advice = "部分物理磁盘使用率偏高，请检查数据分布是否均衡，必要时扩容或重平衡。"
	it.Tables = []Table{mkTable("使用率偏高的磁盘", []string{"节点 / 设备", "类型", "容量", "已用", "使用率", "判定"}, rows, int(c.Thresholds.ListMax))}
	return it
}
