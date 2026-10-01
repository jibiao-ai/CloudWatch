import React, { useId } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../ChartTooltip';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import { useChartPalette } from '../../hooks/useChartPalette';
import { formatDateTime, pad } from '../../utils/format';

const axisTime = (spanMs) => (t) => {
  const d = new Date(t);
  return spanMs > 2 * 86400e3 ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * SeriesChart —— 通用时序面积图（纯展示）
 * 属性：title / data[{t, <key>: number}] / series[{key,name}] / unit / format(v) / domain / loading / error / emptyTitle / emptyDesc / height / seriesOffset
 */
export default function SeriesChart({ title, data, series, unit = '', format, domain, loading, error, emptyTitle = '历史数据积累中', emptyDesc, height = 200, seriesOffset = 0, minPoints = 2 }) {
  const pal = useChartPalette();
  const uid = useId().replace(/[^\w]/g, '');
  const span = data.length > 1 ? data[data.length - 1].t - data[0].t : 0;
  const fmt = format || ((v) => `${v}${unit}`);
  return (
    <div className="card p-4">
      <div className="text-sm font-medium text-fg mb-3">{title}</div>
      <div style={{ height }}>
        {loading ? <Skeleton.Chart /> : error ? <EmptyState compact title="加载失败" description={error.message} />
          : data.length < minPoints ? <EmptyState compact title={emptyTitle} description={emptyDesc || '后台按平台同步间隔周期采集，至少 2 个采样点后显示趋势；也可点击「立即采集」'} /> : (
            <ResponsiveContainer>
              <AreaChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  {series.map((s, i) => {
                    const c = pal.series[(i + seriesOffset) % pal.series.length];
                    return (
                      <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={axisTime(span)} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} minTickGap={40} />
                <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={domain || ['auto', 'auto']} width={56} tickFormatter={format ? (v) => format(v) : undefined} />
                <RTooltip cursor={{ stroke: pal.axis, strokeDasharray: '4 4' }} content={<ChartTooltip labelFormatter={(t) => formatDateTime(t)} valueFormatter={fmt} />} />
                {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
                {series.map((s, i) => {
                  const c = pal.series[(i + seriesOffset) % pal.series.length];
                  return <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={c} strokeWidth={2} fill={`url(#${uid}-${s.key})`} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />;
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
      </div>
    </div>
  );
}
