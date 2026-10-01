package monitor

import "time"

// Usage 总量 / 已用 / 百分比（vCPU、内存）。
type Usage struct {
	Total   *float64 `json:"total"`
	Usage   *float64 `json:"usage"`
	Percent *float64 `json:"percent"`
}

// States 云主机状态分布。
type States struct {
	Running    *float64 `json:"running"`
	Error      *float64 `json:"error"`
	Shutdown   *float64 `json:"shutdown"`
	RecycleBin *float64 `json:"recycleBin"`
	Others     *float64 `json:"others"`
}

// Cap 存储集群实际容量（字节）。
type Cap struct {
	TotalBytes  *float64 `json:"totalBytes"`
	UsedBytes   *float64 `json:"usedBytes"`
	FreeBytes   *float64 `json:"freeBytes"`
	UsedPercent *float64 `json:"usedPercent"`
}

// Summary 平台级概览指标；采集不到的字段为 null，前端显示「—」。
type Summary struct {
	VCPU                 Usage    `json:"vcpu"`
	Memory               Usage    `json:"memory"`
	Instances            States   `json:"instances"`
	Storage              Cap      `json:"storage"`
	StorageHealth        *float64 `json:"storageHealth"`        // 0 健康，非 0 不健康
	ControlPlaneHealth   *float64 `json:"controlPlaneHealth"`   // 0 健康，1 不健康
	StorageServiceHealth *float64 `json:"storageServiceHealth"` // 0 健康，1 不健康
	IopsRead             *float64 `json:"iopsRead"`
	IopsWrite            *float64 `json:"iopsWrite"`
}

// Node 计算 / 物理节点资源（来自 /ecms/nodes）。
type Node struct {
	Name       string   `json:"name"`
	HostIP     string   `json:"hostIp"`
	CPUPercent *float64 `json:"cpuPercent"`
	CPUUser    *float64 `json:"cpuUser"`
	CPUSystem  *float64 `json:"cpuSystem"`
	CPUIowait  *float64 `json:"cpuIowait"`
	MemTotal   *float64 `json:"memTotal"`
	MemFree    *float64 `json:"memFree"`
	MemCached  *float64 `json:"memCached"`
	MemPercent *float64 `json:"memPercent"` // (total-free)/total*100
}

// Disk 物理磁盘（来自 storage_cluster_disk_info）。
type Disk struct {
	Node       string `json:"node"`
	HostIP     string `json:"hostIp"`
	Device     string `json:"device"`
	Model      string `json:"model"`
	Serial     string `json:"serial"`
	Type       string `json:"type"` // HDD / SSD
	Capacity   string `json:"capacity"`
	Usage      string `json:"usage"`
	Healthy    string `json:"healthy"`
	UsedLife   string `json:"usedLife"` // 已使用寿命；「-」表示非 SSD
	Purpose    string `json:"purpose"`
	OsdID      string `json:"osdId"`
	Slot       string `json:"slot"`
	PowerHours string `json:"powerOnHours"`
	Rotation   string `json:"rotation"`
}

// Service 控制服务状态（来自 /ecms/services）。
type Service struct {
	Name  string   `json:"name"`
	State *float64 `json:"state"` // 0 健康，1 不健康，null 未返回数值
}

// Series 存储集群明细序列（来自 /ecms/storage）。
type Series struct {
	Metric string            `json:"metric"`
	Labels map[string]string `json:"labels,omitempty"`
	Value  float64           `json:"value"`
}

// Step 一次采集中的单个接口调用结果，用于定位部分失败。
type Step struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	OK         bool   `json:"ok"`
	Error      string `json:"error,omitempty"`
	DurationMs int64  `json:"durationMs"`
}

// Snapshot 某平台最近一次采集的完整快照。
type Snapshot struct {
	ProviderID  string     `json:"providerId"`
	CollectedAt *time.Time `json:"collectedAt"`
	OK          bool       `json:"ok"`
	Error       string     `json:"error"`
	DurationMs  int        `json:"durationMs"`
	Summary     *Summary   `json:"summary"`
	Nodes       []Node     `json:"nodes"`
	Disks       []Disk     `json:"disks"`
	Services    []Service  `json:"services"`
	Storage     []Series   `json:"storage"`
	Steps       []Step     `json:"steps"`
	AlertSyncAt *time.Time `json:"alertSyncAt"`
	AlertError  string     `json:"alertError"`
	AlertFiring int        `json:"alertFiring"`
}

// 采集的 EMLA 接口清单（key → 路径）。
const (
	pathStorage   = "/apis/monitoring/v1/ecms/storage"
	pathDashboard = "/apis/monitoring/v1/ecms/dashboard"
	pathServices  = "/apis/monitoring/v1/ecms/services"
	pathNodes     = "/apis/monitoring/v1/ecms/nodes"
	pathAlerts    = "/apis/monitoring/v1/ecms/alerts"
)

var storageCapMetrics = "storage_actual_capacity_free_bytes|storage_actual_capacity_usage_bytes|storage_actual_capacity_total_bytes"

var nodeMetrics = "node_cpu_utilization_total|node_cpu_utilization_idle|node_cpu_utilization_user|node_cpu_utilization_system|node_cpu_utilization_nice|node_cpu_utilization_iowait|node_cpu_utilization_irq|node_cpu_utilization_softirq|node_cpu_utilization_steal|node_memory_total|node_memory_usage|node_memory_free|node_memory_buffer_usage|node_memory_cached|node_memory_slab"
