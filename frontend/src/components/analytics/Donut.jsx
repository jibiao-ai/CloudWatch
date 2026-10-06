import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useChartPalette } from '../../hooks/useChartPalette';

/**
 * Donut —— 环形分布图：中心显示总数，右侧图例（名称 + 数量）。
 * 属性：data[{label,value}] / format(数值格式化，可选) / unit(总数单位文案，如 "台"、"块") / colors(label→palette 下标，可选) / emptyText
 */
export default function Donut({ data = [], unit = '台', colorOf, emptyText = '暂无数据', format = (v) => v }) {
  const pal = useChartPalette();
  const total = data.reduce((s, d) => s + d.value, 0);
  const color = (d, i) => (colorOf ? colorOf(d, pal) : pal.series[i % pal.series.length]);
  return (
    <div className="flex items-center gap-4 h-[170px]">
      <div className="relative w-[150px] h-[150px] shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={total ? data : [{ label: '-', value: 1 }]} dataKey="value" nameKey="label" innerRadius={52} outerRadius={70} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {(total ? data : [{ label: '-', value: 1 }]).map((d, i) => <Cell key={d.label} fill={total ? color(d, i) : pal.grid} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] text-fg-muted">总数（{unit}）</span>
          <span className="text-xl font-semibold text-fg tabular-nums leading-tight">{format(total)}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
        {total === 0 && <li className="text-xs text-fg-subtle">{emptyText}</li>}
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-[13px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color(d, i) }} />
            <span className="truncate text-fg-muted flex-1" title={d.label}>{d.label}</span>
            <span className="tabular-nums text-fg">{format(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
