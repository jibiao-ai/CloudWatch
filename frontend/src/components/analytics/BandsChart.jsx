import React from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../ChartTooltip';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import { useChartPalette } from '../../hooks/useChartPalette';
import { formatDateTime, pad } from '../../utils/format';

/** BandsChart —— 按使用率分布：5 个区间（0-20% … 80-100%）各一条折线，纵轴 = 该时刻落入该区间的对象数量 */
export default function BandsChart({ data, loading, height = 240, emptyDesc }) {
  const pal = useChartPalette();
  if (loading) return <div style={{ height }}><Skeleton.Chart /></div>;
  const names = data?.names || [];
  const rows = (data?.points || []).map((p) => ({ t: p.t, ...Object.fromEntries(names.map((n, i) => [`b${i}`, p.bands[i]])) }));
  if (!rows.length) return <div style={{ height }}><EmptyState compact title="暂无数据" description={emptyDesc || '所选时间范围内没有采样数据；采集会按平台同步间隔持续积累'} /></div>;
  // 由低到高依次：绿 → 青 → 蓝 → 黄 → 红（语义色全部取自主题色板）
  const colors = [pal.ok, pal.series[1], pal.series[4], pal.warn, pal.bad];
  const span = rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 0;
  const tick = (t) => { const d = new Date(t); return span > 2 * 86400e3 ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} minTickGap={60} />
          <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} domain={[0, 'auto']} />
          <RTooltip cursor={{ stroke: pal.axis, strokeDasharray: '4 4' }} content={<ChartTooltip labelFormatter={(t) => formatDateTime(t, false)} valueFormatter={(v) => `${v} 个`} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {names.map((n, i) => <Line key={n} type="monotone" dataKey={`b${i}`} name={n} stroke={colors[i]} strokeWidth={2} dot={rows.length < 4 ? { r: 3 } : false} isAnimationActive={false} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
