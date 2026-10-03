import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import Tabs from '../Tabs';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import EmptyState from '../EmptyState';
import ChartTooltip from '../ChartTooltip';
import { useChartPalette } from '../../hooks/useChartPalette';
import { formatDateTime, pad } from '../../utils/format';
import { DASH_CARD_H } from './TopLoad';

export const TREND_RANGES = [{ key: '6h', label: '6 小时' }, { key: '24h', label: '24 小时' }, { key: '7d', label: '7 天' }, { key: '30d', label: '30 天' }];
const SERIES = [{ key: 'cpu', name: 'vCPU 使用率', idx: 0 }, { key: 'mem', name: '内存使用率', idx: 1 }, { key: 'storage', name: '存储使用率', idx: 2 }];

const axisFmt = (range) => (t) => {
  const d = new Date(t);
  return range === '7d' || range === '30d' ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** TrendCard —— 全平台（或单平台）vCPU / 内存 / 存储使用率趋势；数据来自监控采集落库的历史样本 */
export default function TrendCard({ state, range, onRange }) {
  const pal = useChartPalette();
  const [only, setOnly] = useState('all');
  const points = state.data?.points || [];
  const shown = useMemo(() => SERIES.filter((s) => only === 'all' || only === s.key), [only]);
  return (
    <section className={`card p-4 flex flex-col ${DASH_CARD_H}`} aria-label="使用率趋势">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h2 className="text-sm font-medium text-fg">资源使用率趋势</h2>
          <p className="text-xs text-fg-muted mt-0.5">按监控采集的实际使用率，多平台取平均</p>
        </div>
        <Tabs value={range} onChange={onRange} items={TREND_RANGES} className="!border-b-0" />
      </div>
      <div className="flex gap-1.5 mb-2" role="group" aria-label="指标筛选">
        {[{ key: 'all', name: '全部' }, ...SERIES].map((s) => (
          <button key={s.key} type="button" aria-pressed={only === s.key} onClick={() => setOnly(s.key)}
            className={`h-7 px-2.5 rounded-md text-xs transition ${only === s.key ? 'bg-primary-soft text-primary-text font-medium' : 'bg-muted text-fg-muted hover:bg-hover'}`}>{s.name}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {state.loading ? <Skeleton.Chart /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : !points.length ? <EmptyState compact title="暂无趋势数据" description="监控采集落库后将展示历史曲线" /> : (
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`dg-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={pal.series[s.idx]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={pal.series[s.idx]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" tickFormatter={axisFmt(range)} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} minTickGap={36} />
              <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
              <RTooltip cursor={{ stroke: pal.axis, strokeDasharray: '4 4' }} content={<ChartTooltip labelFormatter={(t) => formatDateTime(t, false)} valueFormatter={(v) => `${v}%`} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: pal.axis }} />
              {shown.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={pal.series[s.idx]} strokeWidth={2} fill={`url(#dg-${s.key})`} dot={false} activeDot={{ r: 4 }} connectNulls />)}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
