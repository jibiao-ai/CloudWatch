import { HEALTH_RANK } from './topoUtil';

const bad = (h) => h === 'danger' || h === 'warning';
const worst = (...hs) => hs.reduce((a, h) => (HEALTH_RANK[h] > HEALTH_RANK[a] ? h : a), 'ok');

/** 某类型各状态数（优先使用后端拆分的 danger / warning；兼容旧接口只有 abnormal 的情况） */
export function stat(counts, t) {
  const c = (counts && counts[t]) || {};
  const danger = c.danger ?? c.abnormal ?? 0;
  const warning = c.warning ?? 0;
  const off = c.off || 0;
  const total = c.total || 0;
  return { total, danger, warning, off, ok: Math.max(0, total - danger - warning - off) };
}

/**
 * 把后端的 nodes / edges 建成「归属」索引（树形 + 两类枢纽）：
 *   物理 → 计算 → 虚拟机 → 云硬盘 / 网卡；云硬盘 → 存储池；网卡 → 网络；未挂载的云硬盘单独归档。
 */
export function buildModel(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const physOfHost = new Map(); const vmsOfHost = new Map(); const hostOfVm = new Map();
  const volsOfVm = new Map(); const portsOfVm = new Map(); const vmOfChild = new Map();
  const poolOfVol = new Map(); const netOfPort = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  graph.edges.forEach((e) => {
    if (e.type === 'hosts') {
      if (e.from.startsWith('phys:')) physOfHost.set(e.to, e.from);
      else if (e.from.startsWith('host:')) { push(vmsOfHost, e.from, e.to); hostOfVm.set(e.to, e.from); }
    } else if (e.type === 'attach') { push(volsOfVm, e.from, e.to); if (!vmOfChild.has(e.to)) vmOfChild.set(e.to, e.from); }
    else if (e.type === 'nic') { push(portsOfVm, e.from, e.to); vmOfChild.set(e.to, e.from); }
    else if (e.type === 'store') poolOfVol.set(e.from, e.to);
    else if (e.type === 'net') netOfPort.set(e.from, e.to);
  });
  // 枢纽：存储池 / 网络 → 受影响的虚拟机集合
  const poolVms = new Map(); const poolVols = new Map(); const netVms = new Map(); const netPorts = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  poolOfVol.forEach((pool, vol) => { poolVols.set(pool, (poolVols.get(pool) || 0) + 1); const vm = vmOfChild.get(vol); if (vm) add(poolVms, pool, vm); });
  netOfPort.forEach((net, port) => { netPorts.set(net, (netPorts.get(net) || 0) + 1); const vm = vmOfChild.get(port); if (vm) add(netVms, net, vm); });

  const physUsed = new Set(physOfHost.values());
  const hosts = graph.nodes.filter((n) => n.type === 'host').map((host) => {
    const phys = byId.get(physOfHost.get(host.id)) || null;
    const vms = (vmsOfHost.get(host.id) || []).map((i) => byId.get(i)).filter(Boolean)
      .sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health] || a.name.localeCompare(b.name, 'zh'));
    const c = { danger: 0, warning: 0, off: 0 };
    vms.forEach((v) => { if (v.health === 'danger') c.danger += 1; else if (v.health === 'warning') c.warning += 1; else if (v.health === 'off') c.off += 1; });
    const health = worst(host.health === 'off' ? 'ok' : host.health, phys && bad(phys.health) ? phys.health : 'ok', c.danger ? 'danger' : c.warning ? 'warning' : 'ok');
    return { host, phys, vms, c, health, id: host.id };
  }).sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health] || b.c.danger - a.c.danger || b.vms.length - a.vms.length || a.host.name.localeCompare(b.host.name, 'zh', { numeric: true }));

  const physOnly = graph.nodes.filter((n) => n.type === 'phys' && !physUsed.has(n.id))
    .sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health] || a.name.localeCompare(b.name, 'zh', { numeric: true }));
  const pools = graph.nodes.filter((n) => n.type === 'pool');
  const nets = graph.nodes.filter((n) => n.type === 'network').sort((a, b) => (netPorts.get(b.id) || 0) - (netPorts.get(a.id) || 0));
  const orphans = graph.nodes.filter((n) => n.type === 'volume' && n.orphan);

  /** 异常资源：异常在前、警示在后；可定位的资源带上所在宿主机 / 虚拟机 */
  const problems = graph.nodes.filter((n) => bad(n.health) && n.type !== 'network' && !(n.type === 'volume' && n.orphan)).map((n) => {
    let vm = null; let host = null;
    if (n.type === 'vm') vm = n.id;
    else if (n.type === 'volume' || n.type === 'port') vm = vmOfChild.get(n.id) || null;
    if (vm) host = hostOfVm.get(vm) || null;
    else if (n.type === 'host') host = n.id;
    else if (n.type === 'phys') host = [...physOfHost.entries()].find(([, p]) => p === n.id)?.[0] || null;
    return { node: n, vm, host };
  }).sort((a, b) => HEALTH_RANK[b.node.health] - HEALTH_RANK[a.node.health]);

  return { byId, hosts, hostById: new Map(hosts.map((h) => [h.id, h])), physOnly, pools, nets, orphans, problems,
    volsOfVm, portsOfVm, hostOfVm, vmOfChild, poolOfVol, netOfPort, poolVms, poolVols, netVms, netPorts };
}

/** 反向高亮：存储池 / 网络 → 受影响虚拟机集合；无焦点返回 null */
export function focusVms(m, focus) {
  if (!focus) return null;
  return (focus.kind === 'pool' ? m.poolVms : m.netVms).get(focus.id) || new Set();
}
