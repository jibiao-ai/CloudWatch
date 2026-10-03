import React, { useState } from 'react';
import Panel, { Seg } from './Panel';
import BandsChart from './BandsChart';
import DateRange from './DateRange';
import ErrorState from '../ErrorState';
import { defaultDates, ymd } from './util';
import { useAsync } from '../../hooks/useAsync';

/**
 * BandsPanel —— 按使用率分布：指标切换（CPU / 内存 / 集群存储）+ 日期范围 + 5 个区间折线。
 * 属性：title / metrics[{value,label}] / load(metric,{from,to}) => Promise<BandChart> / deps(筛选条件变化时重新加载)
 */
export default function BandsPanel({ title, metrics, load, deps = [] }) {
  const [metric, setMetric] = useState(metrics[0].value);
  const [dates, setDates] = useState(defaultDates);
  const bad = dates.from && dates.to && dates.from > dates.to;
  const q = useAsync(() => (bad ? Promise.resolve(null) : load(metric, dates)), [metric, dates.from, dates.to, ...deps]);
  return (
    <Panel title={title} actions={<>
      <DateRange from={dates.from} to={dates.to} max={ymd(new Date())} onChange={setDates} />
      <Seg label="指标" items={metrics} value={metric} onChange={setMetric} />
    </>}>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : <BandsChart data={q.data} loading={q.loading} />}
    </Panel>
  );
}
