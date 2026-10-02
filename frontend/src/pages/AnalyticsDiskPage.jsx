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
import DetailTable from '../components/analytics/DetailTable';
import { DISK_COLS } from '../components/analytics/columns';
import { mountColor } from '../components/analytics/util';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';

const TABS = [{ key: 'overview', label: '磁盘分析' }, { key: 'detail', label: '资源明细' }];
const UNITS = [{ value: 'count', label: '数量(块)' }, { value: 'gb', label: '容量(G)' }];

/** AnalyticsDiskPage —— 运营分析 · 磁盘分析：账号 / 挂载状态 / 磁盘类型分布（按数量或容量）、数量趋势与资源明细 */
export default function AnalyticsDiskPage() {
  const [tab, setTab] = useState('overview');
  const [pid, setPid] = useState('');
  const [unit, setUnit] = useState('count');
  const params = useMemo(() => ({ providerId: pid, unit }), [pid, unit]);
  const q = useAsync(() => analyticsApi.getDisk(params), [pid, unit]);
  const d = q.data;
  const u = unit === 'gb' ? 'G' : '块';
  const accounts = (d?.accounts_opt || []).map((a) => ({ value: a.value, label: a.label }));
  return (
    <div className="space-y-4">
      <PageHeader title="运营分析 · 磁盘分析" description="云硬盘的账号、挂载状态与类型分布，可按数量或容量统计；数量趋势与资源明细"
        actions={<LoadingButton icon={RefreshCw} loading={q.refreshing} onClick={q.reload}>刷新</LoadingButton>} />
      <Tabs items={TABS} value={tab} onChange={setTab} idPrefix="an-disk" />
      <div id="an-disk-panel" role="tabpanel" className="space-y-4">
        <FilterBar>
          <div className="flex items-center gap-1.5 text-xs text-fg-muted"><span>云账号</span>
            <div className="w-[190px]"><CustomSelect size="sm" clearable placeholder="全部" aria-label="云账号" options={accounts} value={pid} onChange={(v) => setPid(v || '')} /></div></div>
          {tab === 'overview' && <div className="flex items-center gap-1.5 text-xs text-fg-muted"><span>单位</span>
            <div className="w-[130px]"><CustomSelect size="sm" aria-label="统计单位" options={UNITS} value={unit} onChange={(v) => setUnit(v || 'count')} /></div></div>}
        </FilterBar>
        {tab === 'overview' && (q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <DonutPanel title="云账号分布" unit={u} loading={q.loading} data={d?.accounts} />
              <DonutPanel title="挂载状态" unit={u} loading={q.loading} data={d?.mount} colorOf={mountColor} />
              <DonutPanel title="磁盘类型" unit={u} loading={q.loading} data={d?.types} />
            </div>
            <TrendPanel title="磁盘趋势" kind="disk" providerId={pid} unit={unit} suffix={unit === 'gb' ? ' G' : ' 块'} />
          </>
        ))}
        {tab === 'detail' && <DetailTable kind="disks" columns={DISK_COLS} filter={pid ? { providerId: pid } : {}} exportTitle="磁盘明细" />}
      </div>
    </div>
  );
}
