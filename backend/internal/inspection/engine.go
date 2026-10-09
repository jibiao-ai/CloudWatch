package inspection

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

// Input 单个云平台的巡检输入：全部来自已落库（或刚刚实时刷新）的数据，检查函数本身不做任何 IO。
type Input struct {
	Plat      capacity.Platform
	Snap      *monitor.Snapshot
	Nodes     []monitor.Node // 物理节点（已排除 Nova 虚拟机）
	Phys      []capacity.Row
	Computes  []capacity.Row
	Pools     []capacity.Row
	Vols      []capacity.Row
	CapMeta   *capacity.Meta
	Alerts    []*monitor.Alert // 告警中
	Hits      map[string][]map[string]any
	Policies  map[string]analytics.Policy
	Usage     map[string]analytics.VMUsageStat
	Notes     []string
	Series    map[string][]monitor.Point // 历史样本：iops_read / iops_write / storage_used_bytes（平台级）
	NodeLat   map[string]float64         // 各节点近 24 小时磁盘延迟峰值
	Now       time.Time
	Refreshed bool
}

type checker func(in *Input, c Config) Item

var checkers = map[string]checker{
	"svc_state": checkSvcState, "svc_core": checkSvcCore, "node_state": checkNodeState, "node_res": checkNodeRes,
	"compute_cap": checkComputeCap, "sto_health": checkStoHealth, "sto_cap": checkStoCap, "sto_pool": checkStoPool,
	"disk_smart": checkDiskSmart, "disk_life": checkDiskLife, "disk_usage": checkDiskUsage,
	"perf_io": checkPerfIO, "perf_lat": checkPerfLat, "alert_firing": checkAlerts,
	"vm_state": checkVMState, "vm_longoff": checkLongOff, "vm_zombie": checkZombie, "vm_cpu": checkVMCPU, "vm_mem": checkVMMem,
	"vol_state": checkVolState, "collect_fresh": checkFresh,
}

// Evaluate 对一个平台执行全部（未停用的）检查项并给出总体评估。
func Evaluate(in *Input, c Config) PlatformReport {
	if in.Now.IsZero() {
		in.Now = time.Now()
	}
	pr := PlatformReport{ProviderID: in.Plat.ID, Name: in.Plat.Name, EnvType: in.Plat.EnvType, ConsoleIP: in.Plat.ConsoleIP, Items: []Item{}, Advices: []string{}, Notes: in.Notes}
	if in.Snap != nil {
		pr.CollectedAt = in.Snap.CollectedAt
	}
	for _, d := range Catalog {
		if c.disabled(d.Key) {
			continue
		}
		it := checkers[d.Key](in, c)
		it.Key, it.Group, it.Name = d.Key, d.Group, d.Name
		pr.Items = append(pr.Items, it)
		switch it.Status {
		case OK:
			pr.Counts.OK++
		case Warn:
			pr.Counts.Warn++
		case Bad:
			pr.Counts.Bad++
		default:
			pr.Counts.NA++
		}
	}
	pr.Overall = overallOf(pr.Counts)
	pr.Score = scoreOf(pr.Counts)
	pr.Env = envInfo(in)
	for _, it := range pr.Items {
		if it.Advice != "" && (it.Status == Bad || it.Status == Warn) {
			pr.Advices = append(pr.Advices, it.Advice)
		}
	}
	pr.Advices = append(pr.Advices, "建议定期（每日、每周或每月）执行自动巡检，持续关注资源使用率、告警与磁盘寿命趋势。", "本次巡检为只读采集，未对平台做任何变更；如需处理告警或更换硬件，请按变更流程在窗口期操作。")
	pr.Summary = summaryOf(in, pr)
	return pr
}

func overallOf(c Counts) string {
	switch {
	case c.Bad > 0:
		return Bad
	case c.Warn > 0:
		return Warn
	case c.OK == 0:
		return NA
	}
	return OK
}

// 评分权重：每个已采集的检查项按状态计分（正常 1、预警 0.65、异常 0.15），未采集项不参与评分。
const (
	wOK   = 1.0
	wWarn = 0.65
	wBad  = 0.15
	// ScoreVer 评分算法版本；升级时会对历史报告自动重算。
	ScoreVer = 2
)

