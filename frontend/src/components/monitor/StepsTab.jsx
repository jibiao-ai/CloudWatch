import React, { useMemo } from 'react';
import MonTable from './MonTable';
import { PlatformCell } from './cells';

/** StepsTab —— 采集明细：表头与「资产管理 · 采集明细」一致（所属云平台 / 接口 / 请求路径 / 结果 / 条数 / 耗时 / 错误信息）；可搜索 / 排序 / 分页 */
export default function StepsTab({ snap, platform, initialKeyword }) {
  const columns = useMemo(() => [
    { key: 'platform', title: '所属云平台', width: 190, sortable: true, sortBy: () => platform?.name || '', render: () => <PlatformCell platform={platform} /> },
    { key: 'label', title: '接口', width: 220, sortable: true, render: (s) => <span className="text-[13px]">{s.label}</span> },
    { key: 'path', title: '请求路径', width: 330, sortable: true, render: (s) => (s.path ? <code className="text-[12px] text-fg-muted break-all">GET {s.path}</code> : <span className="text-fg-subtle">—</span>) },
    { key: 'ok', title: '结果', width: 80, sortable: true, sortBy: (s) => (s.ok ? 1 : 0), render: (s) => (s.ok ? <span className="tag-success">成功</span> : <span className="tag-danger">失败</span>) },
    { key: 'count', title: '条数', width: 80, sortable: true, align: 'right', render: (s) => <span className="tabular-nums text-[13px]">{s.count ?? 0}</span> },
    { key: 'durationMs', title: '耗时', width: 90, sortable: true, align: 'right', render: (s) => <span className="tabular-nums text-[13px]">{s.durationMs} ms</span> },
    { key: 'error', title: '错误信息', width: 360, render: (s) => <span className="text-[13px] text-danger break-all">{s.error || ''}</span> },
  ], [platform]);
  return <MonTable columns={columns} rows={snap.steps} keyFn={(s) => s.key} initialKeyword={initialKeyword} placeholder="搜索平台 / 接口 / 错误信息" searchText={(s) => `${platform?.name || ''} ${platform?.consoleIp || ''} ${s.label} ${s.key} ${s.path || ''} ${s.error || ''} ${s.ok ? '成功' : '失败'}`} emptyTitle="尚未采集" />;
}
