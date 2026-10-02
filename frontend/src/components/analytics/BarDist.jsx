import React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../ChartTooltip';
import EmptyState from '../EmptyState';
import { useChartPalette } from '../../hooks/useChartPalette';

/** BarDist —— 单系列柱状分布图（宿主机上云主机分布等）。data[{label,value}] / unit / height */
export default function BarDist({ data = [], unit = '台', height = 220, name = '数量' }) {
  const pal = useChartPalette();
  if (!data.length) return <div style={{ height }}><EmptyState compact title="暂无数据" /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} interval={0} tickFormatter={(v) => (String(v).length > 10 ? `${String(v).slice(0, 9)}…` : v)} />
          <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <RTooltip cursor={{ fill: pal.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => `${v} ${unit}`} />} />
          <Bar dataKey="value" name={name} fill={pal.primary} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" fill={pal.text} fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
