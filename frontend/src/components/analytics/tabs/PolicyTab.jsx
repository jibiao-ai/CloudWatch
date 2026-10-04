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
import TabExport from '../TabExport';

/** PolicyTab —— 运营中心 · 优化策略：内置 11 条（虚拟机侧 7 / 物理侧 4）可调阈值，另可新建自定义策略；自定义策略支持勾选后批量删除（内置策略不可勾选）（名称 / 资源类型 / 范围 / 筛选条件 / 指标），保存后立即影响优化建议；openKind 指定时自动打开该策略的编辑框 */
export default function PolicyTab({ tick, openKind, onOpened, onSaved, keyword = '' }) {
  const canEdit = useCan('analytics:policy_update');
  const toast = useToast();
  const q = useAsync(() => analyticsApi.getPolicies(), [tick]);
  const [modal, setModal] = useState({ open: false, policy: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState([]);
  const [batchDel, setBatchDel] = useState(false);
  const all = q.data?.list || [];
  const kw = keyword.trim().toLowerCase();
  const [pg, setPg] = useState({ page: 1, pageSize: 10 });
  const matched = kw ? all.filter((p) => `${p.name} ${RES_LABEL[p.resourceType] || ''} ${p.reason} ${p.scopeText}`.toLowerCase().includes(kw)) : all;
  // 前端分页（与优化建议列表一致：默认每页 10 条）；筛选 / 删除后页码越界时回到最后一页
  const maxPage = Math.max(1, Math.ceil(matched.length / pg.pageSize));
  const page = Math.min(pg.page, maxPage);
  const list = matched.slice((page - 1) * pg.pageSize, page * pg.pageSize);
  useEffect(() => setPg((x) => (x.page === 1 ? x : { ...x, page: 1 })), [kw]);
  useEffect(() => {
    if (openKind && canEdit && all.length) { setModal({ open: true, policy: all.find((p) => p.kind === openKind) || null }); onOpened?.(); }
  }, [openKind, all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setModal({ open: false, policy: null });
  const doDelete = async () => {
    setBusy(true);
    try { await analyticsApi.deletePolicy(del.kind); toast.success('策略已删除', del.name); setDel(null); q.reload(); onSaved?.(); }
    catch (e) { toast.error('删除失败', e.message); } finally { setBusy(false); }
  };
  const doBatchDelete = async () => {
    setBusy(true);
    try { const r = await analyticsApi.batchDeletePolicies(sel); toast.success('批量删除成功', `已删除 ${r?.count ?? sel.length} 条策略`); setSel([]); setBatchDel(false); q.reload(); onSaved?.(); }
    catch (e) { toast.error('批量删除失败', e.message); } finally { setBusy(false); }
  };
  const selPolicies = all.filter((p) => sel.includes(p.kind));
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
      <DataTable columns={columns} rows={list} rowKey="kind" loading={q.loading} refreshing={q.refreshing} error={q.error} onRetry={q.reload}
        selectable={canEdit} selected={sel} onSelectedChange={setSel} isRowSelectable={(p) => !p.builtin}
        selectionBar={<button type="button" className="btn-default btn-sm text-danger" onClick={() => setBatchDel(true)}><Trash2 size={14} /> 批量删除（{sel.length}）</button>}
        page={page} pageSize={pg.pageSize} total={matched.length} onPageChange={(p) => setPg((x) => ({ ...x, ...p }))} empty={kw ? { title: '没有匹配的策略', description: '请调整全局搜索关键字' } : { title: '暂无策略' }}
        toolbar={<h3 className="text-sm font-semibold text-fg">优化策略</h3>}
        extra={<>
          <TabExport kind="policy" title="优化策略" />
          {canEdit && <button type="button" className="btn-primary" onClick={() => setModal({ open: true, policy: null })}><Plus size={15} /> 创建优化策略</button>}
        </>} />
      <PolicyModal open={modal.open} policy={modal.policy} meta={q.data || {}} onClose={close} onSaved={() => { close(); q.reload(); onSaved?.(); }} onIgnored={onSaved} />
      <ConfirmModal open={!!del} danger title="删除优化策略" description={`确认删除策略「${del?.name || ''}」？`} impactList={['该策略的优化建议与忽略项将一并清除', '内置策略不可删除']} confirmText="删除" loading={busy} onConfirm={doDelete} onCancel={() => setDel(null)} />
      <ConfirmModal open={batchDel} danger title="批量删除优化策略" description={`确认删除选中的 ${selPolicies.length} 条策略？`} targets={selPolicies.map((p) => p.name)} impactList={['这些策略的优化建议与忽略项将一并清除', '内置策略不可删除，因此不可勾选']} confirmText="批量删除" loading={busy} onConfirm={doBatchDelete} onCancel={() => setBatchDel(false)} />
    </>
  );
}
