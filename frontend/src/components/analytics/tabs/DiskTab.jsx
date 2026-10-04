import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar, Filter } from '../Panel';
import { TrendPanel } from '../Blocks';
import DonutPanel from '../DonutPanel';
import ErrorState from '../../ErrorState';
import SearchHits from '../SearchHits';
import { mountColor } from '../util';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';
import TabExport from '../TabExport';

const UNITS = [{ value: 'count', label: '数量(块)' }, { value: 'gb', label: '容量(G)' }];

/** DiskTab —— 运营中心 · 磁盘分析：所属云平台 / 挂载状态 / 磁盘类型分布（按数量或容量）、数量趋势；磁盘明细在「配置中心 · 云硬盘」 */
export default function DiskTab({ tick, keyword, onClearKeyword }) {
  const [pid, setPid] = useState('');
  const [unit, setUnit] = useState('count');
  const params = useMemo(() => ({ providerId: pid, unit }), [pid, unit]);
  const q = useAsync(() => analyticsApi.getDisk(params), [pid, unit, tick]);
  const d = q.data;
  const u = unit === 'gb' ? 'G' : '块';
  const plats = (d?.platforms_opt || []).map((a) => ({ value: a.value, label: a.label }));
  return (
    <>
      <SearchHits keyword={keyword} groups={[{ type: '所属云平台', items: plats, onPick: (it) => setPid(it.value) }]} onClear={onClearKeyword} />
      <FilterBar>
        <Filter label="所属云平台" options={plats} value={pid} onChange={setPid} width={190} />
        <Filter label="统计单位" options={UNITS} value={unit} onChange={(v) => setUnit(v || 'count')} width={130} clearable={false} />
        <span className="ml-auto text-[13px] text-fg-muted">磁盘明细：<Link to="/capacity?tab=volumes" className="text-primary-text hover:underline">配置中心 · 云硬盘</Link></span>
        <TabExport kind="disk" title="磁盘分析" params={params} filters={{ 云平台: plats.find((x) => x.value === pid)?.label, 单位: unit === 'gb' ? '容量' : '数量' }} />
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
  );
}
