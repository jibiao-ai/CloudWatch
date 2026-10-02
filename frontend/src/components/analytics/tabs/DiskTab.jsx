import React, { useMemo, useState } from 'react';
import { Seg, FilterBar, Filter } from '../Panel';
import { TrendPanel } from '../Blocks';
import DonutPanel from '../DonutPanel';
import DetailTable from '../DetailTable';
import ErrorState from '../../ErrorState';
import { DISK_COLS } from '../columns';
import { mountColor } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';

const UNITS = [{ value: 'count', label: '数量(块)' }, { value: 'gb', label: '容量(G)' }];

/** DiskTab —— 运营分析 · 磁盘分析：所属云平台 / 挂载状态 / 磁盘类型分布（按数量或容量）、数量趋势，以及资源明细（视图切换） */
export default function DiskTab({ d: ov, tick }) {
  const [view, setView] = useState('overview');
  const [pid, setPid] = useState('');
  const [unit, setUnit] = useState('count');
  const params = useMemo(() => ({ providerId: pid, unit }), [pid, unit]);
  const q = useAsync(() => analyticsApi.getDisk(params), [pid, unit, tick]);
  const d = q.data;
  const u = unit === 'gb' ? 'G' : '块';
  const plats = (d?.platforms_opt || []).map((a) => ({ value: a.value, label: a.label }));
  const bare = view !== 'overview';
  const plat = <Filter label="所属云平台" options={plats} value={pid} onChange={setPid} bare={bare} width={bare ? 200 : 190} />;
  const views = [{ value: 'overview', label: '磁盘分析' }, { value: 'detail', label: `资源明细 ${ov.totals.disks}` }];
  return (
    <>
      <div><Seg label="视图" items={views} value={view} onChange={setView} /></div>
      {view === 'overview' && (
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
      {view === 'detail' && <DetailTable kind="disks" columns={DISK_COLS} filter={pid ? { providerId: pid } : {}} exportTitle="磁盘明细" refreshKey={tick} lead={plat} />}
    </>
  );
}
