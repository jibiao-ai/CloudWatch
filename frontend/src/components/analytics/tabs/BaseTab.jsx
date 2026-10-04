import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Panel, { Seg, FilterBar, Filter } from '../Panel';
import { AllocPanel, UsePanel } from '../Blocks';
import BackendPanel from '../BackendPanel';
import DonutPanel from '../DonutPanel';
import HostVmChart from '../HostVmChart';
import BandsPanel from '../BandsPanel';
import Carousel from '../../Carousel';
import ErrorState from '../../ErrorState';
import SearchHits, { withPlat } from '../SearchHits';
import { optsOf } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';
import TabExport from '../TabExport';

const DIST = [{ value: 'host', label: '计算节点' }, { value: 'pool', label: '集群存储' }];
const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }, { value: 'storage', label: '集群存储使用率' }];
const EMPTY = { providerId: '', host: '', pool: '' };
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** BaseTab —— 运营中心 · 资源分析：计算节点 / 集群存储的分配率、使用率（含每套存储后端）；分布类图表以横向轮播展示（每 60 秒自动切换）；计算节点与集群存储的明细在「监控中心」 */
export default function BaseTab({ tick, keyword, onClearKeyword }) {
  const [flt, setFlt] = useState(EMPTY);
  const [dist, setDist] = useState('host');
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getBase(params), [params, tick]);
  const d = q.data;
  const o = d?.options || {};
  // 所属云平台变化时清空下游筛选（计算节点 / 集群存储都隶属于云平台）
  const pick = (patch) => setFlt((f) => ({ ...f, ...(patch.providerId !== undefined ? { host: '', pool: '' } : {}), ...patch }));
  const f = (key, label, options, width) => <Filter key={key} label={label} options={options} value={flt[key]} onChange={(v) => pick({ [key]: v })} width={width} />;
  const plats = optsOf(o.platforms);
  const groups = [
    { type: '所属云平台', items: plats, onPick: (it) => pick({ providerId: it.value }) },
    { type: '计算节点', items: withPlat(o.hosts, plats), onPick: (it) => setFlt((x) => ({ ...x, providerId: it.providerId, host: it.value, pool: '' })) },
    { type: '集群存储', items: withPlat(o.pools, plats), onPick: (it) => setFlt((x) => ({ ...x, providerId: it.providerId, pool: it.value, host: '' })) },
  ];
  return (
    <>
      <SearchHits keyword={keyword} groups={groups} onClear={onClearKeyword} />
      <FilterBar>
        {f('providerId', '所属云平台', optsOf(o.platforms), 190)}
        {f('host', '计算节点', optsOf(o.hosts, flt.providerId), 170)}
        {f('pool', '集群存储', optsOf(o.pools, flt.providerId), 190)}
        <span className="ml-auto flex items-center gap-4 text-[13px] whitespace-nowrap">
          <Link to="/monitor?tab=hosts" className="text-primary-text hover:underline">在监控中心查看计算节点信息</Link>
          <Link to="/monitor?tab=pools" className="text-primary-text hover:underline">在监控中心查看集群存储信息</Link>
        </span>
        <TabExport kind="base" title="资源分析" params={params} filters={{ 云平台: plats.find((x) => x.value === flt.providerId)?.label, 计算节点: flt.host, 集群存储: flt.pool }} />
      </FilterBar>
      {q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AllocPanel rates={d?.rates} loading={q.loading} />
            <UsePanel rates={d?.rates} loading={q.loading} />
          </div>
          <BackendPanel list={d?.backends} loading={q.loading} />
          <Carousel ariaLabel="资源分析分页" idPrefix="base-slide" slides={[
            { key: 'dist', label: '基础资源分布', node: (
              <DonutPanel title="基础资源分布" unit={dist === 'host' ? '台' : '个'} loading={q.loading} data={dist === 'host' ? d?.hostDist : d?.poolDist}
                actions={<Seg label="分布对象" items={DIST} value={dist} onChange={setDist} />} />) },
            { key: 'hostVms', label: '计算节点上云主机分布', node: <Panel title="计算节点上云主机分布"><HostVmChart data={d?.hostVms || []} /></Panel> },
            { key: 'bands', label: '基础资源按使用率分布', node: (
              <BandsPanel title="基础资源按使用率分布" metrics={METRICS} deps={[params, tick]} load={(metric, dates) => analyticsApi.getBaseBands({ ...params, metric, ...dates })} />) },
          ]} />
        </>
      )}
    </>
  );
}
