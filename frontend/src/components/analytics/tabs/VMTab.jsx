import React, { useMemo, useState } from 'react';
import { Seg, FilterBar, Filter } from '../Panel';
import { TrendPanel } from '../Blocks';
import DonutPanel from '../DonutPanel';
import BandsPanel from '../BandsPanel';
import DetailTable from '../DetailTable';
import ErrorState from '../../ErrorState';
import { VM_COLS } from '../columns';
import { optsOf, stateColor } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';

const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }];
const FIELDS = [{ value: 'name', label: '名称' }, { value: 'ip', label: 'IP地址' }];
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** VMTab —— 运营分析 · 云主机分析：所属云平台 / 状态分布、数量趋势、使用率分布，以及资源明细（视图切换） */
export default function VMTab({ d: ov, tick }) {
  const [view, setView] = useState('overview');
  const [flt, setFlt] = useState({ providerId: '', host: '' });
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getVM(params), [params, tick]);
  const d = q.data;
  const o = d?.options || {};
  const bare = view !== 'overview';
  const plat = <Filter label="所属云平台" options={optsOf(o.platforms)} value={flt.providerId} onChange={(v) => setFlt({ providerId: v, host: '' })} bare={bare} width={bare ? 200 : 190} />;
  const host = <Filter label="宿主机" options={optsOf(o.hosts, flt.providerId)} value={flt.host} onChange={(v) => setFlt((f) => ({ ...f, host: v }))} bare={bare} width={170} />;
  const views = [{ value: 'overview', label: '云主机分析' }, { value: 'detail', label: `资源明细 ${ov.totals.vms}` }];
  return (
    <>
      <div><Seg label="视图" items={views} value={view} onChange={setView} /></div>
      {view === 'overview' && (
        <>
          <FilterBar>{plat}{host}</FilterBar>
          {q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DonutPanel title="所属云平台分布" unit="台" loading={q.loading} data={d?.platforms} />
                <DonutPanel title="运行状态" unit="台" loading={q.loading} data={d?.status} colorOf={stateColor} />
              </div>
              <TrendPanel title="云主机趋势" kind="vm" providerId={flt.providerId} suffix=" 台" refreshKey={tick} />
              <BandsPanel title="云主机按使用率分布" metrics={METRICS} deps={[params, tick]} load={(metric, dates) => analyticsApi.getVMBands({ ...params, metric, ...dates })} />
            </>
          )}
        </>
      )}
      {view === 'detail' && <DetailTable kind="vms" columns={VM_COLS} filter={params} fields={FIELDS} exportTitle="云主机明细" refreshKey={tick} lead={<>{plat}{host}</>} />}
    </>
  );
}
