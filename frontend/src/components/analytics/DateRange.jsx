import React from 'react';
import { CalendarRange } from 'lucide-react';

/** DateRange —— 起止日期（yyyy-mm-dd），用于使用率分布图。属性：from / to / onChange({from,to}) / max */
export default function DateRange({ from, to, onChange, max }) {
  const bad = from && to && from > to;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-fg-muted" role="group" aria-label="日期范围">
      <CalendarRange size={14} />
      <input type="date" className="field !h-7 !w-[132px] !text-xs" aria-label="开始日期" value={from} max={to || max} onChange={(e) => onChange({ from: e.target.value, to })} />
      <span>至</span>
      <input type="date" className="field !h-7 !w-[132px] !text-xs" aria-label="结束日期" value={to} min={from} max={max} onChange={(e) => onChange({ from, to: e.target.value })} />
      {bad && <span className="text-danger">开始日期不能晚于结束日期</span>}
    </div>
  );
}
