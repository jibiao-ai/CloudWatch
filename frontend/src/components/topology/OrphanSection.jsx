import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, HardDriveDownload, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HEALTH } from './topoUtil';

const days = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000); };
const gbText = (v) => (v >= 1024 ? `${(v / 1024).toFixed(1)} TB` : `${Math.round(v)} GB`);
const STEP = 24;

/** 未挂载云硬盘：不属于任何虚拟机，单独归档（治理入口）——默认折叠，按闲置时长倒序，分批加载 */
export default function OrphanSection({ orphans, summary, providerId }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(STEP);
  const [only, setOnly] = useState('all');
  const rows = useMemo(() => orphans.map((v) => ({ v, d: days(v.createdAt) }))
    .filter((r) => only === 'all' || (only === '30' ? (r.d ?? 0) > 30 : only === '90' ? (r.d ?? 0) > 90 : r.v.health === 'danger' || r.v.health === 'warning'))
    .sort((a, b) => (b.d ?? -1) - (a.d ?? -1)), [orphans, only]);
  if (!orphans.length) return null;
  const chip = (k, label, c) => (
    <button key={k} type="button" aria-pressed={only === k} onClick={() => { setOnly(k); setN(STEP); setOpen(true); }}
      className={`h-7 px-2.5 rounded-md border text-xs inline-flex items-center gap-1.5 ${only === k ? 'border-primary bg-primary-soft text-primary-text' : 'border-line text-fg hover:bg-hover'}`}>{label}<b className="tabular-nums">{c}</b></button>
  );
  return (
    <section className="card px-4 py-3 mt-4" id="topo-orphans" aria-label="未挂载云硬盘">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<HardDriveDownload size={15} />未挂载云硬盘<span className="tabular-nums text-fg-muted font-normal">{summary.count} 块 · {gbText(summary.sizeGb)}</span>
        </button>
        <span className="text-xs text-fg-subtle">不属于任何虚拟机，单独归档，避免污染主拓扑；闲置资源建议复核后清理</span>
        <Link to={`/capacity?tab=volumes&providerId=${encodeURIComponent(providerId)}`} className="btn-default btn-sm ml-auto"><ExternalLink size={13} />到配置中心处理</Link>
      </div>
      <div className="flex flex-wrap gap-2 mt-2.5">
        {chip('all', '全部', summary.count)}{chip('30', '闲置 > 30 天', summary.idle30)}{chip('90', '闲置 > 90 天', summary.idle90)}{chip('bad', '状态异常 / 告警', summary.danger + summary.warning)}
      </div>
      {open && (
        <div className="mt-3">
          <div className="grid text-xs text-fg-muted px-1 pb-1.5 border-b border-line" style={{ gridTemplateColumns: '14px minmax(0,1.4fr) 90px minmax(0,1fr) 110px' }}><span /><span>名称</span><span>容量</span><span>存储后端</span><span className="text-right">闲置</span></div>
          {rows.slice(0, n).map(({ v, d }) => (
            <div key={v.id} className="grid items-center gap-x-2 px-1 py-1.5 text-[13px] border-b border-line last:border-b-0" style={{ gridTemplateColumns: '14px minmax(0,1.4fr) 90px minmax(0,1fr) 110px' }}>
              <span className={`w-2 h-2 rounded-full ${(HEALTH[v.health] || HEALTH.unknown).dot}`} title={(HEALTH[v.health] || HEALTH.unknown).label} />
              <span className="truncate text-fg" title={v.name}>{v.name}</span>
              <span className="tabular-nums text-fg-muted">{v.sizeGb != null ? gbText(v.sizeGb) : '—'}</span>
              <span className="truncate text-fg-muted" title={(v.attrs.find((a) => a[0] === '存储后端') || [])[1]}>{(v.attrs.find((a) => a[0] === '存储后端') || [])[1] || '—'}</span>
              <span className={`text-right tabular-nums ${(d ?? 0) > 90 ? 'text-danger' : (d ?? 0) > 30 ? 'text-warning' : 'text-fg-muted'}`}>{d == null ? '—' : `${d} 天`}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 mt-2 text-xs text-fg-muted">已显示 {Math.min(n, rows.length)}/{rows.length}
            {rows.length > n && <button type="button" className="btn-default btn-sm" onClick={() => setN(n + STEP)}>再加载 {STEP} 条</button>}</div>
        </div>
      )}
    </section>
  );
}
