import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../ChartTooltip';
import EmptyState from '../EmptyState';
import { useChartPalette } from '../../hooks/useChartPalette';

/** HostVmChart —— 宿主机上云主机分布：每台宿主机一根柱，运行中 / 已停止堆叠。data[{host,running,stopped}] */
export default function HostVmChart({ data = [], height = 240 }) {
  const pal = useChartPalette();
  if (!data.length) return <div style={{ height }}><EmptyState compact title="暂无数据" /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="host" stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} interval={0} tickFormatter={(v) => String(v).split('.')[0]} />
          <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <RTooltip cursor={{ fill: pal.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => `${v} 台`} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="running" name="运行中" stackId="a" fill={pal.ok} maxBarSize={36} isAnimationActive={false} />
          <Bar dataKey="stopped" name="已停止" stackId="a" fill={pal.series[4]} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
