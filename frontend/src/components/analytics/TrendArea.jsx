import React, { useId, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../ChartTooltip';
import EmptyState from '../EmptyState';
import { useChartPalette } from '../../hooks/useChartPalette';
import { formatDateTime, pad } from '../../utils/format';

/**
 * TrendArea —— 数量趋势（每个所属云平台各一条线）。series: [{providerId,name,points:[{t,v}]}]
 * 不同账号的时间桶对齐，按 t 合并为宽表。
 */
export default function TrendArea({ series = [], unit = '', height = 220, spanMs }) {
  const pal = useChartPalette();
  const uid = useId().replace(/[^\w]/g, '');
  const { rows, keys } = useMemo(() => {
    const m = new Map();
    const ks = series.map((s, i) => ({ key: `s${i}`, name: s.name }));
    series.forEach((s, i) => s.points.forEach((p) => {
      const r = m.get(p.t) || { t: p.t };
      r[`s${i}`] = p.v;
      m.set(p.t, r);
    }));
    return { rows: [...m.values()].sort((a, b) => a.t - b.t), keys: ks };
  }, [series]);
  if (!rows.length) return <div style={{ height }}><EmptyState compact title="历史数据积累中" description="数量快照约每 30 分钟记录一次，积累后显示趋势" /></div>;
  const span = spanMs ?? (rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 0);
  const tick = (t) => { const d = new Date(t); return span > 2 * 86400e3 ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <defs>
            {keys.map((k, i) => (
              <linearGradient key={k.key} id={`${uid}-${k.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pal.series[i % pal.series.length]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={pal.series[i % pal.series.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} minTickGap={50} />
          <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={48} domain={[0, 'auto']} />
          <RTooltip cursor={{ stroke: pal.axis, strokeDasharray: '4 4' }} content={<ChartTooltip labelFormatter={(t) => formatDateTime(t, false)} valueFormatter={(v) => `${v}${unit}`} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k, i) => {
            const c = pal.series[i % pal.series.length];
            return <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={c} strokeWidth={2} fill={`url(#${uid}-${k.key})`} dot={rows.length < 4 ? { r: 3 } : false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />;
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
