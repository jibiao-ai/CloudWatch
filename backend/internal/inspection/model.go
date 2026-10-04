// Package inspection 自动巡检：基于已对接云平台的监控接口（EMLA）与资源接口（Nova / Cinder）数据，
// 对服务状态、磁盘、集群容量、存储 IO、磁盘延迟、实时告警、云主机健康等逐项巡检，生成可追溯的巡检报告，并支持导出 Word 文档。
// 巡检全程只读：不会对云平台做任何变更。
package inspection

import (
	"fmt"
	"strings"
	"time"
)

// 检查项结果。
const (
	OK   = "ok"   // 正常
	Warn = "warn" // 预警
	Bad  = "bad"  // 异常
	NA   = "na"   // 未采集 / 不适用
)

// StatusText 状态的中文展示。
var StatusText = map[string]string{OK: "正常", Warn: "预警", Bad: "异常", NA: "未采集"}

// Table 检查项的明细表。
type Table struct {
	Title string     `json:"title"`
	Cols  []string   `json:"cols"`
	Rows  [][]string `json:"rows"`
	Note  string     `json:"note,omitempty"`
	More  int        `json:"more,omitempty"` // 未展示的行数
}

// Item 一个检查项的结果。
type Item struct {
	Key      string  `json:"key"`
	Group    string  `json:"group"`
	Name     string  `json:"name"`
	Status   string  `json:"status"`
	Value    string  `json:"value"`    // 关键数据（一行）
	Detail   string  `json:"detail"`   // 说明
	Standard string  `json:"standard"` // 判定标准
	Advice   string  `json:"advice,omitempty"`
	Tables   []Table `json:"tables,omitempty"`
}

// KV 键值对（环境信息）。
type KV struct {
	K string `json:"k"`
	V string `json:"v"`
}

// Counts 各状态的检查项数量。
type Counts struct {
	OK   int `json:"ok"`
	Warn int `json:"warn"`
	Bad  int `json:"bad"`
	NA   int `json:"na"`
}

// PlatformReport 单个云平台的巡检结果。
type PlatformReport struct {
	ProviderID  string     `json:"providerId"`
	Name        string     `json:"name"`
	EnvType     string     `json:"envType"`
	ConsoleIP   string     `json:"consoleIp"`
	CollectedAt *time.Time `json:"collectedAt"`
	Overall     string     `json:"overall"` // ok | warn | bad | na
	Score       int        `json:"score"`
	Counts      Counts     `json:"counts"`
	Env         []KV       `json:"env"`
	Items       []Item     `json:"items"`
	Summary     string     `json:"summary"`
	Advices     []string   `json:"advices"`
	Notes       []string   `json:"notes,omitempty"` // 巡检过程提示（实时采集失败等）
}

// Report 一次巡检的完整报告（存于 inspection_results.detail）。
type Report struct {
	ID         int64            `json:"id"`
	TaskID     string           `json:"taskId"`
	Title      string           `json:"title"`
	Trigger    string           `json:"trigger"` // manual | schedule
	Operator   string           `json:"operator"`
	OperatorNm string           `json:"operatorName"`
	StartedAt  time.Time        `json:"startedAt"`
	FinishedAt time.Time        `json:"finishedAt"`
	Overall    string           `json:"overall"`
	Score      int              `json:"score"`
	ScoreVer   int              `json:"scoreVer"` // 评分算法版本
	Counts     Counts           `json:"counts"`
	Summary    string           `json:"summary"`
	Refreshed  bool             `json:"refreshed"` // 巡检前是否实时调用了平台接口
	Platforms  []PlatformReport `json:"platforms"`
	Config     Config           `json:"config"` // 本次使用的阈值快照
}

