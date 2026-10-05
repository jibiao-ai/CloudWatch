import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ENV_TYPES, ENV_TAG } from '../../data/dict';
import { CELL } from './StatusUi';

export const GROUP_AT = 200; // 宿主机总数超过该值：按 环境类型 → 云贯标 分组并可折叠

const hostStat = (hosts) => hosts.reduce((a, h) => {
  a.total += 1;
  if (h.health === 'danger') a.danger += 1; else if (h.health === 'warning') a.warning += 1; else if (h.health === 'off') a.off += 1; else a.ok += 1;
  return a;
}, { total: 0, danger: 0, warning: 0, off: 0, ok: 0 });

function Mini({ s }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
      <span className="text-fg-muted">{s.total} 台宿主机</span>
      {s.danger > 0 && <span className="inline-flex items-center gap-1 text-danger"><span className="w-1.5 h-1.5 rounded-full bg-danger" />异常 {s.danger}</span>}
      {s.warning > 0 && <span className="inline-flex items-center gap-1 text-warning"><span className="w-1.5 h-1.5 rounded-full bg-warning" />告警 {s.warning}</span>}
      {!s.danger && !s.warning && <span className="inline-flex items-center gap-1 text-success"><span className="w-1.5 h-1.5 rounded-full bg-success" />全部正常</span>}
    </span>
  );
}

function Cells({ item, onOpen }) {
  const p = item.platform;
  if (!item.hosts.length) return <span className="text-xs text-fg-subtle">暂无计算节点数据</span>;
  return (
    <div className="flex flex-wrap gap-[3px]">
      {item.hosts.map((h) => (
        <button key={h.nodeId} type="button" data-heat={h.nodeId} onClick={() => onOpen(p.id, h.nodeId)}
          aria-label={`${p.name} ${h.name}`}
          title={`${p.name} / ${h.name}\n虚拟机 ${h.vmTotal} 台${h.vmDanger ? `，异常 ${h.vmDanger}` : ''}${h.vmWarning ? `，告警 ${h.vmWarning}` : ''}${h.vmOff ? `，停止 ${h.vmOff}` : ''}\n点击下钻到该宿主机`}
          className={`w-[18px] h-[18px] rounded-[3px] hover:outline hover:outline-2 hover:outline-fg ${CELL[h.health] || CELL.ok}`} />
      ))}
    </div>
  );
}

function Row({ item, onOpen, showEnv }) {
  const p = item.platform;
  const env = ENV_TYPES.find((e) => e.value === p.envType);
  return (
    <div className="flex items-start gap-3 py-2 border-t border-line first:border-t-0" data-heat-row={p.id}>
      <div className="w-52 shrink-0 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button type="button" className="text-[13px] font-medium text-fg truncate hover:text-primary-text" title={`进入 ${p.name}`} onClick={() => onOpen(p.id)}>{p.name}</button>
          {showEnv && env && <span className={ENV_TAG[p.envType] || 'tag-default'}>{env.label}</span>}
        </div>
        <Mini s={hostStat(item.hosts)} />
      </div>
      <div className="flex-1 min-w-0"><Cells item={item} onOpen={onOpen} /></div>
    </div>
  );
}

function Group({ title, tag, items, onOpen, showEnv }) {
  const [open, setOpen] = useState(true);
  const s = hostStat(items.flatMap((i) => i.hosts));
  return (
    <div className="rounded-lg border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-hover rounded-lg">
        {open ? <ChevronDown size={14} className="text-fg-muted" /> : <ChevronRight size={14} className="text-fg-muted" />}
        <b className="text-[13px] text-fg">{title}</b>{tag}
        <span className="text-xs text-fg-muted">{items.length} 个云贯标</span>
        <span className="ml-auto"><Mini s={s} /></span>
      </button>
      {open && <div className="px-3 pb-1">{items.map((it) => <Row key={it.platform.id} item={it} onOpen={onOpen} showEnv={showEnv} />)}</div>}
    </div>
  );
}

/** 跨平台热力图：每个小方块 = 1 台宿主机；宿主机 > 200 台时按 环境类型 → 云贯标 分组 */
export default function OverviewHeat({ items, onOpen }) {
  const total = items.reduce((a, i) => a + i.hosts.length, 0);
  const grouped = total > GROUP_AT;
  const rank = (it) => -(hostStat(it.hosts).danger * 1000 + hostStat(it.hosts).warning);
  const sorted = [...items].sort((a, b) => rank(a) - rank(b));
  let body;
  if (grouped) {
    const envs = [...ENV_TYPES.map((e) => e.value), ''];
    body = envs.map((ev) => {
      const list = sorted.filter((i) => (i.platform.envType || '') === ev);
      if (!list.length) return null;
      const e = ENV_TYPES.find((x) => x.value === ev);
      return <Group key={ev || 'none'} title={e ? e.label : '未标注环境'} tag={e ? <span className={ENV_TAG[ev] || 'tag-default'}>{ev}</span> : null} items={list} onOpen={onOpen} showEnv={false} />;
    });
  } else {
    body = <div className="rounded-lg border border-line px-3">{sorted.map((it) => <Row key={it.platform.id} item={it} onOpen={onOpen} showEnv />)}</div>;
  }
  return (
    <section className="card px-4 py-3" id="topo-heat" aria-label="跨平台宿主机热力图">
      <h3 className="text-xs font-semibold text-fg-muted mb-2.5">
        跨平台宿主机热力图
        <span className="font-normal text-fg-subtle ml-2">每个小方块 = 1 台宿主机 · {grouped ? `宿主机超过 ${GROUP_AT} 台，已按「环境类型 → 云贯标」分组` : '按云贯标（平台）分行 · 异常优先'}</span>
      </h3>
      <div className="space-y-2">{body}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-fg-muted">
        {[['danger', '异常（含严重告警）'], ['warning', '告警'], ['off', '已停止'], ['ok', '正常']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3.5 h-3.5 rounded-[3px] ${CELL[k]}`} />{l}</span>)}
        <span className="text-fg-subtle">点击方块直达宿主机 · 点击平台名进入平台拓扑</span>
      </div>
    </section>
  );
}
