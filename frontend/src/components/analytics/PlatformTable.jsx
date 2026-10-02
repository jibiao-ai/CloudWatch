import React, { useMemo } from 'react';
import DataTable from '../DataTable';
import SearchInput from '../SearchInput';
import StatusDot from '../StatusDot';
import { PlatCell, numCell } from '../capacity/capUtil';
import { useClientTable } from '../../hooks/useClientTable';
import { formatDateTime, fromNow } from '../../utils/format';

/** PlatformTable —— 各所属云平台的资源数量与资产采集状态（搜索 / 排序 / 分页，列风格同资产管理「总览」） */
export default function PlatformTable({ platforms }) {
  const columns = useMemo(() => [
    { key: 'name', title: '所属云平台', width: 200, sortable: true, render: (p) => <PlatCell platform={p} /> },
    { key: 'state', title: '采集状态', width: 120, sortable: true, sortBy: (p) => (p.collectedAt ? (p.ok ? 2 : 1) : 0), render: (p) => <StatusDot status={p.collectedAt ? (p.ok ? 'online' : 'warning') : 'unknown'} label={p.collectedAt ? (p.ok ? '正常' : '部分失败') : '未采集'} /> },
    { key: 'collectedAt', title: '最近采集', width: 160, sortable: true, render: (p) => <span className="text-[13px] tabular-nums" title={p.collectedAt ? fromNow(p.collectedAt) : ''}>{p.collectedAt ? formatDateTime(p.collectedAt) : '—'}</span> },
    { key: 'vms', title: '云主机', width: 90, sortable: true, align: 'right', render: (p) => numCell(p.vms) },
    { key: 'disks', title: '磁盘', width: 90, sortable: true, align: 'right', render: (p) => numCell(p.disks) },
    { key: 'hosts', title: '宿主机', width: 90, sortable: true, align: 'right', render: (p) => numCell(p.hosts) },
    { key: 'pools', title: '存储器', width: 90, sortable: true, align: 'right', render: (p) => numCell(p.pools) },
    { key: 'error', title: '采集错误', width: 320, render: (p) => <span className="text-[13px] text-danger break-all">{p.error || ''}</span> },
  ], []);
  const t = useClientTable({ rows: platforms, columns, searchText: (p) => `${p.name} ${p.consoleIp} ${p.envType} ${p.error || ''}`, initialSort: { key: 'name', order: 'asc' } });
  return (
    <DataTable columns={columns} rows={t.pageRows} rowKey="providerId" page={t.page} pageSize={t.pageSize} total={t.total} onPageChange={t.setPage} pageSizeOptions={[10, 20, 50, 100]}
      sort={t.sort} onSortChange={t.setSort}
      toolbar={<><h3 className="text-sm font-semibold text-fg mr-2">各云平台资源汇总</h3><SearchInput value={t.keyword} onChange={t.setKeyword} placeholder="搜索平台名称 / 控制台 IP" width={260} /></>}
      empty={{ title: '暂无已对接的云平台', description: '请先在「平台管理」中新增并验证平台' }} />
  );
}
