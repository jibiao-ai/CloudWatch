import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import DataTable from '../../DataTable';
import Tooltip from '../../Tooltip';
import PolicyModal from '../PolicyModal';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';
import { useCan } from '../../../hooks/useCan';
import { formatDateTime } from '../../../utils/format';

/** PolicyTab —— 运营分析 · 优化策略：僵尸型 / 资源过剩 / 资源不足 / 长期关机的判定条件，保存后立即影响优化建议；openKind 指定时自动打开该策略的编辑框 */
export default function PolicyTab({ tick, openKind, onOpened, onSaved }) {
  const canEdit = useCan('analytics:policy_update');
  const q = useAsync(() => analyticsApi.getPolicies(), [tick]);
  const [editing, setEditing] = useState(null);
  const list = q.data?.list || [];
  useEffect(() => {
    if (openKind && canEdit && list.length) { setEditing(list.find((p) => p.kind === openKind) || null); onOpened?.(); }
  }, [openKind, list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns = [
    { key: 'name', title: '策略名称', width: 160, render: (p) => <span className="font-medium">{p.name}{!p.enabled && <span className="tag-default ml-2">已停用</span>}</span> },
    { key: 'reason', title: '建议原因', width: 560, render: (p) => <Tooltip content={p.reason}><span className="block max-w-[540px] truncate text-[13px] text-fg-muted">{p.reason}</span></Tooltip> },
    { key: 'scope', title: '优化范围', width: 110 },
    { key: 'updatedAt', title: '最近修改', width: 190, render: (p) => <span className="text-[13px] text-fg-muted">{p.updatedAt ? `${p.updatedBy} · ${formatDateTime(p.updatedAt)}` : '系统默认'}</span> },
    ...(canEdit ? [{ key: 'op', title: '操作', width: 80, sticky: 'right', render: (p) => <button type="button" className="btn-ghost btn-icon" aria-label={`编辑${p.name}`} onClick={() => setEditing(p)}><Pencil size={15} /></button> }] : []),
  ];
  return (
    <>
      <DataTable columns={columns} rows={list} rowKey="kind" loading={q.loading} refreshing={q.refreshing} error={q.error} onRetry={q.reload} empty={{ title: '暂无策略' }}
        toolbar={<h3 className="text-sm font-semibold text-fg">优化策略</h3>} />
      <PolicyModal policy={editing} fields={q.data?.fields || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); q.reload(); onSaved?.(); }} />
    </>
  );
}