// Row 报告列表中的一行（不含明细）。
type Row struct {
	ID         int64     `json:"id"`
	TaskID     string    `json:"taskId"`
	Title      string    `json:"title"`
	Trigger    string    `json:"trigger"`
	Operator   string    `json:"operator"`
	OperatorNm string    `json:"operatorName"`
	Scope      string    `json:"scope"`
	StartedAt  time.Time `json:"startedAt"`
	FinishedAt time.Time `json:"finishedAt"`
	Overall    string    `json:"overall"`
	Score      int       `json:"score"`
	Counts     Counts    `json:"counts"`
	Summary    string    `json:"summary"`
}

// Thresholds 判定阈值。均为「≥ 即触发」，Warn 触发预警，Bad 触发异常。
type Thresholds struct {
	SSDLifeWarn   float64 `json:"ssdLifeWarn"` // 固态盘已用寿命 %
	SSDLifeBad    float64 `json:"ssdLifeBad"`
	DiskUsageWarn float64 `json:"diskUsageWarn"` // 物理磁盘容量使用率 %
	DiskUsageBad  float64 `json:"diskUsageBad"`
	StorageWarn   float64 `json:"storageWarn"` // 存储集群原始容量使用率 %
	StorageBad    float64 `json:"storageBad"`
	PoolWarn      float64 `json:"poolWarn"` // 存储池使用率 %
	PoolBad       float64 `json:"poolBad"`
	RunwayWarn    float64 `json:"runwayWarnDays"` // 预计写满天数 ≤ 即预警
	RunwayBad     float64 `json:"runwayBadDays"`
	VCPUWarn      float64 `json:"vcpuWarn"` // 云平台 vCPU 使用率 %
	VCPUBad       float64 `json:"vcpuBad"`
	MemWarn       float64 `json:"memWarn"` // 云平台内存使用率 %
	MemBad        float64 `json:"memBad"`
	NodeCPUWarn   float64 `json:"nodeCpuWarn"` // 物理节点 CPU 使用率 %
	NodeCPUBad    float64 `json:"nodeCpuBad"`
	NodeMemWarn   float64 `json:"nodeMemWarn"` // 物理节点内存使用率 %
	NodeMemBad    float64 `json:"nodeMemBad"`
	DiskIOWarn    float64 `json:"diskIoWarn"` // 节点磁盘 I/O 使用率 %
	DiskIOBad     float64 `json:"diskIoBad"`
	LatencyWarn   float64 `json:"latencyWarn"` // 节点磁盘 I/O 延迟 ms
	LatencyBad    float64 `json:"latencyBad"`
	VMCPUHigh     float64 `json:"vmCpuHigh"` // 云主机 CPU 使用率（当前或近 30 天平均）≥ % 视为偏高
	VMMemHigh     float64 `json:"vmMemHigh"` // 云主机内存使用率 ≥ % 视为偏高
	StaleMin      float64 `json:"staleMin"`  // 监控数据超过多少分钟未更新视为过期
	ListMax       float64 `json:"listMax"`   // 明细表最多列出的行数
}

// Schedule 定时巡检（东八区）。
type Schedule struct {
	Enabled bool   `json:"enabled"`
	Mode    string `json:"mode"`    // daily | weekly | monthly
	Time    string `json:"time"`    // HH:MM
	Weekday int    `json:"weekday"` // 1..7（周一..周日），weekly 时有效
	Day     int    `json:"day"`     // 1..31（每月几号），monthly 时有效；当月没有该日期时取当月最后一天
}

// Config 巡检配置。
type Config struct {
	Thresholds   Thresholds `json:"thresholds"`
	Schedule     Schedule   `json:"schedule"`
	RefreshFirst bool       `json:"refreshFirst"` // 巡检前先实时调用平台接口刷新监控与资产数据
	Disabled     []string   `json:"disabled"`     // 停用的检查项 key
}

