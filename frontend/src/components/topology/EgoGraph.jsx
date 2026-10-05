import React from 'react';
import { HEALTH } from './topoUtil';

const MAX = 7; const BW = 164; const RH = 42; const W = 920;
const XS = [0, 189, 378, 567, 756];
const sev = (h) => (h === 'danger' ? 3 : h === 'warning' ? 2 : 0);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const SK = { 3: 'stroke-danger fill-danger-soft', 2: 'stroke-warning fill-warning-soft', 0: 'stroke-line-strong fill-card' };

function Node({ x, y, title, sub, s, me }) {
  return (
    <g>
      <rect x={x} y={y - 16} width={BW} height={32} rx={5} className={`${SK[s]} ${me ? '!stroke-fg' : ''}`} strokeWidth={me ? 2 : 1} />
      <text x={x + 8} y={y - 2} className="fill-fg" style={{ fontSize: 11.5 }}>{cut(title, 20)}</text>
      <text x={x + 8} y={y + 11} className="fill-fg-subtle" style={{ fontSize: 10 }}>{cut(sub, 27)}</text>
    </g>
  );
}
const Link = ({ x1, y1, x2, y2, bad }) => (
  <path d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`} fill="none" className={bad ? 'stroke-danger' : 'stroke-fg-subtle'} strokeWidth={1.3} />
);

/** 右列（存储池 / 网络）按平均 y 排列，并保证节点最小间距，避免重叠 */
function lane(groups, startY) {
  let last = startY - RH;
  return groups.sort((a, b) => a.y - b.y).map((g) => { const y = Math.max(g.y, last + RH); last = y; return { ...g, y }; });
}

/** 选中虚拟机后按需绘制的 1 跳关系图：物理 → 计算 → 虚拟机 → 云硬盘 / 网卡 → 存储池 / 网络（线数 ≤ ~25） */
export default function EgoGraph({ m, vmId }) {
  const vm = m.byId.get(vmId);
  if (!vm) return null;
  const host = m.byId.get(m.hostOfVm.get(vmId));
  const phys = host ? m.hostById.get(host.id)?.phys : null;
  const vols = (m.volsOfVm.get(vmId) || []).map((i) => m.byId.get(i)).filter(Boolean);
  const ports = (m.portsOfVm.get(vmId) || []).map((i) => m.byId.get(i)).filter(Boolean);
  const att = [...vols.slice(0, MAX).map((n) => ({ n, k: '盘' })), ...ports.slice(0, MAX).map((n) => ({ n, k: '卡' }))];
  const more = [vols.length > MAX ? `云硬盘 +${vols.length - MAX}` : '', ports.length > MAX ? `网卡 +${ports.length - MAX}` : ''].filter(Boolean).join(' ');
  const rows = Math.max(att.length, 1);
  const H = rows * RH + 24; const mid = H / 2 + 6;
  const ay = (i) => 24 + i * RH + RH / 2 - 4;
  const pools = new Map(); const nets = new Map();
  att.forEach((a, i) => {
    const tgt = a.k === '盘' ? m.poolOfVol.get(a.n.id) : m.netOfPort.get(a.n.id);
    if (!tgt) return;
    const mp = a.k === '盘' ? pools : nets;
    if (!mp.has(tgt)) mp.set(tgt, []);
    mp.get(tgt).push(ay(i));
  });
  const avg = (ys) => ys.reduce((a, b) => a + b, 0) / ys.length;
  const right = lane([
    ...[...pools].map(([id, ys]) => ({ id, ys, y: avg(ys), kind: 'pool' })),
    ...[...nets].map(([id, ys]) => ({ id, ys, y: avg(ys), kind: 'net' })),
  ], 24 + RH / 2 - 4);
  const Hh = Math.max(H, (right.length ? right[right.length - 1].y + 24 : 0)) + (more ? 18 : 0);
  const cols = ['物理节点', '计算节点', '虚拟机', '挂载资源', '后端（存储池 / 网络）'];
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto block" role="img" aria-label={`${vm.name} 的 1 跳关系图`}>
      {cols.map((t, i) => <text key={t} x={XS[i]} y={12} className="fill-fg-subtle" style={{ fontSize: 11 }}>{t}</text>)}
      <Link x1={XS[0] + BW} y1={mid} x2={XS[1]} y2={mid} bad={false} />
      <Link x1={XS[1] + BW} y1={mid} x2={XS[2]} y2={mid} bad={false} />
      {att.map((a, i) => <Link key={a.n.id} x1={XS[2] + BW} y1={mid} x2={XS[3]} y2={ay(i)} bad={a.n.health === 'danger'} />)}
      {right.map((r) => r.ys.map((y0, i) => <Link key={`${r.id}${i}`} x1={XS[3] + BW} y1={y0} x2={XS[4]} y2={r.y} bad={r.kind === 'pool' && m.byId.get(r.id)?.health === 'danger'} />))}
      <Node x={XS[0]} y={mid} title={phys?.name || '—'} sub="物理节点" s={sev(phys?.health)} />
      <Node x={XS[1]} y={mid} title={host?.name || '—'} sub="计算节点" s={sev(host?.health)} />
      <Node x={XS[2]} y={mid} title={vm.name} sub={`虚拟机 · ${HEALTH[vm.health]?.label}`} s={sev(vm.health)} me />
      {att.map((a, i) => <Node key={a.n.id} x={XS[3]} y={ay(i)} title={`${a.k} ${a.n.name}`} sub={a.n.sub || ''} s={sev(a.n.health)} />)}
      {right.map((r) => { const n = m.byId.get(r.id); return <Node key={r.id} x={XS[4]} y={r.y} title={n?.name || ''} sub={r.kind === 'pool' ? `集群存储 · ${(n?.mem ?? 0).toFixed(0)}%` : '网络'} s={sev(n?.health)} />; })}
      {more && <text x={XS[3]} y={Hh - 4} className="fill-fg-subtle" style={{ fontSize: 11 }}>… {more}（见右侧详情）</text>}
    </svg>
  );
}
