import React, { useMemo, useState } from 'react';
import Panel, { Seg, FilterBar, Filter } from '../Panel';
import { AllocPanel, UsePanel } from '../Blocks';
import DonutPanel from '../DonutPanel';
import HostVmChart from '../HostVmChart';
import BandsPanel from '../BandsPanel';
import DetailTable from '../DetailTable';
import ErrorState from '../../ErrorState';
import { HOST_COLS, POOL_COLS } from '../columns';
import { optsOf } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';

const DIST = [{ value: 'host', label: '宿主机' }, { value: 'pool', label: '存储器' }];
const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }, { value: 'storage', label: '存储器使用率' }];
const EMPTY = { providerId: '', cluster: '', host: '', pool: '' };
const FIELDS = [{ value: 'name', label: '宿主机名称' }, { value: 'ip', label: 'IP地址' }];
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** BaseTab —— 运营分析 · 资源分析：宿主机 / 存储器的分配率、使用率、分布，以及宿主机 / 存储器明细（视图切换） */
export default function BaseTab({ d: ov, tick }) {
  const [view, setView] = useState('overview');
  const [flt, setFlt] = useState(EMPTY);
  const [dist, setDist] = useState('host');
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getBase(params), [params, tick]);
  const d = q.data;
  const o = d?.options || {};
  // 所属云平台变化时清空下游筛选（集群 / 宿主机 / 存储器都隶属于云平台）
  const pick = (patch) => setFlt((f) => ({ ...f, ...(patch.providerId !== undefined ? { cluster: '', host: '', pool: '' } : patch.cluster !== undefined ? { host: '' } : {}), ...patch }));
  const bare = view !== 'overview';
  const f = (key, label, options, width) => <Filter key={key} label={label} options={options} value={flt[key]} onChange={(v) => pick({ [key]: v })} bare={bare} width={width} />;
  const plat = f('providerId', '所属云平台', optsOf(o.platforms), bare ? 200 : 190);
  const cluster = f('cluster', '集群', optsOf(o.clusters, flt.providerId), bare ? 160 : 170);
  const host = f('host', '宿主机', optsOf(o.hosts, flt.providerId, flt.cluster), 170);
  const pool = f('pool', '存储器', optsOf(o.pools, flt.providerId), 170);
  const views = [{ value: 'overview', label: '资源分析' }, { value: 'hosts', label: `宿主机明细 ${ov.totals.hosts}` }, { value: 'pools', label: `存储器明细 ${ov.totals.pools}` }];
  return (
    <>
      <div><Seg label="视图" items={views} value={view} onChange={setView} /></div>
      {view === 'overview' && (
        <>
          <FilterBar>{plat}{cluster}{host}{pool}</FilterBar>
          {q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <AllocPanel rates={d?.rates} loading={q.loading} />
                <UsePanel rates={d?.rates} loading={q.loading} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <DonutPanel title="基础资源分布" unit={dist === 'host' ? '台' : '个'} loading={q.loading} data={dist === 'host' ? d?.hostDist : d?.poolDist}
                  actions={<Seg label="分布对象" items={DIST} value={dist} onChange={setDist} />} />
                <Panel title="宿主机上云主机分布"><HostVmChart data={d?.hostVms || []} /></Panel>
              </div>
              <BandsPanel title="基础资源按使用率分布" metrics={METRICS} deps={[params, tick]} load={(metric, dates) => analyticsApi.getBaseBands({ ...params, metric, ...dates })} />
            </>
          )}
        </>
      )}
      {view === 'hosts' && <DetailTable kind="hosts" columns={HOST_COLS} filter={params} exportTitle="宿主机明细" fields={FIELDS} refreshKey={tick} lead={<>{plat}{cluster}{host}</>} />}
      {view === 'pools' && <DetailTable kind="pools" columns={POOL_COLS} filter={params} exportTitle="存储器明细" refreshKey={tick} lead={<>{plat}{pool}</>} />}
    </>
  );
}
