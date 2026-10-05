import React from 'react';

/** 状态堆叠条：异常 / 告警 / 已停止 / 正常，按数量占比 */
export function StateBar({ s }) {
  const t = s.total || 1;
  const seg = [['bg-danger', s.danger], ['bg-warning', s.warning], ['bg-fg-subtle/50', s.off], ['bg-success', s.ok]];
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted" role="img" aria-label={`异常 ${s.danger}，告警 ${s.warning}，已停止 ${s.off}，正常 ${s.ok}`}>
      {seg.map(([c, n]) => (n ? <span key={c} className={`block h-full ${c}`} style={{ width: `${(n / t) * 100}%` }} /> : null))}
    </div>
  );
}

/** 状态文字：每个数字都带圆点 + 标签，避免「总数 + 异常数」连读 */
export function StateLine({ s, okText = '全部正常', className = '' }) {
  const items = [];
  if (s.danger) items.push(['text-danger', 'bg-danger', `异常 ${s.danger}`]);
  if (s.warning) items.push(['text-warning', 'bg-warning', `告警 ${s.warning}`]);
  if (s.off) items.push(['text-fg-muted', 'bg-fg-subtle', `停止 ${s.off}`]);
  if (!items.length) items.push(['text-success', 'bg-success', okText]);
  return (
    <div className={`flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs whitespace-nowrap ${className}`}>
      {items.map(([tx, dot, label]) => <span key={label} className={`inline-flex items-center gap-1 ${tx}`}><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}</span>)}
    </div>
  );
}

/** KPI 卡：类型 + 总数（带单位）+ 堆叠条 + 状态文字 */
export function KpiCard({ icon: Icon, label, s, unit = '个' }) {
  return (
    <div className="card px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">{Icon && <Icon size={13} />}{label}</div>
      <div className="text-2xl font-semibold text-fg tabular-nums leading-tight mt-0.5">{s.total}<span className="text-xs font-normal text-fg-subtle ml-1">{unit}</span></div>
      <div className="my-1.5"><StateBar s={s} /></div>
      <StateLine s={s} />
    </div>
  );
}

/** 方块颜色：正常刻意降饱和，异常 / 告警保持满色，让问题一眼可见 */
export const CELL = { ok: 'bg-success/30', off: 'bg-fg-subtle/40', warning: 'bg-warning', danger: 'bg-danger', unknown: 'bg-fg-subtle/20' };
export const STRIPE = { danger: 'border-l-danger', warning: 'border-l-warning', ok: 'border-l-success', off: 'border-l-line-strong', unknown: 'border-l-line-strong' };

/** 分段按钮（筛选用） */
export function Seg({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line-strong overflow-hidden bg-card">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`h-8 px-3 text-[13px] border-l border-line first:border-l-0 transition ${value === o.value ? 'bg-primary text-primary-on' : 'text-fg-muted hover:bg-hover'}`}>{o.label}</button>
      ))}
    </div>
  );
}
