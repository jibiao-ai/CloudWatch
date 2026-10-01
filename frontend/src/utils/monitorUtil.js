/** 监控中心的纯函数与字典（服务友好名称、容量字符串解析、排序比较） */
import { formatBytes } from './format';

export const RANGES = [{ value: '1h', label: '近 1 小时' }, { value: '6h', label: '近 6 小时' }, { value: '24h', label: '近 24 小时' }, { value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }];

/** 服务指标 → 友好名称（来自《接口补充文档》对照表） */
export const SERVICE_NAMES = {
  service_authentication_api_state: '认证api服务',
  service_automation_center_state: '自动化中心服务',
  service_block_storage_api_state: '块存储api服务',
  service_block_storage_backup_state: '块存储备份服务',
  service_block_storage_scheduler_state: '块存储调度服务',
  service_block_storage_state: '块存储服务',
  service_cloud_automation_state: '自动化中心',
  service_cloud_console_state: '云控制台',
  service_compute_api_state: '计算api服务',
  service_compute_management_state: '计算管理服务',
  service_compute_scheduler_state: '计算调度服务',
  service_compute_state: '计算服务',
  service_control_api_state: '控制api服务',
  service_control_management_state: '控制管理服务',
  service_control_scheduler_state: '控制调度服务',
  service_data_protection_state: '数据保护服务',
  service_database_state: '数据库服务',
  service_event_mesh_state: '事件网格服务',
  service_high_performance_cache_management_state: '高性能缓存管理服务',
  service_high_performance_cache_state: '高性能缓存服务',
  service_hostha_state: '主机高可用服务',
  service_image_management_state: '镜像管理api服务',
  service_log_collection_state: '日志收集服务',
  service_monitoring_alert_api_state: '监控告警api服务',
  service_monitoring_api_state: '监控api服务',
  service_monitoring_storage_api_state: '监控数据存储api服务',
  service_network_api_state: '网络api服务',
  service_network_dhcp_state: '网络dhcp服务',
  service_network_lb_state: '网络负载均衡服务',
  service_network_metadata_state: 'SDN元数据服务',
  service_network_virtual_switch_state: '虚拟交换机网络服务',
  service_network_vnc_state: 'vnc权限管理服务',
  service_rabbitmq_state: '消息队列服务',
  service_time_synchronization_state: '时间同步服务',
  service_virtualization_management_state: '虚拟化管理服务',
};

/** 不在对照表里的指标：去掉 service_ 前缀与 _state 后缀作为兜底名称，仍保留原始指标名可查 */
export const serviceName = (code) => SERVICE_NAMES[code] || String(code || '').replace(/^service_/, '').replace(/_state$/, '').replace(/_/g, ' ');

const CATS = [
  [/block_storage|data_protection|storage_state/, '存储'],
  [/monitoring|log_collection/, '监控与日志'],
  [/network/, '网络'],
  [/compute|virtualization|hostha/, '计算与虚拟化'],
  [/control|authentication|image_management/, '控制面'],
];
/** 服务分类：按指标名关键字归类，用于筛选与分组展示 */
export const serviceCategory = (code) => (CATS.find(([re]) => re.test(code)) || [null, '基础平台'])[1];
export const SERVICE_CATEGORIES = ['控制面', '计算与虚拟化', '存储', '网络', '监控与日志', '基础平台'];

const UNIT = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4, PIB: 1024 ** 5 };
/** "7.27TiB" / "481.00 GiB" / "3.64 TB" → 字节；无法解析返回 null */
export function parseSize(s) {
  const m = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(String(s ?? ''));
  if (!m) return null;
  const u = (m[2] || 'B').toUpperCase();
  return UNIT[u] ? parseFloat(m[1]) * UNIT[u] : null;
}

/** 磁盘使用率（%）：disk_usage 为容量串（481.00GiB）时与 disk_capacity 相除；为百分比串（41.2%）时直接取值；缺失返回 null */
export function diskUsagePct(d) {
  const u = String(d.usage ?? '').trim();
  if (!u || u === '-') return null;
  if (u.endsWith('%')) { const v = parseFloat(u); return Number.isNaN(v) ? null : v; }
  const a = parseSize(u);
  const t = parseSize(d.capacity);
  return a != null && t ? Math.min(100, (a / t) * 100) : null;
}

/** 已用寿命：HDD 或接口返回「-」显示「—」；其余原样 */
export const usedLifeText = (d) => (!d.usedLife || d.usedLife === '-' || String(d.type).toUpperCase() === 'HDD' ? '—' : d.usedLife);
export const usedLifeNum = (d) => { const v = parseFloat(usedLifeText(d)); return Number.isNaN(v) ? null : v; };

export const formatRate = (v) => (v == null ? '—' : `${formatBytes(v)}/s`);

const empty = (v) => v == null || v === '' || v === '-' || (typeof v === 'number' && Number.isNaN(v));
/** 排序比较：空值始终排最后；数字按数值；字符串按中文自然序 */
export function compareBy(get, order) {
  const dir = order === 'desc' ? -1 : 1;
  return (a, b) => {
    const x = get(a);
    const y = get(b);
    if (empty(x) && empty(y)) return 0;
    if (empty(x)) return 1;
    if (empty(y)) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'zh-CN', { numeric: true }) * dir;
  };
}
