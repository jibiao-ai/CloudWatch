import React, { useMemo, useState } from 'react';
import { FilterBar, Filter } from '../components/analytics/Panel';
import AnalyticsShell from '../components/analytics/Shell';
import { TrendPanel } from '../components/analytics/Blocks';
import DonutPanel from '../components/analytics/DonutPanel';
import DetailTable from '../components/analytics/DetailTable';
import ErrorState from '../components/ErrorState';
import { DISK_COLS } from '../components/analytics/columns';
import { mountColor } from '../components/analytics/util';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';

const TABS = [{ key: 'overview', label: '磁盘分析' }, { key: 'detail', label: '资源明细', countKey: 'disks' }];
const UNITS = [{ value: 'count', label: '数量(块)' }, { value: 'gb', label: '容量(G)' }];

/** AnalyticsDiskPage —— 运营分析 · 磁盘分析：所属云平台 / 挂载状态 / 磁盘类型分布（按数量或容量）、数量趋势与资源明细（布局同资产管理） */
export default function AnalyticsDiskPage() {
  const [tab, setTab] = useState('overview');
  const [pid, setPid] = useState('');
  const [unit, setUnit] = useState('count');
  const params = useMemo(() => ({ providerId: pid, unit }), [pid, unit]);
  const q = useAsync(() => analyticsApi.getDisk(params), [pid, unit]);
  const d = q.data;
  const u = unit === 'gb' ? 'G' : '块';
  const plats = (d?.platforms_opt || []).map((a) => ({ value: a.value, label: a.label }));
  const bare = tab !== 'overview';
  const plat = <Filter label="所属云平台" options={plats} value={pid} onChange={setPid} bare={bare} width={bare ? 200 : 190} />;
  return (
    <AnalyticsShell title="运营分析 · 磁盘分析" description="云硬盘的所属云平台、挂载状态与类型分布，可按数量或容量统计；数量趋势与资源明细"
      tabs={TABS} tab={tab} onTab={setTab} idPrefix="an-disk" onRefresh={q.reload}>
      {(ov, tick) => (
        <>
          {tab === 'overview' && (
            <>
              <FilterBar>
                {plat}
                <Filter label="统计单位" options={UNITS} value={unit} onChange={(v) => setUnit(v || 'count')} width={130} clearable={false} />
              </FilterBar>
              {q.error ? <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div> : (
                <>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <DonutPanel title="所属云平台分布" unit={u} loading={q.loading} data={d?.platforms} />
                    <DonutPanel title="挂载状态" unit={u} loading={q.loading} data={d?.mount} colorOf={mountColor} />
                    <DonutPanel title="磁盘类型" unit={u} loading={q.loading} data={d?.types} />
                  </div>
                  <TrendPanel title="磁盘趋势" kind="disk" providerId={pid} unit={unit} suffix={unit === 'gb' ? ' G' : ' 块'} refreshKey={tick} />
                </>
              )}
            </>
          )}
          {tab === 'detail' && <DetailTable kind="disks" columns={DISK_COLS} filter={pid ? { providerId: pid } : {}} exportTitle="磁盘明细" refreshKey={tick} lead={plat} />}
        </>
      )}
    </AnalyticsShell>
  );
}
