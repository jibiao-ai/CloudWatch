/**
 * 概览 mock —— 指标口径参照接口文档第 5 章：
 *  - 存储容量：Prometheus ceph_pool_bytes_used / ceph_pool_max_avail（已用 / 可用 / 总量）
 *  - vCPU / 内存：domain_usage 的 usage / quotas
 *  - 节点：CPU 使用率 node_cpu_utilization_total，内存 (total-free)/total，load5，网卡进出流量
 * TODO(mock)：接入真实后端后，由后端聚合后返回相同结构。
 */
const TiB = 1024 ** 4;
const rnd = (seed) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};
export function dashboardOverview(providers, q) {
  const ids = q.providerIds ? String(q.providerIds).split(',') : null;
  const list = providers.filter((p) => !ids || ids.includes(p.id));
  const items = list.map((p, i) => {
    const r = rnd(i + 11);
    const offline = p.status === 'error';
    const vcpuTotal = 768 * (p.nodeCount / 6) * 1 + i * 32;
    const ramTotal = 3072 + i * 128; // GiB
    const storageTotal = (180 + i * 40) * TiB;
    return {
      id: p.id, name: p.name, envType: p.envType, status: p.status, nodeCount: p.nodeCount, consoleIp: p.consoleIp,
      vms: offline ? 0 : Math.round(180 + r() * 260),
      vcpu: { used: offline ? 0 : Math.round(vcpuTotal * (0.42 + r() * 0.42)), total: Math.round(vcpuTotal) },
      ram: { used: offline ? 0 : Math.round(ramTotal * (0.4 + r() * 0.45)), total: ramTotal },
      storage: { used: offline ? 0 : Math.round(storageTotal * (0.38 + r() * 0.5)), total: storageTotal },
      alerts: p.status === 'warning' ? 5 : p.status === 'error' ? 9 : Math.floor(r() * 3),
      updatedAt: p.lastSyncAt,
    };
  });
  const sum = (f) => items.reduce((s, x) => s + f(x), 0);
  return {
    totals: {
      providers: items.length,
      online: items.filter((x) => x.status === 'online').length,
      nodes: sum((x) => x.nodeCount),
      vms: sum((x) => x.vms),
      alerts: sum((x) => x.alerts),
      vcpu: { used: sum((x) => x.vcpu.used), total: sum((x) => x.vcpu.total) },
      ram: { used: sum((x) => x.ram.used), total: sum((x) => x.ram.total) },
      storage: { used: sum((x) => x.storage.used), total: sum((x) => x.storage.total) },
    },
    providers: items,
    topNodes: items.filter((x) => x.status !== 'error').flatMap((x, i) => Array.from({ length: 3 }).map((_, k) => {
      const r = rnd(i * 7 + k + 3);
      return { provider: x.name, node: `compute-${String(i * 3 + k + 1).padStart(2, '0')}`, cpu: Math.round(55 + r() * 40), mem: Math.round(50 + r() * 42), load5: +(3 + r() * 9).toFixed(2) };
    })).sort((a, b) => b.cpu - a.cpu).slice(0, 6),
  };
}
export function dashboardTrend(q) {
  const start = Number(q.start) || Date.now() - 86400e3;
  const end = Number(q.end) || Date.now();
  const points = 48;
  const step = (end - start) / points;
  const build = (from, seed) => {
    const r = rnd(seed);
    return Array.from({ length: points }).map((_, i) => {
      const t = from + i * step;
      const wave = Math.sin((i / points) * Math.PI * 4 + seed) * 8;
      return { t, cpu: +(52 + wave + r() * 6).toFixed(1), mem: +(63 + wave / 2 + r() * 4).toFixed(1), netIn: +(180 + wave * 8 + r() * 40).toFixed(1), netOut: +(140 + wave * 6 + r() * 35).toFixed(1) };
    });
  };
  const cur = build(start, 3);
  const prev = q.compare ? build(start - (end - start), 9).map((p, i) => ({ ...p, t: cur[i].t })) : null;
  return { current: cur, previous: prev };
}
