import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingButton from '../components/LoadingButton';
import ErrorState from '../components/ErrorState';
import Tabs from '../components/Tabs';
import CustomSelect from '../components/CustomSelect';
import Panel, { Seg, FilterBar } from '../components/analytics/Panel';
import { AllocPanel, UsePanel } from '../components/analytics/Blocks';
import DonutPanel from '../components/analytics/DonutPanel';
import HostVmChart from '../components/analytics/HostVmChart';
import BandsPanel from '../components/analytics/BandsPanel';
import DetailTable from '../components/analytics/DetailTable';
import { HOST_COLS, POOL_COLS } from '../components/analytics/columns';
import { optsOf } from '../components/analytics/util';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';

const TABS = [{ key: 'overview', label: '资源分析' }, { key: 'hosts', label: '宿主机明细' }, { key: 'pools', label: '存储器明细' }];
const DIST = [{ value: 'host', label: '宿主机' }, { value: 'pool', label: '存储器' }];
const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }, { value: 'storage', label: '存储器使用率' }];
const EMPTY = { providerId: '', cluster: '', host: '', pool: '' };
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** AnalyticsBasePage —— 运营分析 · 基础资源分析：宿主机 / 存储器的分配率、使用率、分布与明细 */
export default function AnalyticsBasePage() {
  const [tab, setTab] = useState('overview');
  const [flt, setFlt] = useState(EMPTY);
  const [dist, setDist] = useState('host');
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getBase(params), [params]);
  const d = q.data;
  const o = d?.options || {};
  // 云账号变化时清空下游筛选（集群 / 宿主机 / 存储器都隶属于云账号）
  const pick = (patch) => setFlt((f) => ({ ...f, ...(patch.providerId !== undefined ? { cluster: '', host: '', pool: '' } : patch.cluster !== undefined ? { host: '' } : {}), ...patch }));
  const sel = (key, label, options) => (
    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span>{label}</span>
      <div className="w-[170px]"><CustomSelect size="sm" clearable placeholder="全部" aria-label={label} options={options} value={flt[key]} onChange={(v) => pick({ [key]: v || '' })} /></div>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="运营分析 · 基础资源分析" description="宿主机与存储器的资源分配率、使用率、分布与明细；使用率分布按平台同步间隔持续积累"
        actions={<LoadingButton icon={RefreshCw} loading={q.refreshing} onClick={q.reload}>刷新</LoadingButton>} />
      <Tabs items={TABS} value={tab} onChange={setTab} idPrefix="an-base" />
      <div id="an-base-panel" role="tabpanel" className="space-y-4">
        <FilterBar>
          {sel('providerId', '云账号', optsOf(o.accounts))}
          {sel('cluster', '集群', optsOf(o.clusters, flt.providerId))}
          {sel('host', '宿主机', optsOf(o.hosts, flt.providerId, flt.cluster))}
          {sel('pool', '存储器', optsOf(o.pools, flt.providerId))}
        </FilterBar>
        {tab === 'overview' && (q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
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
            <BandsPanel title="基础资源按使用率分布" metrics={METRICS} deps={[params]} load={(metric, dates) => analyticsApi.getBaseBands({ ...params, metric, ...dates })} />
          </>
        ))}
        {tab === 'hosts' && <DetailTable kind="hosts" columns={HOST_COLS} filter={params} exportTitle="宿主机明细" fields={[{ value: 'name', label: '宿主机名称' }, { value: 'ip', label: 'IP地址' }]} />}
        {tab === 'pools' && <DetailTable kind="pools" columns={POOL_COLS} filter={params} exportTitle="存储器明细" />}
      </div>
    </div>
  );
}
