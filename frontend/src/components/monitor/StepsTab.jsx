import React, { useMemo } from 'react';
import MonTable from './MonTable';

/** StepsTab —— 采集明细：每次采集调用的接口、结果、耗时与错误；可搜索 / 排序 / 分页 */
export default function StepsTab({ snap, initialKeyword }) {
  const columns = useMemo(() => [
    { key: 'label', title: '接口', width: 280, sortable: true, render: (s) => <span className="font-medium">{s.label}</span> },
    { key: 'key', title: '标识', width: 150, sortable: true, render: (s) => <code className="text-[13px] text-fg-muted">{s.key}</code> },
    { key: 'ok', title: '结果', width: 90, sortable: true, sortBy: (s) => (s.ok ? 1 : 0), render: (s) => (s.ok ? <span className="tag-success">成功</span> : <span className="tag-danger">失败</span>) },
    { key: 'durationMs', title: '耗时', width: 100, sortable: true, align: 'right', render: (s) => <span className="tabular-nums">{s.durationMs} ms</span> },
    { key: 'error', title: '错误信息', width: 420, render: (s) => <span className="text-[13px] text-danger break-all">{s.error || ''}</span> },
  ], []);
  return <MonTable columns={columns} rows={snap.steps} keyFn={(s) => s.key} initialKeyword={initialKeyword} placeholder="搜索接口名称 / 错误信息" searchText={(s) => `${s.label} ${s.key} ${s.error || ''} ${s.ok ? '成功' : '失败'}`} emptyTitle="尚未采集" />;
}
