import React, { useState } from 'react';
import Panel, { Seg } from './Panel';
import Gauge from './Gauge';
import WaterCircle from './WaterCircle';
import TrendArea from './TrendArea';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import { analyticsApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { RANGE_ITEMS, SPAN } from './util';

/** AllocPanel —— 基础资源分配率（三个仪表盘） */
export function AllocPanel({ rates, loading }) {
  return (
    <Panel title="基础资源分配率">
      {loading ? <Skeleton.Block className="h-[150px]" /> : (
        <div className="grid grid-cols-3 gap-2 justify-items-center">
          <Gauge value={rates?.alloc?.cpu} label="CPU分配率" />
          <Gauge value={rates?.alloc?.mem} label="内存分配率" />
          <Gauge value={rates?.alloc?.storage} label="存储分配率" />
        </div>
      )}
    </Panel>
  );
}

/** UsePanel —— 基础资源使用率（三个水球） */
export function UsePanel({ rates, loading }) {
  return (
    <Panel title="基础资源使用率">
      {loading ? <Skeleton.Block className="h-[150px]" /> : (
        <div className="grid grid-cols-3 gap-2 justify-items-center items-center">
          <WaterCircle value={rates?.use?.cpu} label="CPU使用率" />
          <WaterCircle value={rates?.use?.mem} label="内存使用率" />
          <WaterCircle value={rates?.use?.storage} label="存储使用率" />
        </div>
      )}
    </Panel>
  );
}

/** TrendPanel —— 数量趋势：近 7 天 / 30 天 / 半年 / 一年。kind: vm | disk；providerId / unit 变化时重新加载 */
export function TrendPanel({ title, kind, providerId = '', unit = '', suffix = '', refreshKey = 0 }) {
  const [rng, setRng] = useState('7d');
  const tr = useAsync(() => analyticsApi.getTrend({ kind, range: rng, providerId, unit }), [kind, rng, providerId, unit, refreshKey]);
  return (
    <Panel title={title} actions={<Seg label="时间范围" items={RANGE_ITEMS} value={rng} onChange={setRng} />}>
      {tr.loading ? <Skeleton.Block className="h-[220px]" /> : tr.error ? <ErrorState error={tr.error} onRetry={tr.reload} />
        : <TrendArea series={tr.data || []} unit={suffix} spanMs={SPAN[rng] * 86400e3} />}
    </Panel>
  );
}
