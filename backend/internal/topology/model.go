// Package topology 资源拓扑：把平台管理（平台）、配置中心（物理节点 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 存储池）、
// 监控中心（CPU / 内存使用率）、告警中心（未恢复告警）的已落库数据聚合成分层的资源关系图。只读，不额外访问云平台接口。
package topology

import "time"

// 节点类型。
const (
	TPlatform = "platform"
	TPhys     = "phys"
	THost     = "host"
	TVM       = "vm"
	TVolume   = "volume"
	TPort     = "port"
	TPool     = "pool"
	TNetwork  = "network"
)

// 健康度：danger 异常 > warning 告警/高负载 > ok 正常 > off 已停止/未使用 > unknown 未知。
const (
	HDanger  = "danger"
	HWarning = "warning"
	HOK      = "ok"
	HOff     = "off"
	HUnknown = "unknown"
)

// Alerts 关联到某节点的未恢复告警数（按级别）。
type Alerts struct {
	Critical int `json:"critical"`
	Warning  int `json:"warning"`
	Info     int `json:"info"`
}

func (a Alerts) Total() int { return a.Critical + a.Warning + a.Info }

// Ref 配置中心中对应的资源（用于打开资产详情）。
type Ref struct {
	Kind string `json:"kind"` // phys / nodes / vms / volumes / ports / pools
	ID   string `json:"id"`
}

// Node 拓扑节点。
type Node struct {
	ID         string      `json:"id"`
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Sub        string      `json:"sub"`        // 副标题：IP / 规格 / 容量等
	Health     string      `json:"health"`     // 健康度
	StatusText string      `json:"statusText"` // 资产状态文字（运行中 / 已关机 …）
	Reasons    []string    `json:"reasons"`    // 非正常的原因
	CPU        *float64    `json:"cpu"`        // CPU 使用率 %（监控中心 / 资产）
	Mem        *float64    `json:"mem"`        // 内存使用率 %
	Alerts     Alerts      `json:"alerts"`
	Attrs      [][2]string `json:"attrs"`
	Ref        *Ref        `json:"ref,omitempty"`
	// 云硬盘治理字段：容量 / 创建时间 / 是否未挂载任何虚拟机
	SizeGB    *float64 `json:"sizeGb,omitempty"`
	CreatedAt string   `json:"createdAt,omitempty"`
	Orphan    bool     `json:"orphan,omitempty"`
}

// Edge 关系：contains 平台包含 / hosts 物理机承载计算节点、计算节点承载虚拟机 / attach 虚拟机挂载云硬盘 / nic 虚拟机拥有网卡 / store 存储池承载云硬盘 / net 网络包含网卡。
type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Type string `json:"type"`
}

// AlertItem 未恢复告警（告警中心）。
type AlertItem struct {
	ID       int64     `json:"id"`
	Title    string    `json:"title"`
	Severity string    `json:"severity"`
	Type     string    `json:"type"`
	NodeName string    `json:"nodeName"`
	HostIP   string    `json:"hostIp"`
	NodeID   string    `json:"nodeId"` // 关联到的拓扑节点（匹配不到为空，仅计入平台）
	FiredAt  time.Time `json:"firedAt"`
	Acked    bool      `json:"acked"`
}

// Platform 平台摘要（平台管理 + 采集状态）。
type Platform struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	EnvType     string     `json:"envType"`
	ConsoleIP   string     `json:"consoleIp"`
	Status      string     `json:"status"` // 平台管理的验证状态 online / warning / error / unknown
	Health      string     `json:"health"`
	AssetAt     *time.Time `json:"assetAt"`   // 资产最近一次采集
	AssetOK     bool       `json:"assetOk"`   // 资产采集是否成功
	MonitorAt   *time.Time `json:"monitorAt"` // 监控最近一次采集
	MonitorOK   bool       `json:"monitorOk"`
	AlertFiring int        `json:"alertFiring"`
}

// Count 某类型的总数与各状态数：Danger 异常（严重告警 / 资源故障）、Warning 告警（警告级告警 / 高负载 / 过渡态）、Off 已停止。
// Abnormal = Danger + Warning（兼容旧字段，界面请分开展示）。
type Count struct {
	Total    int `json:"total"`
	Danger   int `json:"danger"`
	Warning  int `json:"warning"`
	Abnormal int `json:"abnormal"`
	Off      int `json:"off"`
}

// OrphanSummary 未挂载云硬盘治理摘要。
type OrphanSummary struct {
	Count   int     `json:"count"`
	SizeGB  float64 `json:"sizeGb"`
	Idle30  int     `json:"idle30"`  // 创建超过 30 天仍未挂载
	Idle90  int     `json:"idle90"`  // 创建超过 90 天仍未挂载
	Danger  int     `json:"danger"`  // 其中状态异常
	Warning int     `json:"warning"` // 其中状态告警
}

// HostCell 总览热力图的一个单元：一台计算节点（含其承载虚拟机的状态汇总）。
type HostCell struct {
	Name      string `json:"name"`
	NodeID    string `json:"nodeId"`
	Health    string `json:"health"`
	VMTotal   int    `json:"vmTotal"`
	VMDanger  int    `json:"vmDanger"`
	VMWarning int    `json:"vmWarning"`
	VMOff     int    `json:"vmOff"`
}

// Usage 平台容量使用率（来自配置中心的计算节点 / 存储池）。
type Usage struct {
	VCPU    *float64 `json:"vcpu"`
	Mem     *float64 `json:"mem"`
	Storage *float64 `json:"storage"`
}

// Graph 单个平台的完整拓扑。
type Graph struct {
	Platform Platform         `json:"platform"`
	Nodes    []Node           `json:"nodes"`
	Edges    []Edge           `json:"edges"`
	Alerts   []AlertItem      `json:"alerts"`
	Counts   map[string]Count `json:"counts"`
	Usage    Usage            `json:"usage"`
	Total    Alerts           `json:"alertTotals"`
	Orphan   OrphanSummary    `json:"orphan"`
}

// Overview 全局视图：每个平台一张图的摘要（不含节点明细）。
type OverviewItem struct {
	Platform Platform         `json:"platform"`
	Counts   map[string]Count `json:"counts"`
	Usage    Usage            `json:"usage"`
	Alerts   Alerts           `json:"alerts"`
	Hosts    []HostCell       `json:"hosts"`  // 计算节点热力单元（异常优先）
	Orphan   OrphanSummary    `json:"orphan"` // 未挂载云硬盘
}
