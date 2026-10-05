import React from 'react';
import { PanelRight, X } from 'lucide-react';
import { HEALTH, TYPES } from './topoUtil';

const Row = ({ n, extra }) => (
  <div className="flex items-center gap-2 text-xs py-1 border-t border-line first:border-t-0">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(HEALTH[n.health] || HEALTH.unknown).dot}`} />
    <b className="text-fg truncate min-w-0 flex-1" title={n.name}>{n.name}</b>
    <span className="text-fg-muted shrink-0">{extra}</span>
  </div>
);

/** 选中虚拟机的摘要：规格 / 状态原因 / 云硬盘 / 网卡；完整信息在详情抽屉 */
export default function SidePanel({ m, vmId, onDetail, onClear }) {
  const v = m.byId.get(vmId);
  if (!v) return null;
  const h = HEALTH[v.health] || HEALTH.unknown;
  const host = m.byId.get(m.hostOfVm.get(vmId));
  const vols = (m.volsOfVm.get(vmId) || []).map((i) => m.byId.get(i)).filter(Boolean);
  const ports = (m.portsOfVm.get(vmId) || []).map((i) => m.byId.get(i)).filter(Boolean);
  return (
    <section className="card p-3" id="topo-selected" aria-label="选中对象">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${h.dot}`} /><h3 className="text-sm font-semibold text-fg truncate flex-1" title={v.name}>{v.name}</h3><span className={h.tag}>{h.label}</span>
        <button type="button" className="btn-icon !w-6 !h-6" aria-label="取消选择" onClick={onClear}><X size={14} /></button>
      </div>
      <dl className="grid text-xs gap-y-0.5" style={{ gridTemplateColumns: '64px 1fr' }}>
        <dt className="text-fg-muted">{TYPES.host.label}</dt><dd className="text-fg">{host?.name || '—'}</dd>
        <dt className="text-fg-muted">地址 / 规格</dt><dd className="text-fg break-all">{v.sub || '—'}</dd>
        <dt className="text-fg-muted">CPU</dt><dd className="text-fg tabular-nums">{v.cpu != null ? `${v.cpu.toFixed(1)}%` : '—'}</dd>
        <dt className="text-fg-muted">内存</dt><dd className="text-fg tabular-nums">{v.mem != null ? `${v.mem.toFixed(1)}%` : '—'}</dd>
        {v.reasons.length > 0 && <><dt className="text-fg-muted">原因</dt><dd className={h.text}>{v.reasons.join('；')}</dd></>}
      </dl>
      <div className="text-xs font-medium text-fg-muted mt-3 mb-1">云硬盘（{vols.length}）</div>
      {vols.slice(0, 6).map((n) => <Row key={n.id} n={n} extra={n.sub} />)}{!vols.length && <div className="text-xs text-fg-subtle">无</div>}
      <div className="text-xs font-medium text-fg-muted mt-3 mb-1">虚拟网卡（{ports.length}）</div>
      {ports.slice(0, 6).map((n) => <Row key={n.id} n={n} extra={n.sub} />)}{!ports.length && <div className="text-xs text-fg-subtle">无</div>}
      <button type="button" className="btn-default btn-sm w-full mt-3" onClick={onDetail}><PanelRight size={14} />查看完整详情 / 资产</button>
    </section>
  );
}
