import React from 'react';
import DatePicker from '../DatePicker';

/** DateRange —— 起止日期（yyyy-mm-dd，自绘 DatePicker），用于使用率分布图。属性：from / to / onChange({from,to}) / max */
export default function DateRange({ from, to, onChange, max }) {
  const bad = from && to && from > to;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-fg-muted" role="group" aria-label="日期范围">
      <DatePicker aria-label="开始日期" width={136} value={from} max={to || max} onChange={(v) => onChange({ from: v, to })} />
      <span>至</span>
      <DatePicker aria-label="结束日期" width={136} value={to} min={from} max={max} onChange={(v) => onChange({ from, to: v })} />
      {bad && <span className="text-danger">开始日期不能晚于结束日期</span>}
    </div>
  );
}
