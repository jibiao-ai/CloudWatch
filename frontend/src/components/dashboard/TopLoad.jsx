import React from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import EmptyState from '../EmptyState';
import ChartTooltip from '../ChartTooltip';
import { useChartPalette } from '../../hooks/useChartPalette';

/** 平台概览三张图表卡（使用率趋势 / CPU TOP5 / 内存 TOP5）统一高度 */
export const DASH_CARD_H = 'h-[450px]';

const META = {
  cpu: { title: 'CPU 使用率 TOP 5', sub: '物理节点 CPU 使用率最高的 5 个节点', idx: 0, name: 'CPU 使用率' },
  mem: { title: '内存使用率 TOP 5', sub: '物理节点内存使用率最高的 5 个节点', idx: 1, name: '内存使用率' },
};
const toneOf = (v) => (v >= 85 ? 'text-danger' : v >= 70 ? 'text-warning' : 'text-fg');
const barOf = (v) => (v >= 85 ? 'bg-danger' : v >= 70 ? 'bg-warning' : 'bg-success');

/** TopLoadCard —— 物理节点 CPU / 内存使用率 TOP5：上方柱状图 + 下方列表（点击进入监控中心物理节点并带上搜索词） */
export function TopLoadCard({ metric, rows }) {
  const m = META[metric];
  const pal = useChartPalette();
  const dup = new Set((rows || []).map((n) => n.node).filter((x, i, a) => a.indexOf(x) !== i));
  const data = (rows || []).map((n) => ({ ...n, label: dup.has(n.node) ? `${n.node} ·${(n.hostIp || n.provider || '').split('.').slice(-2).join('.')}` : n.node, v: Number((metric === 'cpu' ? n.cpu : n.mem) ?? 0) }));
  return (
    <section className={`card p-4 flex flex-col ${DASH_CARD_H}`} aria-label={m.title}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h2 className="text-sm font-medium text-fg">{m.title}</h2>
          <p className="text-xs text-fg-muted mt-0.5">{m.sub}</p>
        </div>
        <Link to="/monitor?tab=nodes" className="text-[13px] text-primary-text hover:underline shrink-0">监控中心 →</Link>
      </div>
      {!data.length ? <div className="flex-1 min-h-0"><EmptyState compact title="暂无节点监控数据" /></div> : (
        <>
          <div className="h-[130px] shrink-0">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" interval={0} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} tickFormatter={(t) => (t.length > 12 ? `${t.slice(0, 11)}…` : t)} />
                <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" width={42} />
                <RTooltip cursor={{ fill: pal.grid, opacity: 0.4 }} content={<ChartTooltip labelFormatter={(t) => t} valueFormatter={(v) => `${Number(v).toFixed(1)}%`} />} />
                <Bar dataKey="v" name={m.name} radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {data.map((d) => <Cell key={d.providerId + d.node} fill={pal.series[m.idx]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="mt-2 flex-1 min-h-0 divide-y divide-line overflow-y-auto" aria-label={`${m.title}列表`}>
            {data.map((n, i) => (
              <li key={n.providerId + n.node}>
                <Link to={`/monitor?tab=nodes&pid=${n.providerId}&kw=${encodeURIComponent(n.node)}`} className="flex items-center gap-3 px-1 py-1.5 hover:bg-hover/60 transition-colors rounded">
                  <span className="w-5 text-xs text-fg-muted tabular-nums text-center shrink-0">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg truncate">{n.node} <span className="text-xs font-mono text-fg-muted">{n.hostIp}</span></span>
                    <span className="block text-xs text-fg-muted truncate">{n.provider}</span>
                  </span>
                  <span className="w-[96px] h-1.5 rounded-full bg-muted overflow-hidden shrink-0" aria-hidden="true">
                    <span className={`block h-full rounded-full ${barOf(n.v)}`} style={{ width: `${Math.min(100, n.v)}%` }} />
                  </span>
                  <span className={`w-[52px] text-right text-sm font-semibold tabular-nums shrink-0 ${toneOf(n.v)}`}>{n.v.toFixed(1)}%</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