// scoreOf 健康评分（0~100）：已采集检查项的加权通过率。
// 为保证评分与各项检查结果一致：存在异常项时最高 89 分，存在预警项时最高 94 分；
// 有采集数据时最低 1 分，没有任何已采集项时为 0（无法评估）。
func scoreOf(c Counts) int {
	n := c.OK + c.Warn + c.Bad
	if n == 0 {
		return 0
	}
	s := int(math.Round(100 * (float64(c.OK)*wOK + float64(c.Warn)*wWarn + float64(c.Bad)*wBad) / float64(n)))
	switch {
	case c.Bad > 0 && s > 89:
		s = 89
	case c.Warn > 0 && s > 94:
		s = 94
	}
	if s < 1 {
		s = 1
	}
	return s
}

var envText = map[string]string{"prod": "生产", "dr": "灾备", "dev": "开发测试"}

func envInfo(in *Input) []KV {
	kv := []KV{{"云平台名称", in.Plat.Name}, {"环境类型", firstNonEmpty(envText[in.Plat.EnvType], in.Plat.EnvType)}, {"控制台地址", in.Plat.ConsoleIP}}
	if in.Snap != nil && in.Snap.CollectedAt != nil {
		kv = append(kv, KV{"监控数据采集时间", cst(*in.Snap.CollectedAt)})
	}
	kv = append(kv, KV{"物理节点数", fmt.Sprint(len(in.Nodes))})
	if in.Snap != nil && in.Snap.Summary != nil {
		s := in.Snap.Summary
		if s.Instances.Running != nil || s.Instances.Shutdown != nil {
			kv = append(kv, KV{"云主机数", fmt.Sprint(vmTotal(s.Instances))})
		}
	}
	kv = append(kv, KV{"巡检时间", cst(in.Now)}, KV{"巡检方式", "自动巡检（仅读取已采集的监控 / 资产数据与 GET 查询，未对平台做任何变更）"})
	return kv
}

func firstNonEmpty(a ...string) string {
	for _, s := range a {
		if s != "" {
			return s
		}
	}
	return ""
}

func vmTotal(s monitor.States) int {
	t := 0.0
	for _, p := range []*float64{s.Running, s.Error, s.Shutdown, s.RecycleBin, s.Others} {
		if p != nil {
			t += *p
		}
	}
	return int(t)
}

func summaryOf(in *Input, pr PlatformReport) string {
	var focus []string
	for _, st := range []string{Bad, Warn} {
		for _, it := range pr.Items {
			if it.Status == st {
				focus = append(focus, it.Name)
			}
		}
	}
	sb := fmt.Sprintf("本次于 %s 对云平台「%s」进行自动巡检（只读），共 %d 个检查项：正常 %d、预警 %d、异常 %d、未采集 %d。健康评分 %d。",
		cst(in.Now), in.Plat.Name, len(pr.Items), pr.Counts.OK, pr.Counts.Warn, pr.Counts.Bad, pr.Counts.NA, pr.Score)
	if pr.Overall == NA {
		sb = fmt.Sprintf("本次于 %s 对云平台「%s」进行自动巡检，但尚未采集到有效的监控数据，无法给出健康评分。请先在监控中心完成一次数据采集。", cst(in.Now), in.Plat.Name)
	} else if len(focus) > 0 {
		sb += "需关注：" + joinMax(focus, 8) + "。"
	}
	return sb
}

// Merge 汇总多个平台的结果为整份报告的总体评估。
func Merge(r *Report) {
	r.Counts = Counts{}
	score, n := 0, 0
	r.Overall = NA
	for _, p := range r.Platforms {
		r.Counts.OK += p.Counts.OK
		r.Counts.Warn += p.Counts.Warn
		r.Counts.Bad += p.Counts.Bad
		r.Counts.NA += p.Counts.NA
		r.Overall = worse(r.Overall, p.Overall)
		if p.Overall != NA {
			score += p.Score
			n++
		}
	}
	r.Score, r.ScoreVer = 0, ScoreVer
	if n > 0 {
		r.Score = int(math.Round(float64(score) / float64(n)))
	}
	names := make([]string, 0, len(r.Platforms))
	for _, p := range r.Platforms {
		names = append(names, p.Name)
	}
	sort.Strings(names)
	r.Summary = fmt.Sprintf("本次共巡检 %d 个云平台（%s），合计 %d 个检查项：正常 %d、预警 %d、异常 %d、未采集 %d。平均健康评分 %d。",
		len(r.Platforms), strings.Join(names, "、"), r.Counts.OK+r.Counts.Warn+r.Counts.Bad+r.Counts.NA, r.Counts.OK, r.Counts.Warn, r.Counts.Bad, r.Counts.NA, r.Score)
	if len(r.Platforms) == 0 {
		r.Summary = "没有可巡检的云平台，请先在「平台管理」中对接云平台。"
	}
}
