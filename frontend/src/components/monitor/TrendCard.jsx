import React, { useMemo } from 'react';
import SeriesChart from './SeriesChart';
import { useAsync } from '../../hooks/useAsync';
import { monitorApi } from '../../services/api';

/** 把多个指标的 points 按时间戳合并为 [{t, <metric>: v}] */
const merge = (results, metrics) => {
  const byT = new Map();
  results.forEach((r, i) => (r?.points || []).forEach((p) => {
    const row = byT.get(p.t) || { t: p.t };
    row[metrics[i].metric] = +p.v.toFixed(2);
    byT.set(p.t, row);
  }));
  return [...byT.values()].sort((a, b) => a.t - b.t);
};

/**
 * TrendCard —— 平台 / 节点历史趋势（数据来自 metric_samples，由后台周期采集积累，不是实时造数）
 * 属性：providerId / metric（单指标）或 metrics[{metric,name}]（多指标同图）/ target / range / title / unit / domain / format / refreshKey / seriesIndex
 */
export default function TrendCard({ providerId, metric, metrics, target = '', range, title, unit = '', domain, refreshKey, seriesIndex = 0, format }) {
  const ms = useMemo(() => metrics || [{ metric, name: title }], [metrics, metric, title]);
  const q = useAsync(() => Promise.all(ms.map((m) => monitorApi.getTrend(providerId, { metric: m.metric, target, range }))), [providerId, ms.map((m) => m.metric).join(), target, range, refreshKey]);
  const data = useMemo(() => (q.data ? merge(q.data, ms) : []), [q.data, ms]);
  return <SeriesChart title={title} data={data} series={ms.map((m) => ({ key: m.metric, name: m.name }))} unit={unit} domain={domain} format={format} loading={q.loading} error={q.error} seriesOffset={seriesIndex} />;
}
