/** 监控中心「全部云平台」聚合：给各平台的行打上所属平台标记（_p 平台对象 / _pid 平台 ID），并合并为一张表 */
export const tagRows = (rows, p) => (rows || []).map((r) => ({ ...r, _p: p, _pid: p.id }));

/** items: [{platform, snap}] → 各快照条目合并（带平台标记） */
export function combine(items) {
  const out = { nodes: [], disks: [], vms: [], services: [], steps: [] };
  items.forEach(({ platform, snap }) => {
    if (!snap) return;
    Object.keys(out).forEach((k) => out[k].push(...tagRows(snap[k], platform)));
  });
  return out;
}

const sum = (items, pick) => {
  let s = 0; let any = false;
  items.forEach((it) => { const v = it.snap?.summary ? pick(it.snap.summary) : null; if (v != null) { s += v; any = true; } });
  return any ? s : null;
};
const pct = (u, t) => (u != null && t ? (u / t) * 100 : null);
/** 健康值汇总：任一平台不健康 → 不健康；全部未采集 → null */
const health = (items, pick) => {
  const vs = items.map((it) => (it.snap?.summary ? pick(it.snap.summary) : null)).filter((v) => v != null);
  return vs.length ? (vs.some((v) => v !== 0) ? 1 : 0) : null;
};

/** 汇总所选各平台的 summary：容量 / 使用量求和后重算使用率；云主机状态分布求和；健康取最差；IOPS 求和 */
export function aggregateSummary(items) {
  const ok = items.filter((it) => it.snap?.summary);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0].snap.summary;
  const vt = sum(ok, (s) => s.vcpu.total); const vu = sum(ok, (s) => s.vcpu.usage);
  const mt = sum(ok, (s) => s.memory.total); const mu = sum(ok, (s) => s.memory.usage);
  const st = sum(ok, (s) => s.storage.totalBytes); const su = sum(ok, (s) => s.storage.usedBytes);
  return {
    vcpu: { total: vt, usage: vu, percent: pct(vu, vt) },
    memory: { total: mt, usage: mu, percent: pct(mu, mt) },
    storage: { totalBytes: st, usedBytes: su, usedPercent: pct(su, st) },
    instances: Object.fromEntries(['running', 'error', 'shutdown', 'recycleBin', 'others'].map((k) => [k, sum(ok, (s) => s.instances[k])])),
    controlPlaneHealth: health(ok, (s) => s.controlPlaneHealth),
    storageServiceHealth: health(ok, (s) => s.storageServiceHealth),
    storageHealth: health(ok, (s) => s.storageHealth),
    iopsRead: sum(ok, (s) => s.iopsRead),
    iopsWrite: sum(ok, (s) => s.iopsWrite),
  };
}
