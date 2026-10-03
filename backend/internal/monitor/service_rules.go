package monitor

// 平台控制服务（/ecms/services）健康判定。
//
// 接口文档写的是「0 健康、1 不健康」，但线上真实返回的取值口径并不统一（北京生产环境实测）：
//   - check_*_api / mysql_up / probe_success / ecms_hostha_service_status：1 = 正常，0 = 异常
//   - *_up_total：在线服务个数，> 0 = 正常
//   - *_down_percent：宕机百分比，0 = 正常
//   - 无 __name__ 的聚合指标：计算类（compute / compute_management / compute_scheduler / block_storage /
//     virtualization_management）为「异常个数」，0 = 正常（compute_state=3 与 Nova os-services 中
//     1 个 down + 2 个 disabled 的 nova-compute 吻合）；控制面类（control_* / rabbitmq / log_collection /
//     event_mesh / data_protection）为可用百分比，100 = 正常；time_synchronization / automation_center 为存活标识，≥ 1 = 正常
//
// 判定口径按服务指标名集中维护在本文件；新增或调整口径只改这里。

type healthKind int

const (
	okZero healthKind = iota // 值为 0 才正常（异常个数 / 宕机百分比 / 文档口径，也是未登记指标的默认口径）
	okOne                    // 值 ≥ 1 才正常（存活标识）
	okPct                    // 值 ≥ 100 才正常（可用百分比）
	okPos                    // 值 > 0 才正常（在线个数）
)

// ServiceCodes 监控中心「服务状态」展示的 35 个服务指标（对照表），其余指标一律不展示。
var serviceKinds = map[string]healthKind{
	"service_authentication_api_state":                okOne,
	"service_automation_center_state":                 okOne,
	"service_block_storage_api_state":                 okOne,
	"service_block_storage_backup_state":              okPos,
	"service_block_storage_scheduler_state":           okPos,
	"service_block_storage_state":                     okZero,
	"service_cloud_automation_state":                  okOne,
	"service_cloud_console_state":                     okOne,
	"service_compute_api_state":                       okOne,
	"service_compute_management_state":                okZero,
	"service_compute_scheduler_state":                 okZero,
	"service_compute_state":                           okZero,
	"service_control_api_state":                       okPct,
	"service_control_management_state":                okPct,
	"service_control_scheduler_state":                 okPct,
	"service_data_protection_state":                   okPct,
	"service_database_state":                          okOne,
	"service_event_mesh_state":                        okPct,
	"service_high_performance_cache_management_state": okZero,
	"service_high_performance_cache_state":            okZero,
	"service_hostha_state":                            okOne,
	"service_image_management_state":                  okOne,
	"service_log_collection_state":                    okPct,
	"service_monitoring_alert_api_state":              okOne,
	"service_monitoring_api_state":                    okOne,
	"service_monitoring_storage_api_state":            okOne,
	"service_network_api_state":                       okOne,
	"service_network_dhcp_state":                      okOne,
	"service_network_lb_state":                        okOne,
	"service_network_metadata_state":                  okOne,
	"service_network_virtual_switch_state":            okOne,
	"service_network_vnc_state":                       okOne,
	"service_rabbitmq_state":                          okPct,
	"service_time_synchronization_state":              okOne,
	"service_virtualization_management_state":         okZero,
}

// IsShownService 是否属于需要展示的 35 个服务指标。
func IsShownService(name string) bool { _, ok := serviceKinds[name]; return ok }

func kindOf(name string) healthKind { return serviceKinds[name] } // 未登记 → okZero（文档口径）

func (k healthKind) healthy(v float64) bool {
	switch k {
	case okOne:
		return v >= 1
	case okPct:
		return v >= 100
	case okPos:
		return v > 0
	}
	return v == 0
}

// worse 多个序列点时取「最坏」的那个值：越高越好的口径取最小值，okZero 取最大值。
func (k healthKind) worse(a, b float64) float64 {
	if k == okZero {
		if b > a {
			return b
		}
		return a
	}
	if b < a {
		return b
	}
	return a
}

// applyHealth 按口径判定 Healthy（State 为 nil 时保持 nil = 未采集到数值）。
func applyHealth(sv *Service) {
	if sv.State == nil {
		sv.Healthy = nil
		return
	}
	h := kindOf(sv.Name).healthy(*sv.State)
	sv.Healthy = &h
}

// filterServices 只保留对照表内的 35 个服务指标，并补算健康状态（兼容已入库的旧快照）。
func filterServices(in []Service) []Service {
	out := make([]Service, 0, len(in))
	for _, sv := range in {
		if !IsShownService(sv.Name) {
			continue
		}
		applyHealth(&sv)
		out = append(out, sv)
	}
	return out
}
