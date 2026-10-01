import React, { useMemo } from 'react';
import DataTable from '../DataTable';
import SearchInput from '../SearchInput';
import { useClientTable } from '../../hooks/useClientTable';

/** 采集明细：各云平台最近一次采集调用的接口、结果、条数、耗时与错误（搜索 / 排序 / 分页） */
export default function StepsPanel({ platforms }) {
  const rows = useMemo(() => platforms.flatMap((p) => (p.steps || []).map((s) => ({ ...s, _k: `${p.id}-${s.key}`, platform: p.name }))), [platforms]);
  const columns = useMemo(() => [
    { key: 'platform', title: '所属云平台', width: 190, sortable: true, render: (s) => <span className="font-medium text-[13px]">{s.platform}</span> },
    { key: 'label', title: '接口', width: 200, sortable: true, render: (s) => <span className="text-[13px]">{s.label}</span> },
    { key: 'path', title: '请求路径', width: 330, sortable: true, render: (s) => <code className="text-[12px] text-fg-muted break-all">GET {s.path}</code> },
    { key: 'ok', title: '结果', width: 80, sortable: true, sortBy: (s) => (s.ok ? 1 : 0), render: (s) => (s.ok ? <span className="tag-success">成功</span> : <span className="tag-danger">失败</span>) },
    { key: 'count', title: '条数', width: 80, sortable: true, align: 'right', render: (s) => <span className="tabular-nums text-[13px]">{s.count}</span> },
    { key: 'durationMs', title: '耗时', width: 90, sortable: true, align: 'right', render: (s) => <span className="tabular-nums text-[13px]">{s.durationMs} ms</span> },
    { key: 'error', title: '错误信息', width: 360, render: (s) => <span className="text-[13px] text-danger break-all">{s.error || ''}</span> },
  ], []);
  const t = useClientTable({ rows, columns, searchText: (s) => `${s.platform} ${s.label} ${s.key} ${s.path} ${s.error || ''} ${s.ok ? '成功' : '失败'}`, initialSort: { key: 'platform', order: 'asc' } });
  return (
    <DataTable columns={columns} rows={t.pageRows} rowKey="_k" page={t.page} pageSize={t.pageSize} total={t.total} onPageChange={t.setPage} pageSizeOptions={[10, 20, 50, 100]} sort={t.sort} onSortChange={t.setSort}
      toolbar={<><h3 className="text-sm font-semibold text-fg mr-2">采集明细（第 6 章接口）</h3><SearchInput value={t.keyword} onChange={t.setKeyword} placeholder="搜索平台 / 接口 / 错误信息" width={260} /></>}
      empty={{ title: '尚未采集', description: '点击右上角「立即采集」或等待后台自动采集' }} />
  );
}