// DefaultConfig 默认配置。
func DefaultConfig() Config {
	return Config{
		Thresholds: Thresholds{
			SSDLifeWarn: 80, SSDLifeBad: 90, DiskUsageWarn: 80, DiskUsageBad: 90,
			StorageWarn: 70, StorageBad: 85, PoolWarn: 75, PoolBad: 90, RunwayWarn: 90, RunwayBad: 30,
			VCPUWarn: 70, VCPUBad: 85, MemWarn: 70, MemBad: 85, NodeCPUWarn: 80, NodeCPUBad: 90, NodeMemWarn: 80, NodeMemBad: 90,
			DiskIOWarn: 70, DiskIOBad: 90, LatencyWarn: 20, LatencyBad: 50, VMCPUHigh: 85, VMMemHigh: 90, StaleMin: 30, ListMax: 30,
		},
		Schedule:     Schedule{Mode: "daily", Time: "02:00", Weekday: 1, Day: 1},
		RefreshFirst: true,
		Disabled:     []string{},
	}
}

// FieldErrors 字段级校验错误。
type FieldErrors map[string]string

// Normalize 校验并规整配置。
func (c *Config) Normalize() FieldErrors {
	e := FieldErrors{}
	t := &c.Thresholds
	pair := func(key, label string, w, b *float64, lo, hi float64, unit string) {
		if *w < lo || *w > hi || *b < lo || *b > hi {
			e[key] = fmt.Sprintf("%s 取值范围为 %g ~ %g%s", label, lo, hi, unit)
			return
		}
		if key == "runway" { // 天数：越小越严重
			if *b >= *w {
				e[key] = label + "：异常阈值必须小于预警阈值"
			}
			return
		}
		if *w >= *b {
			e[key] = label + "：预警阈值必须小于异常阈值"
		}
	}
	pair("ssdLife", "固态盘已用寿命", &t.SSDLifeWarn, &t.SSDLifeBad, 1, 100, "%")
	pair("diskUsage", "物理磁盘使用率", &t.DiskUsageWarn, &t.DiskUsageBad, 1, 100, "%")
	pair("storage", "存储集群容量使用率", &t.StorageWarn, &t.StorageBad, 1, 100, "%")
	pair("pool", "存储池使用率", &t.PoolWarn, &t.PoolBad, 1, 100, "%")
	pair("runway", "容量预计耗尽天数", &t.RunwayWarn, &t.RunwayBad, 1, 3650, " 天")
	pair("vcpu", "云平台 vCPU 使用率", &t.VCPUWarn, &t.VCPUBad, 1, 100, "%")
	pair("mem", "云平台内存使用率", &t.MemWarn, &t.MemBad, 1, 100, "%")
	pair("nodeCpu", "节点 CPU 使用率", &t.NodeCPUWarn, &t.NodeCPUBad, 1, 100, "%")
	pair("nodeMem", "节点内存使用率", &t.NodeMemWarn, &t.NodeMemBad, 1, 100, "%")
	pair("diskIo", "节点磁盘 I/O 使用率", &t.DiskIOWarn, &t.DiskIOBad, 1, 100, "%")
	pair("latency", "磁盘 I/O 延迟", &t.LatencyWarn, &t.LatencyBad, 0.1, 100000, " ms")
	if t.VMCPUHigh < 1 || t.VMCPUHigh > 100 {
		e["vmCpuHigh"] = "云主机 CPU 使用率阈值取值范围为 1 ~ 100%"
	}
	if t.VMMemHigh < 1 || t.VMMemHigh > 100 {
		e["vmMemHigh"] = "云主机内存使用率阈值取值范围为 1 ~ 100%"
	}
	if t.StaleMin < 5 || t.StaleMin > 1440 {
		e["staleMin"] = "数据过期时间取值范围为 5 ~ 1440 分钟"
	}
	if t.ListMax < 5 || t.ListMax > 200 {
		e["listMax"] = "明细表行数上限取值范围为 5 ~ 200"
	}
	s := &c.Schedule
	if s.Mode != "daily" && s.Mode != "weekly" && s.Mode != "monthly" {
		s.Mode = "daily"
	}
	if _, err := time.Parse("15:04", s.Time); err != nil {
		e["time"] = "执行时间格式应为 HH:MM"
	}
	if s.Weekday < 1 || s.Weekday > 7 {
		s.Weekday = 1
	}
	if s.Day < 1 || s.Day > 31 {
		s.Day = 1
	}
	known := map[string]bool{}
	for _, d := range Catalog {
		known[d.Key] = true
	}
	var dis []string
	seen := map[string]bool{}
	for _, k := range c.Disabled {
		if k = strings.TrimSpace(k); known[k] && !seen[k] {
			seen[k] = true
			dis = append(dis, k)
		}
	}
	c.Disabled = append([]string{}, dis...)
	if len(c.Disabled) >= len(Catalog) {
		e["disabled"] = "至少需要启用一个检查项"
	}
	return e
}

