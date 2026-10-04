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

// Node 计算 / 物理节点资源（来自 /ecms/nodes，核数来自 Nova os-hypervisors，网络与磁盘 IO 来自 series/query）。
type Node struct {
	Name        string   `json:"name"`
	HostIP      string   `json:"hostIp"`
	CPUPercent  *float64 `json:"cpuPercent"`
	CPUUser     *float64 `json:"-"` // 仅用于 CPU 总使用率缺失时的近似，不再展示
	CPUSystem   *float64 `json:"-"`
	CPUIowait   *float64 `json:"-"`
	CoresTotal  *float64 `json:"coresTotal"` // Nova hypervisor vcpus
	CoresUsed   *float64 `json:"coresUsed"`  // Nova hypervisor vcpus_used（已分配 vCPU）；非计算节点无此值时按 CPU 使用率 × 总核数估算（取整）
	VMCount     *float64 `json:"vmCount"`    // Nova hypervisor running_vms
	MemTotal    *float64 `json:"memTotal"`
	MemFree     *float64 `json:"memFree"`
	MemCached   *float64 `json:"memCached"`
	MemPercent  *float64 `json:"memPercent"`  // (total-free)/total*100
	NetRx       *float64 `json:"netRx"`       // 字节/秒
	NetTx       *float64 `json:"netTx"`       // 字节/秒
	DiskIO      *float64 `json:"diskIo"`      // 磁盘 I/O 使用率 %
	DiskLatency *float64 `json:"diskLatency"` // node_disk_io_latency（各设备最大值）
}

// VM 云主机（Nova servers/detail + Gnocchi 最近一次 cpu_util / memory.util）。
type VM struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Status     string   `json:"status"`
	Node       string   `json:"node"` // 所在物理节点（OS-EXT-SRV-ATTR:host 去掉域名后缀）
	IPs        string   `json:"ips"`
	Flavor     string   `json:"flavor"`
	FlavorID   string   `json:"-"`
	VCPUs      int      `json:"vcpus"`
	RAMMB      int      `json:"ramMb"`
	DiskGB     int      `json:"diskGb"`
	AZ         string   `json:"az"`
	ProjectID  string   `json:"projectId"`
	CreatedAt  string   `json:"createdAt"`
	CPUPercent *float64 `json:"cpuPercent"`
	MemPercent *float64 `json:"memPercent"`
	WriteBps   *float64 `json:"diskWriteBps"` // 最近一次 disk.write.bytes.rate（字节/秒，各磁盘合计）
	// 以下为平台可选提供的扩展指标（Gnocchi 资源上存在对应指标才会采到，否则为空）
	ReadyPercent *float64 `json:"cpuReadyPercent"` // CPU 就绪时间占比 %
	SwapMB       *float64 `json:"swapMb"`          // 内存交换量（>0 表示存在 Swap）
	LatencyMs    *float64 `json:"diskLatencyMs"`   // 磁盘读/写时延 ms
	FsPercent    *float64 `json:"fsPercent"`       // 虚拟机内部文件系统使用率 %
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
	Name      string            `json:"name"`
	State     *float64          `json:"state"`     // 指标原始值（多序列取最坏值），null 未返回数值；是否健康按指标口径判定，见 service_rules.go
	Healthy   *bool             `json:"healthy"`   // 按指标口径判定的健康状态；null 未采集到数值
	Instances int               `json:"instances"` // 该指标返回的序列数
	Labels    map[string]string `json:"labels,omitempty"`
	At        float64           `json:"at,omitempty"` // 指标时间戳（秒）
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
	Path       string `json:"path"` // 请求路径（采集明细展示，与配置中心一致）
	OK         bool   `json:"ok"`
	Count      int    `json:"count"` // 返回 / 解析条数
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
	VMs         []VM       `json:"vms"`
	Services    []Service  `json:"services"`
	Storage     []Series   `json:"storage"`
	Steps       []Step     `json:"steps"`
	AlertSyncAt *time.Time `json:"alertSyncAt"`
	AlertError  string     `json:"alertError"`
	AlertFiring int        `json:"alertFiring"`
}

// 采集的 EMLA 接口清单（key → 路径）。
const (
	pathSeries    = "/apis/monitoring/v1/projects/%s/series/query"
	pathStorage   = "/apis/monitoring/v1/ecms/storage"
	pathDashboard = "/apis/monitoring/v1/ecms/dashboard"
	pathServices  = "/apis/monitoring/v1/ecms/services"
	pathNodes     = "/apis/monitoring/v1/ecms/nodes"
	pathAlerts    = "/apis/monitoring/v1/ecms/alerts"
	seriesPath    = "/apis/monitoring/v1/projects/{project_id}/series/query"
)

var storageCapMetrics = "storage_actual_capacity_free_bytes|storage_actual_capacity_usage_bytes|storage_actual_capacity_total_bytes"

var nodeMetrics = "node_cpu_utilization_total|node_cpu_utilization_idle|node_cpu_utilization_user|node_cpu_utilization_system|node_cpu_utilization_nice|node_cpu_utilization_iowait|node_cpu_utilization_irq|node_cpu_utilization_softirq|node_cpu_utilization_steal|node_memory_total|node_memory_usage|node_memory_free|node_memory_buffer_usage|node_memory_cached|node_memory_slab|node_disk_io_latency"
