import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import MonTable from './MonTable';
import HealthTag from './HealthTag';
import { PlatformCell } from './cells';
import CustomSelect from '../CustomSelect';
import StatCard from '../StatCard';
import { SERVICE_CATEGORIES, serviceCategory, serviceName } from '../../utils/monitorUtil';
import { formatDateTime } from '../../utils/format';

const STATUS = [{ value: '', label: '全部状态' }, { value: 'ok', label: '正常' }, { value: 'bad', label: '异常' }, { value: 'na', label: '未采集' }];
const CATS = [{ value: '', label: '全部分类' }, ...SERVICE_CATEGORIES.map((c) => ({ value: c, label: c }))];
const kind = (s) => (s.state == null ? 'na' : s.state === 0 ? 'ok' : 'bad');

/** ServicesTab —— 服务状态：友好命名（对照表）+ 分类 + 指标名 + 状态 + 实例数 + 采集时间 + 补充标签；可搜索 / 筛选 / 排序 / 分页 */
export default function ServicesTab({ rows: src, plat, allTotal, initialKeyword }) {
  const [st, setSt] = useState('');
  const [cat, setCat] = useState('');
  const rows = useMemo(() => src.map((s) => ({ ...s, label: serviceName(s.name), cat: serviceCategory(s.name), kind: kind(s) })), [src]);
  const cnt = useMemo(() => ({ ok: rows.filter((r) => r.kind === 'ok').length, bad: rows.filter((r) => r.kind === 'bad').length }), [rows]);
  const columns = useMemo(() => [
    { key: 'label', title: '服务名称', width: 200, sortable: true, render: (s) => <span className="font-medium">{s.label}</span> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: (s) => s._p?.name, render: (s) => <PlatformCell platform={s._p} /> },
    { key: 'cat', title: '分类', width: 120, sortable: true, render: (s) => <span className="tag-default">{s.cat}</span> },
    { key: 'kind', title: '状态', width: 100, sortable: true, sortBy: (s) => (s.state == null ? -1 : s.state), render: (s) => <HealthTag value={s.state} okText="正常" badText="异常" /> },
    { key: 'instances', title: '实例数', width: 90, sortable: true, align: 'right', render: (s) => <span className="tabular-nums">{s.instances || '—'}</span> },
    { key: 'name', title: '服务指标', width: 320, sortable: true, render: (s) => <code className="text-[12.5px] text-fg-muted break-all">{s.name}</code> },
    { key: 'extra', title: '附加信息', width: 200, render: (s) => (s.labels ? <span className="text-xs text-fg-muted break-all">{Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(' · ')}</span> : <span className="text-fg-subtle">—</span>) },
    { key: 'at', title: '指标时间', width: 160, sortable: true, render: (s) => <span className="tabular-nums text-[13px]">{s.at ? formatDateTime(s.at * 1000) : '—'}</span> },
  ], []);
  const filterFn = useMemo(() => (r) => (!st || r.kind === st) && (!cat || r.cat === cat), [st, cat]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard icon={Layers} label="服务总数" value={rows.length} hint="来自 /ecms/services" tone="primary" />
        <StatCard icon={CheckCircle2} label="运行正常" value={cnt.ok} hint="指标值 0 = 健康" tone="success" />
        <StatCard icon={AlertTriangle} label="运行异常" value={cnt.bad} hint="指标值非 0 = 不健康" tone={cnt.bad ? 'danger' : 'success'} />
      </div>
      <MonTable columns={columns} rows={rows} plat={plat} allTotal={allTotal} keyFn={(s) => `${s._pid}|${s.name}`} initialKeyword={initialKeyword} placeholder="搜索服务名称 / 指标名 / 云平台" filterFn={filterFn} emptyTitle="暂无服务状态数据"
        searchText={(s) => `${s._p?.name || ''} ${s.label} ${s.name} ${s.cat}`} initialSort={{ key: 'kind', order: 'desc' }}
        filters={() => (
          <>
            <div className="w-[130px]"><CustomSelect aria-label="状态筛选" value={st} onChange={setSt} options={STATUS} /></div>
            <div className="w-[140px]"><CustomSelect aria-label="分类筛选" value={cat} onChange={setCat} options={CATS} /></div>
          </>
        )} />
    </div>
  );
}
