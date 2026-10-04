import { Cloud, Server, Cpu, Monitor, HardDrive, Cable, Database, Network } from 'lucide-react';

/** 节点类型 → 名称 / 图标 / 对应的配置中心页签 */
export const TYPES = {
  platform: { label: '云平台', icon: Cloud },
  phys: { label: '物理节点', icon: Server, kind: 'phys' },
  host: { label: '计算节点', icon: Cpu, kind: 'nodes' },
  vm: { label: '虚拟机', icon: Monitor, kind: 'vms' },
  volume: { label: '云硬盘', icon: HardDrive, kind: 'volumes' },
  port: { label: '虚拟网卡', icon: Cable, kind: 'ports' },
  pool: { label: '集群存储', icon: Database, kind: 'pools' },
  network: { label: '网络', icon: Network },
};

/** 分层：自上而下 平台 → 物理 → 计算 → 虚拟机 → 云硬盘 / 虚拟网卡 → 存储 / 网络；同一层可含多种类型 */
export const LAYERS = [
  { key: 'phys', title: '物理层', desc: '物理服务器（Coaster 资产）', types: ['phys'] },
  { key: 'host', title: '计算层', desc: 'Nova 计算节点（hypervisor）', types: ['host'] },
  { key: 'vm', title: '实例层', desc: '虚拟机（云主机）', types: ['vm'] },
  { key: 'attach', title: '挂载层', desc: '云硬盘 / 虚拟网卡', types: ['volume', 'port'] },
  { key: 'backend', title: '后端层', desc: '集群存储 / 网络', types: ['pool', 'network'] },
];

/** 健康度 → 文案 / 配色（全部走主题变量） */
export const HEALTH = {
  danger: { label: '异常', dot: 'bg-danger', chip: 'border-danger bg-danger-soft', tag: 'tag-danger', text: 'text-danger' },
  warning: { label: '告警', dot: 'bg-warning', chip: 'border-warning bg-warning-soft', tag: 'tag-warning', text: 'text-warning' },
  ok: { label: '正常', dot: 'bg-success', chip: 'border-line bg-card', tag: 'tag-success', text: 'text-success' },
  off: { label: '已停止', dot: 'bg-fg-subtle', chip: 'border-line bg-muted', tag: 'tag-default', text: 'text-fg-muted' },
  unknown: { label: '未知', dot: 'bg-fg-subtle', chip: 'border-dashed border-line-strong bg-card', tag: 'tag-default', text: 'text-fg-muted' },
};
export const HEALTH_RANK = { danger: 4, warning: 3, unknown: 2, ok: 1, off: 0 };

export const HEALTH_OPTIONS = [
  { value: 'all', label: '全部健康度' },
  { value: 'bad', label: '异常 + 告警' },
  { value: 'danger', label: '异常' },
  { value: 'warning', label: '告警' },
  { value: 'ok', label: '正常' },
  { value: 'off', label: '已停止' },
  { value: 'unknown', label: '未知' },
];

export const SEVERITY = { critical: ['严重', 'tag-danger'], warning: ['警告', 'tag-warning'], info: ['提示', 'tag-info'] };

/** 使用率 → 进度条配色 */
export const pctTone = (v) => (v >= 85 ? 'bg-danger' : v >= 70 ? 'bg-warning' : 'bg-success');

/** 建立邻接表（出边 / 入边） */
export function buildIndex(graph) {
  const byId = new Map();
  const out = new Map();
  const inn = new Map();
  graph.nodes.forEach((n) => byId.set(n.id, n));
  graph.edges.forEach((e) => {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inn.has(e.to)) inn.set(e.to, []);
    out.get(e.from).push(e.to);
    inn.get(e.to).push(e.from);
  });
  return { byId, out, inn };
}

/** 某节点的上游 + 下游全部关联节点（含自身） */
export function related(idx, id) {
  const set = new Set([id]);
  const walk = (m, start) => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      (m.get(cur) || []).forEach((n) => { if (!set.has(n)) { set.add(n); stack.push(n); } });
    }
  };
  walk(idx.out, id);
  walk(idx.inn, id);
  return set;
}

/** 关键词 / 健康度过滤 */
export function matchNode(n, q, health) {
  if (health === 'bad' && n.health !== 'danger' && n.health !== 'warning') return false;
  if (health !== 'all' && health !== 'bad' && n.health !== health) return false;
  if (q) return `${n.name} ${n.sub} ${n.statusText} ${n.attrs.map((a) => a[1]).join(' ')}`.toLowerCase().includes(q.toLowerCase());
  return true;
}

export const sortBySeverity = (list) => [...list].sort((a, b) => HEALTH_RANK[b.health] - HEALTH_RANK[a.health] || b.alerts.critical - a.alerts.critical);
