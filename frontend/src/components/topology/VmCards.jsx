import React from 'react';
import { HEALTH } from './topoUtil';
import { STRIPE } from './StatusUi';
import { pctTone } from './topoUtil';

function Bar({ label, v }) {
  return (
    <div className="grid items-center gap-1.5 text-[11px] text-fg-muted mt-1" style={{ gridTemplateColumns: '28px 1fr 30px' }}>
      <span>{label}</span>
      <span className="h-1 rounded-full bg-muted overflow-hidden">{v != null && <span className={`block h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} />}</span>
      <span className="tabular-nums text-right">{v == null ? '—' : `${v.toFixed(0)}%`}</span>
    </div>
  );
}

/** 宿主机下钻后的虚拟机卡片网格（异常优先） */
export default function VmCards({ vms, m, selected, fs, onPick }) {
  if (!vms.length) return <div className="py-10 text-center text-sm text-fg-muted">没有符合条件的虚拟机</div>;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))' }}>
      {vms.map((v) => {
        const h = HEALTH[v.health] || HEALTH.unknown; const sp = (v.sub || '').split(' · ');
        return (
          <button key={v.id} type="button" data-nid={v.id} onClick={() => onPick(v.id)} aria-pressed={selected === v.id}
            className={`text-left rounded-lg border border-l-4 px-3 py-2 transition hover:shadow-md ${STRIPE[v.health] || STRIPE.ok} ${v.health === 'off' ? 'bg-muted' : 'bg-card'} ${selected === v.id ? 'border-fg ring-2 ring-fg/20' : 'border-line'} ${fs && !fs.has(v.id) ? 'opacity-35' : ''}`}>
            <div className="flex items-center gap-1.5 min-w-0"><span className={`w-2 h-2 rounded-full shrink-0 ${h.dot}`} /><b className="text-[13px] text-fg truncate" title={v.name}>{v.name}</b><span className={`${h.tag} ml-auto shrink-0`}>{h.label}</span></div>
            <div className="text-[11px] text-fg-muted truncate mt-1" title={v.sub}>{sp[0] || '—'}</div>
            <div className="text-[11px] text-fg-subtle truncate">{sp.slice(1).join(' · ') || ' '}</div>
            <Bar label="CPU" v={v.cpu} /><Bar label="内存" v={v.mem} />
            <div className="text-[11px] text-fg-muted mt-1.5">云硬盘 <b className="text-fg">{(m.volsOfVm.get(v.id) || []).length}</b> · 网卡 <b className="text-fg">{(m.portsOfVm.get(v.id) || []).length}</b></div>
          </button>
        );
      })}
    </div>
  );
}
