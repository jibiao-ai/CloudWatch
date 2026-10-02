import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingButton from '../components/LoadingButton';
import ErrorState from '../components/ErrorState';
import Tabs from '../components/Tabs';
import CustomSelect from '../components/CustomSelect';
import { FilterBar } from '../components/analytics/Panel';
import { TrendPanel } from '../components/analytics/Blocks';
import DonutPanel from '../components/analytics/DonutPanel';
import BandsPanel from '../components/analytics/BandsPanel';
import DetailTable from '../components/analytics/DetailTable';
import { VM_COLS } from '../components/analytics/columns';
import { optsOf, stateColor } from '../components/analytics/util';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';

const TABS = [{ key: 'overview', label: '云主机分析' }, { key: 'detail', label: '资源明细' }];
const METRICS = [{ value: 'cpu', label: 'CPU使用率' }, { value: 'mem', label: '内存使用率' }];
const FIELDS = [{ value: 'name', label: '名称' }, { value: 'ip', label: 'IP地址' }];
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

/** AnalyticsVMPage —— 运营分析 · 云主机分析：账号 / 状态分布、数量趋势、使用率分布与资源明细 */
export default function AnalyticsVMPage() {
  const [tab, setTab] = useState('overview');
  const [flt, setFlt] = useState({ providerId: '', host: '' });
  const params = useMemo(() => clean(flt), [flt]);
  const q = useAsync(() => analyticsApi.getVM(params), [params]);
  const d = q.data;
  const o = d?.options || {};
  const sel = (key, label, options, patch) => (
    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span>{label}</span>
      <div className="w-[190px]"><CustomSelect size="sm" clearable placeholder="全部" aria-label={label} options={options} value={flt[key]} onChange={(v) => setFlt((f) => ({ ...f, ...patch, [key]: v || '' }))} /></div>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="运营分析 · 云主机分析" description="云主机的账号与运行状态分布、数量趋势、CPU / 内存使用率分布与资源明细"
        actions={<LoadingButton icon={RefreshCw} loading={q.refreshing} onClick={q.reload}>刷新</LoadingButton>} />
      <Tabs items={TABS} value={tab} onChange={setTab} idPrefix="an-vm" />
      <div id="an-vm-panel" role="tabpanel" className="space-y-4">
        <FilterBar>
          {sel('providerId', '云账号', optsOf(o.accounts), { host: '' })}
          {sel('host', '宿主机', optsOf(o.hosts, flt.providerId), {})}
        </FilterBar>
        {tab === 'overview' && (q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DonutPanel title="云账号分布" unit="台" loading={q.loading} data={d?.accounts} />
              <DonutPanel title="运行状态" unit="台" loading={q.loading} data={d?.status} colorOf={stateColor} />
            </div>
            <TrendPanel title="云主机趋势" kind="vm" providerId={flt.providerId} suffix=" 台" />
            <BandsPanel title="云主机按使用率分布" metrics={METRICS} deps={[params]} load={(metric, dates) => analyticsApi.getVMBands({ ...params, metric, ...dates })} />
          </>
        ))}
        {tab === 'detail' && <DetailTable kind="vms" columns={VM_COLS} filter={params} fields={FIELDS} exportTitle="云主机明细" />}
      </div>
    </div>
  );
}
