import React from 'react';

/**
 * CapacityBar —— 容量条：总量 / 已用 / 可用 + 百分比 + 阈值配色（正常 / 预警 / 危险）
 * 属性：used / total / format(n => string) / warn(默认 70) / danger(默认 85) / label / compact
 */
export default function CapacityBar({ used = 0, total = 0, format = (n) => n, warn = 70, danger = 85, label, compact }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct >= danger ? 'bg-danger' : pct >= warn ? 'bg-warning' : 'bg-success';
  const txt = pct >= danger ? 'text-danger' : pct >= warn ? 'text-warning' : 'text-fg';
  return (
    <div className="min-w-[120px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label || '容量使用率'}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        {label && <span className="text-xs text-fg-muted">{label}</span>}
        <span className={`text-sm font-semibold tabular-nums ${txt}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <div className="flex justify-between mt-1 text-[11px] text-fg-muted tabular-nums">
          <span>已用 {format(used)}</span>
          <span>可用 {format(Math.max(0, total - used))}</span>
          <span>总量 {format(total)}</span>
        </div>
      )}
    </div>
  );
}
