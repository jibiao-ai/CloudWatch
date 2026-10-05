import React, { useState } from 'react';
import { Database, Network } from 'lucide-react';
import { pctTone, HEALTH } from './topoUtil';

/** 汇聚带：存储池（3 类枢纽）/ 网络（21 个枢纽）——点击后反向高亮受影响的虚拟机，而不是拉出成百上千条连线 */
export default function HubBand({ m, focus, mustShow, onFocus }) {
  const [all, setAll] = useState(false);
  const nets = all ? m.nets : m.nets.filter((n, i) => i < 8 || (mustShow && mustShow.has(n.id)));
  return (
    <section className="card px-4 py-3 mb-4" id="topo-hub" aria-label="存储池与网络">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-fg-muted mb-2 flex items-center gap-1.5"><Database size={13} />集群存储<span className="font-normal text-fg-subtle">点击 → 高亮使用它的虚拟机</span></h3>
          <div className="flex flex-wrap gap-2">
            {m.pools.map((p) => {
              const on = focus?.id === p.id; const pc = p.mem ?? 0;
              return (
                <button key={p.id} type="button" data-nid={p.id} aria-pressed={on} onClick={() => onFocus('pool', p.id)}
                  className={`w-[220px] text-left rounded-md border px-2.5 py-1.5 transition hover:border-line-strong ${on ? 'border-primary ring-2 ring-primary/15' : 'border-line'}`}>
                  <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-fg">
                    <span className="inline-flex items-center gap-1.5 min-w-0"><span className={`w-2 h-2 rounded-full shrink-0 ${(HEALTH[p.health] || HEALTH.unknown).dot}`} /><span className="truncate">{p.name}</span></span>
                    <span className={`tabular-nums text-xs ${pc >= 85 ? 'text-danger' : pc >= 70 ? 'text-warning' : 'text-fg-muted'}`}>{pc.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden my-1"><div className={`h-full ${pctTone(pc)}`} style={{ width: `${Math.min(100, pc)}%` }} /></div>
                  <div className="text-[11px] text-fg-muted truncate">{p.sub} · {m.poolVols.get(p.id) || 0} 块盘</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-[260px] flex-1">
          <h3 className="text-xs font-semibold text-fg-muted mb-2 flex items-center gap-1.5"><Network size={13} />网络<span className="font-normal text-fg-subtle">共 {m.nets.length} 个 · 按网卡数排序 · 点击高亮</span></h3>
          <div className="flex flex-wrap gap-1.5">
            {nets.map((n) => (
              <button key={n.id} type="button" data-nid={n.id} aria-pressed={focus?.id === n.id} onClick={() => onFocus('net', n.id)} title={n.name}
                className={`max-w-[230px] h-7 px-2 rounded-md border text-xs inline-flex items-center gap-1.5 transition ${focus?.id === n.id ? 'border-primary bg-primary-soft text-primary-text' : 'border-line text-fg hover:border-line-strong'}`}>
                <span className="truncate">{n.name}</span><span className="text-fg-subtle tabular-nums">{m.netPorts.get(n.id) || 0}</span>
              </button>
            ))}
            {m.nets.length > 8 && <button type="button" className="h-7 px-2 rounded-md border border-dashed border-line-strong text-xs text-fg-muted hover:bg-hover" onClick={() => setAll((v) => !v)}>{all ? '收起' : `+${m.nets.length - 8} 更多`}</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
