import React, { useEffect, useState } from 'react';
import { Copy, Lock, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import ConfirmModal from '../components/ConfirmModal';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import LoadingButton from '../components/LoadingButton';
import Tooltip from '../components/Tooltip';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import RoleEditModal from '../components/role/RoleEditModal';
import { roleApi } from '../services/api';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import { useListQuery } from '../hooks/useListQuery';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { USER_STATUS } from '../data/dict';

const TYPE_OPTS = [{ value: 'builtin', label: '内置' }, { value: 'custom', label: '自定义' }];

/** RolesPage —— 角色管理：内置角色只读（仅可复制为新角色）/ 权限配置弹窗 / 角色下用户抽屉 */
export default function RolesPage() {
  const toast = useToast();
  const canCreate = useCan('role:create');
  const canUpdate = useCan('role:update');
  const canDelete = useCan('role:delete');
  const list = useListQuery('roles', roleApi.getRolePage, { page: 1, pageSize: 10, keyword: '', type: '' });
  const { query, setQuery, refreshing, reload } = list;
  const [edit, setEdit] = useState({ open: false, role: null, key: 0 });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState(null);
  const [copyF, setCopyF] = useState({ name: '', code: '' });
  const [copyErr, setCopyErr] = useState({});
  const [drawer, setDrawer] = useState({ role: null, users: null, loading: false });
  const [selected, setSelected] = useState([]);
  const [batchDel, setBatchDel] = useState(false);
  useEffect(() => setSelected([]), [query.page, query.pageSize, query.keyword, query.type]);
  const selRoles = list.rows.filter((r) => selected.includes(r.id));
  // 选中项含内置角色或仍有用户的角色时，批量删除置灰（后端同样会拒绝）
  const blockedReason = selRoles.some((r) => r.builtin) ? '选中项包含内置角色，不可删除' : selRoles.some((r) => r.userCount) ? '选中项包含仍有用户的角色，请先调整用户角色' : '';

  const openUsers = async (r) => {
    setDrawer({ role: r, users: null, loading: true });
    try { setDrawer({ role: r, users: await roleApi.getRoleUsers(r.id), loading: false }); } catch (e) { toast.error('加载失败', e.message); setDrawer({ role: null, users: null, loading: false }); }
  };
  const doDelete = async () => {
    setBusy(true);
    try {
      await roleApi.deleteRole(del.id); toast.success('角色已删除', del.name); setDel(null);
      // 当前页被删空时回到上一页
      if (list.rows.length <= 1 && query.page > 1) setQuery({ page: query.page - 1 }, { resetPage: false }); else reload();
    } catch (e) { toast.error('删除失败', e.message); } finally { setBusy(false); }
  };
  const doBatchDelete = async () => {
    setBusy(true);
    const ok = []; const fail = [];
    for (const r of selRoles) {
      try { await roleApi.deleteRole(r.id); ok.push(r); } catch (e) { fail.push(`${r.name}：${e.message}`); }
    }
    setBusy(false); setBatchDel(false); setSelected([]);
    if (ok.length) toast.success('角色已删除', `${ok.length} 个`);
    if (fail.length) toast.error(`${fail.length} 个角色删除失败`, fail.join('；'));
    if (ok.length >= list.rows.length && query.page > 1) setQuery({ page: query.page - 1 }, { resetPage: false }); else reload();
  };
  const doCopy = async () => {
    const e = {};
    if (!copyF.name.trim()) e.name = '请输入新角色名称';
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(copyF.code)) e.code = '编码为小写字母开头，可含数字与下划线';
    setCopyErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await roleApi.copyRole(copy.id, copyF); toast.success('已复制为新角色', copyF.name); setCopy(null); reload(); }
    catch (ex) { if (/编码/.test(ex.message)) setCopyErr({ code: ex.message }); else if (/名称/.test(ex.message)) setCopyErr({ name: ex.message }); else toast.error('复制失败', ex.message); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'name', title: '角色名称', width: 180, render: (r) => <button type="button" className="font-medium text-primary-text hover:underline text-left" onClick={() => setEdit({ open: true, role: r, key: Date.now() })}>{r.name}</button> },
    { key: 'code', title: '编码', width: 130, render: (r) => <code className="text-[13px] text-fg-muted">{r.code}</code> },
    { key: 'description', title: '描述', width: 300, render: (r) => <span className="text-fg-muted text-[13px]">{r.description || '-'}</span> },
    { key: 'userCount', title: '用户数', width: 90, render: (r) => <button type="button" className="tag-info hover:opacity-80" onClick={() => openUsers(r)} aria-label={`查看 ${r.name} 下的 ${r.userCount} 个用户`}><Users size={12} />{r.userCount}</button> },
    { key: 'builtin', title: '类型', width: 90, render: (r) => (r.builtin ? <span className="tag-warning"><Lock size={11} />内置</span> : <span className="tag-default">自定义</span>) },
    { key: 'op', title: '操作', width: 170, sticky: 'right', render: (r) => (
      <div className="flex items-center gap-0.5">
        {canUpdate && <Tooltip content={r.builtin ? '内置角色不可裁剪，请复制为新角色' : ''}><span><button type="button" disabled={r.builtin} className="btn-icon !w-8 !h-8 disabled:opacity-40 disabled:cursor-not-allowed" aria-label={r.builtin ? '内置角色不可编辑' : `编辑 ${r.name}`} title={r.builtin ? undefined : '编辑权限'} onClick={() => setEdit({ open: true, role: r, key: Date.now() })}><Pencil size={15} /></button></span></Tooltip>}
        {canCreate && <button type="button" className="btn-icon !w-8 !h-8" aria-label={`复制 ${r.name} 为新角色`} title="复制为新角色" onClick={() => { setCopy(r); setCopyF({ name: `${r.name}（副本）`, code: `${r.code}_copy` }); setCopyErr({}); }}><Copy size={15} /></button>}
        {canDelete && <Tooltip content={r.builtin ? '内置角色不可删除' : r.userCount ? `该角色下仍有 ${r.userCount} 个用户` : ''}><span><button type="button" disabled={r.builtin} className="btn-icon !w-8 !h-8 hover:!text-danger disabled:opacity-40 disabled:cursor-not-allowed" aria-label={r.builtin ? '内置角色不可删除' : `删除 ${r.name}`} title={r.builtin ? undefined : '删除'} onClick={() => setDel(r)}><Trash2 size={15} /></button></span></Tooltip>}
      </div>) },
  ];
  return (
    <div>
      <PageHeader title="角色管理" description="功能权限（菜单 + 按钮）与数据权限（平台 / 集群 / 资源）；内置角色仅可复制后调整" actions={<>
        <button type="button" className="btn-default" onClick={reload}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> 刷新</button>
        {canCreate && <button type="button" className="btn-primary" onClick={() => setEdit({ open: true, role: null, key: Date.now() })}><Plus size={16} /> 新增角色</button>}
      </>} />
      <DataTable columns={columns} rows={list.rows} rowKey="id" loading={list.loading} refreshing={refreshing} error={list.error} onRetry={reload} empty={{ title: '暂无角色' }}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })}
        selectable={canDelete} selected={selected} onSelectedChange={setSelected}
        selectionBar={canDelete && <Tooltip content={blockedReason}><span><button type="button" disabled={!!blockedReason} className="btn-default btn-sm !text-danger disabled:opacity-40" onClick={() => setBatchDel(true)}><Trash2 size={14} /> 批量删除</button></span></Tooltip>}
        toolbar={<>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder="搜索角色名称 / 编码 / 描述" width={280} />
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="类型" aria-label="角色类型" value={query.type} onChange={(type) => setQuery({ type })} options={TYPE_OPTS} /></div>
        </>} />
      {edit.open && <RoleEditModal key={edit.key} open role={edit.role} onClose={() => setEdit({ open: false, role: null, key: 0 })} onSaved={() => { setEdit({ open: false, role: null, key: 0 }); reload(); }} />}

      <Modal open={!!copy} width={440} title={`复制角色：${copy?.name || ''}`} subtitle="复制其全部功能权限与数据权限，生成可编辑的自定义角色" onClose={() => setCopy(null)}
        footer={<><button type="button" className="btn-default" onClick={() => setCopy(null)}>取消</button><LoadingButton variant="primary" loading={busy} onClick={doCopy}>创建副本</LoadingButton></>}>
        <div className="space-y-4">
          <FormField label="新角色名称" required error={copyErr.name}><input className="field" value={copyF.name} onChange={(e) => setCopyF((s) => ({ ...s, name: e.target.value }))} /></FormField>
          <FormField label="新角色编码" required error={copyErr.code}><input className="field" value={copyF.code} onChange={(e) => setCopyF((s) => ({ ...s, code: e.target.value }))} /></FormField>
        </div>
      </Modal>
      <ConfirmModal open={!!del} danger title={`删除角色「${del?.name || ''}」？`} description="此操作不可恢复。" targets={del ? [del.name] : []} impactList={del?.userCount ? [`该角色下仍有 ${del.userCount} 个用户，后端将拒绝删除，请先调整用户角色`] : ['已无用户使用该角色，删除后其权限配置一并移除']} confirmText="确认删除" loading={busy} onCancel={() => setDel(null)} onConfirm={doDelete} />
      <ConfirmModal open={batchDel} danger title={`删除 ${selRoles.length} 个角色？`} description="此操作不可恢复。" targets={selRoles.map((r) => r.name)} impactList={['角色及其功能权限、数据权限配置一并移除', '已无用户使用这些角色']} confirmText="确认删除" loading={busy} onCancel={() => setBatchDel(false)} onConfirm={doBatchDelete} />
      <Drawer open={!!drawer.role} title={`角色用户：${drawer.role?.name || ''}`} subtitle={`共 ${drawer.users?.length ?? '…'} 个用户`} width={480} onClose={() => setDrawer({ role: null, users: null, loading: false })}>
        {drawer.loading ? <Skeleton.Table rows={5} cols={2} /> : !drawer.users?.length ? <EmptyState compact title="该角色下暂无用户" /> : (
          <ul className="divide-y divide-line rounded-lg border border-line">{drawer.users.map((u) => (
            <li key={u.id} className="px-4 py-3 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-primary-soft text-primary-text flex items-center justify-center text-sm font-semibold">{u.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-fg">{u.name} <span className="text-fg-muted font-normal">@{u.username}</span></div><div className="text-xs text-fg-muted truncate">{u.department || '-'} · {u.email || '-'}</div></div>
              <span className={USER_STATUS[u.status]?.tag}>{USER_STATUS[u.status]?.label}</span>
            </li>))}</ul>
        )}
      </Drawer>
    </div>
  );
}
