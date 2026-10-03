import React, { useMemo } from 'react';
import SeriesChart from './SeriesChart';
import { useAsync } from '../../hooks/useAsync';
import { monitorApi } from '../../services/api';

const BUCKETS = 120;

/** 多平台时间序列合并：按时间桶先在平台内取平均，再跨平台取平均（agg='avg'）或求和（agg='sum'，如 IOPS） */
function mergePlatforms(perPlatform, agg) {
  const all = perPlatform.flat();
  if (!all.length) return [];
  const t0 = Math.min(...all.map((p) => p.t)); const t1 = Math.max(...all.map((p) => p.t));
  const size = Math.max(1, Math.ceil((t1 - t0 + 1) / BUCKETS));
  const acc = new Map(); // bucket → { pid → [sum, n] }
  perPlatform.forEach((pts, pi) => pts.forEach((p) => {
    const k = t0 + Math.floor((p.t - t0) / size) * size;
    const b = acc.get(k) || new Map();
    const c = b.get(pi) || [0, 0];
    b.set(pi, [c[0] + p.v, c[1] + 1]);
    acc.set(k, b);
  }));
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([k, b]) => {
    const vs = [...b.values()].map(([s, n]) => s / n);
    const v = agg === 'sum' ? vs.reduce((a, x) => a + x, 0) : vs.reduce((a, x) => a + x, 0) / vs.length;
    return { t: k + size / 2, v };
  });
}

/** 把多个指标的 points 按时间戳合并为 [{t, <metric>: v}] */
const merge = (results, metrics) => {
  const byT = new Map();
  results.forEach((pts, i) => (pts || []).forEach((p) => {
    const row = byT.get(p.t) || { t: p.t };
    row[metrics[i].metric] = +p.v.toFixed(2);
    byT.set(p.t, row);
  }));
  return [...byT.values()].sort((a, b) => a.t - b.t);
};

/**
 * TrendCard —— 平台 / 节点历史趋势（数据来自 metric_samples，由后台周期采集积累，不是实时造数）
 * 属性：providerId（单平台）或 providerIds（多平台：按时间桶合并，agg='avg'|'sum'）/ metric（单指标）或 metrics[{metric,name}]（多指标同图）/ target / range / title / unit / domain / format / refreshKey / seriesIndex
 */
export default function TrendCard({ providerId, providerIds, agg = 'avg', metric, metrics, target = '', range, title, unit = '', domain, refreshKey, seriesIndex = 0, format }) {
  const ms = useMemo(() => metrics || [{ metric, name: title }], [metrics, metric, title]);
  const ids = providerIds || [providerId];
  const q = useAsync(() => Promise.all(ms.map((m) => Promise.all(ids.map((id) => monitorApi.getTrend(id, { metric: m.metric, target, range }).then((r) => r?.points || []).catch(() => []))).then((per) => (per.length === 1 ? per[0] : mergePlatforms(per, agg))))),
    [ids.join(), agg, ms.map((m) => m.metric).join(), target, range, refreshKey]);
  const data = useMemo(() => (q.data ? merge(q.data, ms) : []), [q.data, ms]);
  return <SeriesChart title={title} data={data} series={ms.map((m) => ({ key: m.metric, name: m.name }))} unit={unit} domain={domain} format={format} loading={q.loading} error={q.error} seriesOffset={seriesIndex} />;
}
