import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import DataTable from '../../DataTable';
import Tooltip from '../../Tooltip';
import ConfirmModal from '../../ConfirmModal';
import PolicyModal from '../PolicyModal';
import { analyticsApi } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../hooks/useToast';
import { formatDateTime } from '../../../utils/format';
import { RES_LABEL } from '../util';

/** PolicyTab —— 运营分析 · 优化策略：内置 12 条（虚拟机侧 8 / 物理侧 4）可调阈值，另可新建自定义策略（名称 / 资源类型 / 范围 / 筛选条件 / 指标），保存后立即影响优化建议；openKind 指定时自动打开该策略的编辑框 */
export default function PolicyTab({ tick, openKind, onOpened, onSaved, keyword = '' }) {
  const canEdit = useCan('analytics:policy_update');
  const toast = useToast();
  const q = useAsync(() => analyticsApi.getPolicies(), [tick]);
  const [modal, setModal] = useState({ open: false, policy: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const all = q.data?.list || [];
  const kw = keyword.trim().toLowerCase();
  const list = kw ? all.filter((p) => `${p.name} ${RES_LABEL[p.resourceType] || ''} ${p.reason} ${p.scopeText}`.toLowerCase().includes(kw)) : all;
  useEffect(() => {
    if (openKind && canEdit && all.length) { setModal({ open: true, policy: all.find((p) => p.kind === openKind) || null }); onOpened?.(); }
  }, [openKind, all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setModal({ open: false, policy: null });
  const doDelete = async () => {
    setBusy(true);
    try { await analyticsApi.deletePolicy(del.kind); toast.success('策略已删除', del.name); setDel(null); q.reload(); onSaved?.(); }
    catch (e) { toast.error('删除失败', e.message); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'name', title: '策略名称', width: 190, render: (p) => <span className="font-medium">{p.name}{p.builtin && <span className="tag-default ml-2">内置</span>}{!p.enabled && <span className="tag-default ml-2">已停用</span>}</span> },
    { key: 'resourceType', title: '资源类型', width: 100, render: (p) => RES_LABEL[p.resourceType] || p.resourceType },
    { key: 'reason', title: '筛选条件', width: 480, render: (p) => <Tooltip content={p.reason}><span className="block max-w-[460px] truncate text-[13px] text-fg-muted">{p.reason}</span></Tooltip> },
    { key: 'scopeText', title: '范围', width: 150, render: (p) => <Tooltip content={p.scopeText}><span className="block max-w-[140px] truncate text-[13px] text-fg-muted">{p.scopeText}</span></Tooltip> },
    { key: 'updatedAt', title: '最近修改', width: 190, render: (p) => <span className="text-[13px] text-fg-muted">{p.updatedAt ? `${p.updatedBy} · ${formatDateTime(p.updatedAt)}` : '系统默认'}</span> },
    ...(canEdit ? [{ key: 'op', title: '操作', width: 100, sticky: 'right', render: (p) => (
      <span className="inline-flex">
        <button type="button" className="btn-ghost btn-icon" aria-label={`编辑${p.name}`} onClick={() => setModal({ open: true, policy: p })}><Pencil size={15} /></button>
        {!p.builtin && <button type="button" className="btn-ghost btn-icon" aria-label={`删除${p.name}`} onClick={() => setDel(p)}><Trash2 size={15} /></button>}
      </span>
    ) }] : []),
  ];
  return (
    <>
      <DataTable columns={columns} rows={list} rowKey="kind" loading={q.loading} refreshing={q.refreshing} error={q.error} onRetry={q.reload} empty={kw ? { title: '没有匹配的策略', description: '请调整全局搜索关键字' } : { title: '暂无策略' }}
        toolbar={<h3 className="text-sm font-semibold text-fg">优化策略</h3>}
        extra={canEdit && <button type="button" className="btn-primary" onClick={() => setModal({ open: true, policy: null })}><Plus size={15} /> 创建优化策略</button>} />
      <PolicyModal open={modal.open} policy={modal.policy} meta={q.data || {}} onClose={close} onSaved={() => { close(); q.reload(); onSaved?.(); }} onIgnored={onSaved} />
      <ConfirmModal open={!!del} danger title="删除优化策略" description={`确认删除策略「${del?.name || ''}」？`} impactList={['该策略的优化建议与忽略项将一并清除', '内置策略不可删除']} confirmText="删除" loading={busy} onConfirm={doDelete} onCancel={() => setDel(null)} />
    </>
  );
}
