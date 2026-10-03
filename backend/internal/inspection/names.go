package inspection

import "strings"

// serviceNames 服务指标 → 中文名称（与前端监控中心「服务状态」一致，来自接口补充文档对照表）。
var serviceNames = map[string]string{
	"service_authentication_api_state":                "认证api服务",
	"service_automation_center_state":                 "自动化中心服务",
	"service_block_storage_api_state":                 "块存储api服务",
	"service_block_storage_backup_state":              "块存储备份服务",
	"service_block_storage_scheduler_state":           "块存储调度服务",
	"service_block_storage_state":                     "块存储服务",
	"service_cloud_automation_state":                  "自动化中心",
	"service_cloud_console_state":                     "云控制台",
	"service_compute_api_state":                       "计算api服务",
	"service_compute_management_state":                "计算管理服务",
	"service_compute_scheduler_state":                 "计算调度服务",
	"service_compute_state":                           "计算服务",
	"service_control_api_state":                       "控制api服务",
	"service_control_management_state":                "控制管理服务",
	"service_control_scheduler_state":                 "控制调度服务",
	"service_data_protection_state":                   "数据保护服务",
	"service_database_state":                          "数据库服务",
	"service_event_mesh_state":                        "事件网格服务",
	"service_high_performance_cache_management_state": "高性能缓存管理服务",
	"service_high_performance_cache_state":            "高性能缓存服务",
	"service_hostha_state":                            "主机高可用服务",
	"service_image_management_state":                  "镜像管理api服务",
	"service_log_collection_state":                    "日志收集服务",
	"service_monitoring_alert_api_state":              "监控告警api服务",
	"service_monitoring_api_state":                    "监控api服务",
	"service_monitoring_storage_api_state":            "监控数据存储api服务",
	"service_network_api_state":                       "网络api服务",
	"service_network_dhcp_state":                      "网络dhcp服务",
	"service_network_lb_state":                        "网络负载均衡服务",
	"service_network_metadata_state":                  "SDN元数据服务",
	"service_network_virtual_switch_state":            "虚拟交换机网络服务",
	"service_network_vnc_state":                       "vnc权限管理服务",
	"service_rabbitmq_state":                          "消息队列服务",
	"service_time_synchronization_state":              "时间同步服务",
	"service_virtualization_management_state":         "虚拟化管理服务",
}

// ServiceName 服务的展示名称；不在对照表内时去掉 service_ 前缀与 _state 后缀。
func ServiceName(code string) string {
	if n, ok := serviceNames[code]; ok {
		return n
	}
	return strings.ReplaceAll(strings.TrimSuffix(strings.TrimPrefix(code, "service_"), "_state"), "_", " ")
}
