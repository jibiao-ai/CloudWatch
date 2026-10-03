import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Panel, { Seg, FilterBar, Filter } from '../Panel';
import { AllocPanel, UsePanel } from '../Blocks';
import BackendPanel from '../BackendPanel';
import DonutPanel from '../DonutPanel';
import HostVmChart from '../HostVmChart';
import BandsPanel from '../BandsPanel';
import ErrorState from '../../ErrorState';
import { optsOf } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';

const DIST = [{ value: 'host', label: '宿主机' }, { value: 'pool', label: '集群存储' }];
const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }, { value: 'storage', label: '集群存储使用率' }];
const EMPTY = { providerId: '', cluster: '', host: '', pool: '' };
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** BaseTab —— 运营分析 · 资源分析：宿主机 / 集群存储的分配率、使用率（含每套存储后端）、分布；宿主机与集群存储的明细在「监控中心」 */
export default function BaseTab({ tick }) {
  const [flt, setFlt] = useState(EMPTY);
  const [dist, setDist] = useState('host');
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getBase(params), [params, tick]);
  const d = q.data;
  const o = d?.options || {};
  // 所属云平台变化时清空下游筛选（集群 / 宿主机 / 集群存储都隶属于云平台）
  const pick = (patch) => setFlt((f) => ({ ...f, ...(patch.providerId !== undefined ? { cluster: '', host: '', pool: '' } : patch.cluster !== undefined ? { host: '' } : {}), ...patch }));
  const f = (key, label, options, width) => <Filter key={key} label={label} options={options} value={flt[key]} onChange={(v) => pick({ [key]: v })} width={width} />;
  return (
    <>
      <FilterBar>
        {f('providerId', '所属云平台', optsOf(o.platforms), 190)}
        {f('cluster', '集群', optsOf(o.clusters, flt.providerId), 170)}
        {f('host', '宿主机', optsOf(o.hosts, flt.providerId, flt.cluster), 170)}
        {f('pool', '集群存储', optsOf(o.pools, flt.providerId), 190)}
        <span className="ml-auto text-[13px] text-fg-muted">明细：<Link to="/monitor?tab=hosts" className="text-primary-text hover:underline">监控中心 · 宿主机 / 集群存储</Link></span>
      </FilterBar>
      {q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AllocPanel rates={d?.rates} loading={q.loading} />
            <UsePanel rates={d?.rates} loading={q.loading} />
          </div>
          <BackendPanel list={d?.backends} loading={q.loading} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <DonutPanel title="基础资源分布" unit={dist === 'host' ? '台' : '个'} loading={q.loading} data={dist === 'host' ? d?.hostDist : d?.poolDist}
              actions={<Seg label="分布对象" items={DIST} value={dist} onChange={setDist} />} />
            <Panel title="宿主机上云主机分布"><HostVmChart data={d?.hostVms || []} /></Panel>
          </div>
          <BandsPanel title="基础资源按使用率分布" metrics={METRICS} deps={[params, tick]} load={(metric, dates) => analyticsApi.getBaseBands({ ...params, metric, ...dates })} />
        </>
      )}
    </>
  );
}
