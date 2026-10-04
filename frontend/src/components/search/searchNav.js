/**
 * 搜索结果 → 跳转地址。各分组的 item.id 语义见后端 search.go：
 *  - 资产类（vms/phys/nodes/volumes/ports/pools）：资产行 id，配置中心页自动带入关键字并打开详情
 *  - 监控类：节点名 / 磁盘 / 服务名，监控中心切到对应平台与页签并带入关键字
 */
const q = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const CAP = ['vms', 'phys', 'nodes', 'volumes', 'ports', 'pools'];

export function searchTarget(it) {
  if (CAP.includes(it.group)) return `/capacity?${q({ tab: it.group, keyword: it.title, providerId: it.providerId, open: it.id })}`;
  switch (it.group) {
    case 'platform': return `/system/providers?${q({ keyword: it.title })}`;
    case 'monNode': return `/monitor?${q({ tab: 'nodes', pid: it.providerId, kw: it.title })}`;
    case 'monDisk': return `/monitor?${q({ tab: 'disks', pid: it.providerId, kw: it.id.split('|')[1] ? `${it.id.split('|')[0]} ${it.id.split('|')[1]}` : it.title })}`;
    case 'monService': return `/monitor?${q({ tab: 'services', pid: it.providerId, kw: it.title })}`;
    case 'alert': return `/alerts?${q({ keyword: '', open: it.id })}`;
    case 'domain': return `/system/domain#mappings`;
    default: return '/dashboard';
  }
}
