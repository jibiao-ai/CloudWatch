import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Pencil } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingButton from '../components/LoadingButton';
import DataTable from '../components/DataTable';
import Tooltip from '../components/Tooltip';
import PolicyModal from '../components/analytics/PolicyModal';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { formatDateTime } from '../utils/format';

/** AnalyticsPolicyPage —— 运营分析 · 优化策略：升配 / 降配 / 回收的判定条件，保存后立即影响优化建议 */
export default function AnalyticsPolicyPage() {
  const canEdit = useCan('analytics:policy_update');
  const [sp, setSp] = useSearchParams();
  const q = useAsync(() => analyticsApi.getPolicies(), []);
  const [editing, setEditing] = useState(null);
  const list = q.data?.list || [];
  // 从「云主机优化」卡片的设置图标跳转而来时，直接打开对应策略的编辑框
  useEffect(() => {
    const k = sp.get('kind');
    if (k && canEdit && list.length) { setEditing(list.find((p) => p.kind === k) || null); setSp({}, { replace: true }); }
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns = [
    { key: 'name', title: '策略名称', width: 160, render: (p) => <span className="font-medium">{p.name}{!p.enabled && <span className="tag-default ml-2">已停用</span>}</span> },
    { key: 'reason', title: '建议原因', width: 560, render: (p) => <Tooltip content={p.reason}><span className="block max-w-[540px] truncate text-[13px] text-fg-muted">{p.reason}</span></Tooltip> },
    { key: 'scope', title: '优化范围', width: 110 },
    { key: 'updatedAt', title: '最近修改', width: 190, render: (p) => <span className="text-[13px] text-fg-muted">{p.updatedAt ? `${p.updatedBy} · ${formatDateTime(p.updatedAt)}` : '系统默认'}</span> },
    ...(canEdit ? [{ key: 'op', title: '操作', width: 80, sticky: 'right', render: (p) => <button type="button" className="btn-ghost btn-icon" aria-label={`编辑${p.name}`} onClick={() => setEditing(p)}><Pencil size={15} /></button> }] : []),
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="运营分析 · 优化策略" description="定义「建议升配 / 建议降配 / 建议回收」的判定条件与统计周期；保存后立即生效，并反映到总览与云主机优化"
        actions={<LoadingButton icon={RefreshCw} loading={q.refreshing} onClick={q.reload}>刷新</LoadingButton>} />
      <DataTable columns={columns} rows={list} rowKey="kind" loading={q.loading} refreshing={q.refreshing} error={q.error} onRetry={q.reload} empty={{ title: '暂无策略' }} />
      <PolicyModal policy={editing} fields={q.data?.fields || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); q.reload(); }} />
    </div>
  );
}
