import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HEALTH } from './topoUtil';
import { CELL, STRIPE } from './StatusUi';

const PAGE = 60; // 宿主机很多时分批渲染

function Tile({ h, fs, q, selected, onDrill, onPickVm }) {
  const w = h.health; const label = (x) => HEALTH[x]?.label;
  const tags = [];
  if (h.phys && (h.phys.health === 'danger' || h.phys.health === 'warning')) tags.push([h.phys.health, `物理${label(h.phys.health)}`, h.phys.reasons[0]]);
  if (h.host.health === 'danger' || h.host.health === 'warning') tags.push([h.host.health, `计算${label(h.host.health)}`, h.host.reasons[0]]);
  if (h.c.danger) tags.push(['danger', `${h.c.danger} 台虚拟机异常`]);
  if (h.c.warning) tags.push(['warning', `${h.c.warning} 台虚拟机警示`]);
  if (h.c.off) tags.push(['off', `${h.c.off} 台停止`]);
  const dim = fs && !h.vms.some((v) => fs.has(v.id));
  const ql = q.toLowerCase();
  return (
    <div data-tile={h.id} className={`rounded-lg border border-l-4 bg-card px-2.5 py-2 transition hover:shadow-md ${STRIPE[w] || STRIPE.ok} ${selected === h.id ? 'border-fg' : 'border-line'} ${dim ? 'opacity-35' : ''}`}>
      <button type="button" className="w-full text-left" onClick={() => onDrill(h.id)} title="下钻到该宿主机">
        <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH[w]?.dot}`} /><b className="text-[13px] text-fg truncate">{h.host.name}</b><span className="ml-auto text-[11px] text-fg-subtle shrink-0">{h.vms.length} 台虚拟机</span></div>
        <div className="text-[11px] text-fg-muted mt-0.5 mb-1.5 truncate">物理 {h.phys?.name || '—'} · CPU {h.host.cpu != null ? `${h.host.cpu.toFixed(0)}%` : '—'} · 内存 {h.host.mem != null ? `${h.host.mem.toFixed(0)}%` : '—'}</div>
      </button>
      <div className="flex flex-wrap gap-[3px]">
        {h.vms.map((v) => {
          const hit = ql && `${v.name} ${v.sub}`.toLowerCase().includes(ql);
          return (
            <button key={v.id} type="button" data-nid={v.id} onClick={() => onPickVm(v.id)} aria-label={`${v.name}，${HEALTH[v.health]?.label}`}
              title={`${v.name}\n${(v.sub || '').split(' · ')[0]}\n${HEALTH[v.health]?.label}`}
              className={`w-[15px] h-[15px] rounded-[3px] hover:outline hover:outline-2 hover:outline-fg ${CELL[v.health] || CELL.ok} ${fs && !fs.has(v.id) ? 'opacity-20' : ''} ${hit ? 'outline outline-2 outline-primary outline-offset-1' : ''}`} />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5 min-h-[18px]">
        {tags.length ? tags.map(([hl, t, title]) => <span key={t} title={title} className={`text-[11px] leading-[17px] px-1.5 rounded ${hl === 'danger' ? 'bg-danger-soft text-danger' : hl === 'warning' ? 'bg-warning-soft text-warning' : 'bg-muted text-fg-muted'}`}>{t}</span>) : <span className="text-[11px] leading-[17px] px-1.5 rounded bg-success-soft text-success">全部正常</span>}
      </div>
    </div>
  );
}

/** 宿主机热力块：物理 → 计算 → 虚拟机 嵌套；每个小方块 = 1 台虚拟机，异常优先排序 */
export default function HostTiles({ hosts, total, fs, q, selected, onDrill, onPickVm }) {
  const [n, setN] = useState(PAGE);
  const shown = hosts.slice(0, n);
  return (
    <section className="card px-4 py-3" id="topo-hosts" aria-label="宿主机">
      <h3 className="text-xs font-semibold text-fg-muted mb-2.5">宿主机（物理 → 计算 → 虚拟机 嵌套）<span className="font-normal text-fg-subtle ml-2">显示 {shown.length}/{total} · 异常优先 · 每个小方块 = 1 台虚拟机</span></h3>
      {hosts.length ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))' }}>
          {shown.map((h) => <Tile key={h.id} h={h} fs={fs} q={q} selected={selected} onDrill={onDrill} onPickVm={onPickVm} />)}
        </div>
      ) : <div className="py-10 text-center text-sm text-fg-muted">没有符合条件的宿主机</div>}
      {hosts.length > n && <div className="mt-3 text-center"><button type="button" className="btn-default btn-sm" onClick={() => setN(n + PAGE)}><ChevronDown size={14} />再显示 {Math.min(PAGE, hosts.length - n)} 台宿主机</button></div>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-fg-muted">
        {[['danger', '异常'], ['warning', '警示'], ['off', '已停止'], ['ok', '正常（刻意降饱和）']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3.5 h-3.5 rounded-[3px] ${CELL[k]}`} />{l}</span>)}
        <span className="text-fg-subtle">点击卡片下钻 · 点击方块直达虚拟机</span>
      </div>
    </section>
  );
}