func (c Config) disabled(key string) bool {
	for _, k := range c.Disabled {
		if k == key {
			return true
		}
	}
	return false
}

// Def 检查项定义。
type Def struct {
	Key   string `json:"key"`
	Group string `json:"group"`
	Name  string `json:"name"`
	Desc  string `json:"desc"`
}

// Catalog 全部检查项（顺序即报告顺序）。
var Catalog = []Def{
	{"svc_state", "平台服务", "平台控制服务状态", "平台 35 项控制服务（认证、计算、块存储、网络、监控、消息队列等）的运行状态"},
	{"svc_core", "平台服务", "核心服务健康度", "控制面服务与存储服务的整体健康度（仪表盘口径）"},
	{"node_state", "节点与计算", "节点与计算服务状态", "物理节点在线 / 状态、nova-compute 计算服务的运行与启用状态"},
	{"node_res", "节点与计算", "物理节点资源使用率", "各物理节点的 CPU、内存使用率"},
	{"compute_cap", "节点与计算", "云资源使用情况", "云平台 vCPU、内存的整体使用率"},
	{"sto_health", "存储集群", "存储集群健康", "分布式存储集群（Ceph）的健康状态"},
	{"sto_cap", "存储集群", "集群容量状态", "存储集群原始容量使用率，并按近 7 天增速预测容量耗尽时间"},
	{"sto_pool", "存储集群", "存储池容量与状态", "块存储后端（Cinder 存储池）的状态与容量使用率"},
	{"disk_smart", "磁盘", "磁盘健康（SMART）", "物理磁盘的健康状态"},
	{"disk_life", "磁盘", "固态盘寿命", "SSD / NVMe 已使用寿命"},
	{"disk_usage", "磁盘", "磁盘容量使用率", "物理磁盘的容量使用率"},
	{"perf_io", "性能", "集群存储 IO 性能", "集群读写 IOPS（当前与近 24 小时）以及各节点磁盘 I/O 使用率"},
	{"perf_lat", "性能", "磁盘延迟", "各节点磁盘 I/O 延迟（当前与近 24 小时峰值）"},
	{"alert_firing", "告警", "集群正在告警", "告警中心中仍在告警的事件，按告警类型归拢"},
	{"vm_state", "云主机", "云主机运行状态", "云主机状态分布，以及处于错误状态的云主机"},
	{"vm_longoff", "云主机", "长期关机云主机", "按运营中心「长期关机虚机」策略判定，长期占用资源但未使用的云主机"},
	{"vm_zombie", "云主机", "僵尸云主机", "按运营中心「僵尸型虚机」策略判定，运行中但几乎无业务负载的云主机"},
	{"vm_cpu", "云主机", "CPU 使用率偏高的云主机", "运行中云主机的当前或近 30 天平均 CPU 使用率偏高"},
	{"vm_mem", "云主机", "内存使用率偏高的云主机", "运行中云主机的当前或近 30 天平均内存使用率偏高"},
	{"vol_state", "云主机", "云硬盘状态", "云硬盘是否存在错误状态"},
	{"collect_fresh", "数据采集", "监控数据时效与采集", "监控 / 资产数据是否按时更新，各采集接口是否调用成功"},
}

// Groups 检查项分组顺序。
var Groups = []string{"平台服务", "节点与计算", "存储集群", "磁盘", "性能", "告警", "云主机", "数据采集"}
