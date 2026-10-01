import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../ChartTooltip';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import { useAsync } from '../../hooks/useAsync';
import { useChartPalette } from '../../hooks/useChartPalette';
import { monitorApi } from '../../services/api';
import { formatDateTime, pad } from '../../utils/format';

const axisTime = (spanMs) => (t) => {
  const d = new Date(t);
  return spanMs > 2 * 86400e3 ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * TrendCard —— 历史趋势（数据来自 metric_samples，由后台周期采集积累，不是实时造数）
 * 属性：providerId / metric / target / range('1h'|'6h'|'24h'|'7d'|'30d') / title / unit / domain / refreshKey / seriesIndex
 */
export default function TrendCard({ providerId, metric, target = '', range, title, unit = '', domain, refreshKey, seriesIndex = 0, format }) {
  const pal = useChartPalette();
  const q = useAsync(() => monitorApi.getTrend(providerId, { metric, target, range }), [providerId, metric, target, range, refreshKey]);
  const pts = useMemo(() => (q.data?.points || []).map((p) => ({ t: p.t, v: +p.v.toFixed(2) })), [q.data]);
  const color = pal.series[seriesIndex % pal.series.length];
  const gid = `tg-${metric}-${target}`.replace(/[^\w-]/g, '_');
  const span = pts.length > 1 ? pts[pts.length - 1].t - pts[0].t : 0;
  const fmt = format || ((v) => `${v}${unit}`);
  return (
    <div className="card p-4">
      <div className="text-sm font-medium text-fg mb-3">{title}</div>
      <div className="h-[200px]">
        {q.loading ? <Skeleton.Chart /> : q.error ? <EmptyState compact title="趋势加载失败" description={q.error.message} />
          : pts.length < 2 ? <EmptyState compact title="历史数据积累中" description="后台按平台同步间隔周期采集，至少 2 个采样点后显示趋势；也可点击「立即采集」" /> : (
            <ResponsiveContainer>
              <AreaChart data={pts} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={axisTime(span)} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} minTickGap={40} />
                <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={domain || ['auto', 'auto']} width={48} />
                <RTooltip cursor={{ stroke: pal.axis, strokeDasharray: '4 4' }} content={<ChartTooltip labelFormatter={(t) => formatDateTime(t)} valueFormatter={fmt} />} />
                <Area type="monotone" dataKey="v" name={title} stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
      </div>
    </div>
  );
}
