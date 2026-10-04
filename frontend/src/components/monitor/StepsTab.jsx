import React, { useMemo } from 'react';
import MonTable from './MonTable';
import { PlatformCell } from './cells';
import { xs } from '../../utils/xlsxExport';

const EXPORT = {
  name: '采集明细',
  cols: [
    { title: '所属云平台', get: (s) => s._p?.name || '' }, { title: '控制台 IP', get: (s) => s._p?.consoleIp || '' }, { title: '接口', get: (s) => xs(s.label) },
    { title: '请求路径', get: (s) => (s.path ? `GET ${s.path}` : '') }, { title: '结果', get: (s) => (s.ok ? '成功' : '失败') }, { title: '条数', get: (s) => s.count ?? 0 },
    { title: '耗时(ms)', get: (s) => xs(s.durationMs) }, { title: '错误信息', get: (s) => xs(s.error) },
  ],
};

/** StepsTab —— 采集明细：表头与「配置中心 · 采集明细」一致（所属云平台 / 接口 / 请求路径 / 结果 / 条数 / 耗时 / 错误信息）；可搜索 / 排序 / 分页 */
export default function StepsTab({ rows, plat, allTotal, initialKeyword }) {
  const columns = useMemo(() => [
    { key: 'platform', title: '所属云平台', width: 190, sortable: true, sortBy: (s) => s._p?.name || '', render: (s) => <PlatformCell platform={s._p} /> },
    { key: 'label', title: '接口', width: 220, sortable: true, render: (s) => <span className="text-[13px]">{s.label}</span> },
    { key: 'path', title: '请求路径', width: 330, sortable: true, render: (s) => (s.path ? <code className="text-[12px] text-fg-muted break-all">GET {s.path}</code> : <span className="text-fg-subtle">—</span>) },
    { key: 'ok', title: '结果', width: 80, sortable: true, sortBy: (s) => (s.ok ? 1 : 0), render: (s) => (s.ok ? <span className="tag-success">成功</span> : <span className="tag-danger">失败</span>) },
    { key: 'count', title: '条数', width: 80, sortable: true, align: 'right', render: (s) => <span className="tabular-nums text-[13px]">{s.count ?? 0}</span> },
    { key: 'durationMs', title: '耗时', width: 90, sortable: true, align: 'right', render: (s) => <span className="tabular-nums text-[13px]">{s.durationMs} ms</span> },
    { key: 'error', title: '错误信息', width: 360, render: (s) => <span className="text-[13px] text-danger break-all">{s.error || ''}</span> },
  ], []);
  return <MonTable columns={columns} rows={rows} plat={plat} allTotal={allTotal} keyFn={(s) => `${s._pid}|${s.key}`} initialKeyword={initialKeyword} placeholder="搜索平台 / 接口 / 错误信息" searchText={(s) => `${s._p?.name || ''} ${s._p?.consoleIp || ''} ${s.label} ${s.key} ${s.path || ''} ${s.error || ''} ${s.ok ? '成功' : '失败'}`} emptyTitle="尚未采集" exportSpec={EXPORT} />;
}
