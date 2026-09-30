import React from 'react';

/** Recharts 通用 Tooltip：配色读主题变量，暗色下同步 */
export default function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 shadow-md text-xs min-w-[140px]">
      <div className="text-fg-muted mb-1.5">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-fg"><span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />{p.name}</span>
          <span className="font-medium text-fg tabular-nums">{valueFormatter(p.value, p.dataKey)}</span>
        </div>
      ))}
    </div>
  );
}
