import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar, Filter } from '../Panel';
import { TrendPanel } from '../Blocks';
import DonutPanel from '../DonutPanel';
import BandsPanel from '../BandsPanel';
import ErrorState from '../../ErrorState';
import SearchHits, { withPlat } from '../SearchHits';
import { optsOf, stateColor } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';
import TabExport from '../TabExport';

const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }];
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** VMTab —— 运营中心 · 虚拟机分析：所属云平台 / 状态分布、数量趋势、使用率分布；云主机资源明细（含 CPU / 内存最大使用率）在「监控中心 · 虚拟机」 */
export default function VMTab({ tick, keyword, onClearKeyword }) {
  const [flt, setFlt] = useState({ providerId: '', host: '' });
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getVM(params), [params, tick]);
  const d = q.data;
  const o = d?.options || {};
  const plats = optsOf(o.platforms);
  const groups = [
    { type: '所属云平台', items: plats, onPick: (it) => setFlt({ providerId: it.value, host: '' }) },
    { type: '计算节点', items: withPlat(o.hosts, plats), onPick: (it) => setFlt({ providerId: it.providerId, host: it.value }) },
  ];
  return (
    <>
      <SearchHits keyword={keyword} groups={groups} onClear={onClearKeyword} />
      <FilterBar>
        <Filter label="所属云平台" options={optsOf(o.platforms)} value={flt.providerId} onChange={(v) => setFlt({ providerId: v, host: '' })} width={190} />
        <Filter label="计算节点" options={optsOf(o.hosts, flt.providerId)} value={flt.host} onChange={(v) => setFlt((f) => ({ ...f, host: v }))} width={170} />
        <span className="ml-auto text-[13px] text-fg-muted">资源明细：<Link to="/monitor?tab=vms" className="text-primary-text hover:underline">监控中心 · 虚拟机</Link></span>
        <TabExport kind="vm" title="虚拟机分析" params={params} filters={{ 云平台: plats.find((x) => x.value === flt.providerId)?.label, 计算节点: flt.host }} />
      </FilterBar>
      {q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DonutPanel title="所属云平台分布" unit="台" loading={q.loading} data={d?.platforms} />
            <DonutPanel title="运行状态" unit="台" loading={q.loading} data={d?.status} colorOf={stateColor} />
          </div>
          <TrendPanel title="虚拟机趋势" kind="vm" providerId={flt.providerId} suffix=" 台" refreshKey={tick} />
          <BandsPanel title="云主机按使用率分布" metrics={METRICS} deps={[params, tick]} load={(metric, dates) => analyticsApi.getVMBands({ ...params, metric, ...dates })} />
        </>
      )}
    </>
  );
}
