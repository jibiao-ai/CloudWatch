import React, { useEffect, useState } from 'react';
import { Ban, CircleCheck, KeyRound, LockOpen, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import ExportButton from '../components/ExportButton';
import ConfirmModal from '../components/ConfirmModal';
import Tooltip from '../components/Tooltip';
import UserFormModal from '../components/user/UserFormModal';
import PasswordRevealModal from '../components/user/PasswordRevealModal';
import { userApi, roleApi } from '../services/api';
import { useListQuery } from '../hooks/useListQuery';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store/useStore';
import { USER_SOURCES, USER_STATUS } from '../data/dict';
import { formatDateTime, fromNow } from '../utils/format';

const STATUS_OPTS = Object.entries(USER_STATUS).map(([value, v]) => ({ value, label: v.label }));

/** UsersPage —— 用户管理：搜索/筛选/分页/排序、新增编辑、重置密码（一次性展示）、启用禁用解锁、删除（单个/批量）、导出 */
export default function UsersPage() {
  const toast = useToast();
  const me = useStore((s) => s.user);
  const [roles, setRoles] = useState([]);
  const canCreate = useCan('user:create');
  const canUpdate = useCan('user:update');
  const canToggle = useCan('user:toggle');
  const canUnlock = useCan('user:unlock');
  const canDelete = useCan('user:delete');
  const canReset = useCan('user:reset_password');
  const canExport = useCan('user:export');
  const list = useListQuery('users', userApi.getUserList, { page: 1, pageSize: 10, keyword: '', status: '', roleId: '', sort: null });
  const { query, setQuery } = list;
  const [form, setForm] = useState({ open: false, user: null, key: 0 });
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null); // {type:'reset'|'toggle'|'batch'|'delete', users, next}
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(null);

  useEffect(() => { roleApi.getRoleList().then(setRoles).catch(() => {}); }, []);
  useEffect(() => setSelected([]), [query.page, query.pageSize, query.keyword, query.status, query.roleId]);

  // 「最后一个超管」前端提前置灰（后端仍会校验）
  const superRoleIds = roles.filter((r) => r.permissions.includes('*')).map((r) => r.id);
  const isSuper = (u) => u.roleIds.some((id) => superRoleIds.includes(id));
  const activeSupers = list.rows.filter((u) => u.status === 'active' && isSuper(u));
  const disableReason = (u) => (u.id === me.id ? '不能禁用自己' : isSuper(u) && u.status === 'active' && activeSupers.length <= 1 ? '不能禁用最后一个超级管理员' : '');
  const deleteReason = (u) => (u.id === me.id ? '不能删除自己' : isSuper(u) && u.status === 'active' && activeSupers.length <= 1 ? '不能删除最后一个超级管理员' : '');
  const params = { ...query, sortKey: query.sort?.key, sortOrder: query.sort?.order };

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.type === 'reset') {
        const r = await userApi.resetUserPassword(confirm.users[0].id);
        setReveal({ title: '密码已重置', username: confirm.users[0].username, password: r.password });
      } else if (confirm.type === 'delete') {
        const ids = confirm.users.map((u) => u.id);
        if (ids.length === 1) await userApi.deleteUser(ids[0]); else await userApi.deleteUsers(ids);
        toast.success('已删除', `${ids.length} 个用户`);
        setSelected([]);
        // 当前页被删空时回到上一页
        if (ids.length >= list.rows.length && query.page > 1) setQuery({ page: query.page - 1 }, { resetPage: false });
      } else {
        await userApi.setUserStatus(confirm.users.map((u) => u.id), confirm.next);
        toast.success(confirm.next === 'active' ? '已启用' : '已禁用', `${confirm.users.length} 个用户`);
        setSelected([]);
      }
      setConfirm(null);
      list.reload();
    } catch (e) { toast.error('操作失败', e.message); }
    finally { setBusy(false); }
  };
  const unlock = async (u) => { try { await userApi.unlockUser(u.id); toast.success('已解锁', u.username); list.reload(); } catch (e) { toast.error('解锁失败', e.message); } };

  const columns = [
    { key: 'username', title: '用户名', width: 130, sortable: true, render: (u) => <span className="font-medium">{u.username}</span> },
    { key: 'name', title: '姓名', width: 90 },
    { key: 'email', title: '邮箱', width: 190, render: (u) => <span className="text-fg-muted text-[13px]">{u.email || '-'}</span> },
    { key: 'department', title: '部门', width: 120, render: (u) => u.department || '-' },
    { key: 'source', title: '来源', width: 80, render: (u) => <span className="tag-default">{USER_SOURCES.find((s) => s.value === u.source)?.label}</span> },
    { key: 'roles', title: '角色', width: 190, render: (u) => <div className="flex flex-wrap gap-1">{u.roleNames.map((r) => <span key={r} className="tag-primary">{r}</span>)}</div> },
    { key: 'status', title: '状态', width: 90, render: (u) => <Tooltip content={u.status === 'locked' ? `锁定至 ${formatDateTime(u.lockedUntil, false)}` : u.mustChangePassword ? '需在下次登录时修改密码' : ''}><span className={USER_STATUS[u.status]?.tag}>{USER_STATUS[u.status]?.label}</span></Tooltip> },
    { key: 'lastLoginAt', title: '最后登录', width: 120, sortable: true, render: (u) => <span className="text-fg-muted text-[13px]" title={formatDateTime(u.lastLoginAt)}>{u.lastLoginAt ? fromNow(u.lastLoginAt) : '从未登录'}</span> },
    { key: 'op', title: '操作', width: 250, sticky: 'right', render: (u) => {
      const reason = disableReason(u);
      return (
        <div className="flex items-center gap-0.5">
          {canUpdate && <button type="button" className="btn-icon !w-8 !h-8" aria-label={`编辑 ${u.username}`} title="编辑" onClick={() => setForm({ open: true, user: u, key: Date.now() })}><Pencil size={15} /></button>}
          {canReset && <button type="button" className="btn-icon !w-8 !h-8" aria-label={`重置 ${u.username} 的密码`} title="重置密码" onClick={() => setConfirm({ type: 'reset', users: [u] })}><KeyRound size={15} /></button>}
          {canUnlock && u.status === 'locked' && <button type="button" className="btn-icon !w-8 !h-8 !text-warning" aria-label={`解锁 ${u.username}`} title="解锁" onClick={() => unlock(u)}><LockOpen size={15} /></button>}
          {canToggle && (u.status === 'disabled'
            ? <button type="button" className="btn-icon !w-8 !h-8 !text-success" aria-label={`启用 ${u.username}`} title="启用" onClick={() => setConfirm({ type: 'toggle', users: [u], next: 'active' })}><CircleCheck size={15} /></button>
            : <Tooltip content={reason}><span><button type="button" disabled={!!reason} className="btn-icon !w-8 !h-8 disabled:opacity-40 disabled:cursor-not-allowed" aria-label={reason ? `${reason}` : `禁用 ${u.username}`} title={reason ? undefined : '禁用'} onClick={() => setConfirm({ type: 'toggle', users: [u], next: 'disabled' })}><Ban size={15} /></button></span></Tooltip>)}
          {canDelete && (() => { const dr = deleteReason(u); return <Tooltip content={dr}><span><button type="button" disabled={!!dr} className="btn-icon !w-8 !h-8 !text-danger disabled:opacity-40 disabled:cursor-not-allowed" aria-label={dr || `删除 ${u.username}`} title={dr ? undefined : '删除'} onClick={() => setConfirm({ type: 'delete', users: [u] })}><Trash2 size={15} /></button></span></Tooltip>; })()}
        </div>);
    } },
  ];
  const selUsers = list.rows.filter((u) => selected.includes(u.id));
  const batchBlocked = (next) => next === 'disabled' && selUsers.some((u) => disableReason(u));
  const deleteBlocked = selUsers.some((u) => deleteReason(u)) || (activeSupers.length > 0 && activeSupers.every((s) => selected.includes(s.id)));
  const c = confirm;
  return (
    <div>
      <PageHeader title="用户管理" description="维护平台账号、角色与状态；密码重置后仅一次性展示" actions={<>
        <button type="button" className="btn-default" onClick={list.reload}><RefreshCw size={15} className={list.refreshing ? 'animate-spin' : ''} /> 刷新</button>
        {canCreate && <button type="button" className="btn-primary" onClick={() => setForm({ open: true, user: null, key: Date.now() })}><Plus size={16} /> 新增用户</button>}
      </>} />
      <DataTable columns={columns} rows={list.rows} rowKey="id" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })}
        sort={query.sort} onSortChange={(sort) => setQuery({ sort })}
        selectable={canToggle || canDelete} selected={selected} onSelectedChange={setSelected}
        selectionBar={<>
          {canToggle && <button type="button" className="btn-default btn-sm" onClick={() => setConfirm({ type: 'batch', users: selUsers, next: 'active' })}><CircleCheck size={14} /> 批量启用</button>}
          {canToggle && <Tooltip content={batchBlocked('disabled') ? '选中项包含不可禁用的账号（自己或最后一个超级管理员）' : ''}><span><button type="button" className="btn-default btn-sm disabled:opacity-40" disabled={batchBlocked('disabled')} onClick={() => setConfirm({ type: 'batch', users: selUsers, next: 'disabled' })}><Ban size={14} /> 批量禁用</button></span></Tooltip>}
          {canDelete && <Tooltip content={deleteBlocked ? '选中项包含不可删除的账号（自己或最后一个超级管理员）' : ''}><span><button type="button" className="btn-default btn-sm !text-danger disabled:opacity-40" disabled={deleteBlocked} onClick={() => setConfirm({ type: 'delete', users: selUsers })}><Trash2 size={14} /> 批量删除</button></span></Tooltip>}
        </>}
        toolbar={<>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder="搜索用户名 / 姓名 / 邮箱 / 部门" width={280} />
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="状态" aria-label="状态" value={query.status} onChange={(status) => setQuery({ status })} options={STATUS_OPTS} /></div>
          <div className="w-[160px]"><CustomSelect size="sm" clearable placeholder="角色" aria-label="角色" value={query.roleId} onChange={(roleId) => setQuery({ roleId })} options={roles.map((r) => ({ value: r.id, label: r.name }))} /></div>
        </>}
        extra={canExport && <ExportButton fn={userApi.exportUsers} params={params} title="用户列表" filters={{ 关键字: query.keyword, 状态: query.status, 角色: roles.find((r) => r.id === query.roleId)?.name }} />}
        empty={{ title: '没有符合条件的用户', description: '尝试调整搜索关键字或筛选条件' }} />

      {form.open && <UserFormModal key={form.key} open user={form.user} roles={roles} onClose={() => setForm({ open: false, user: null, key: 0 })}
        onSaved={(u, created) => { setForm({ open: false, user: null, key: 0 }); list.reload(); if (created) setReveal({ title: '用户已创建', username: u.username, password: u.initialPassword }); }} />}
      {reveal && <PasswordRevealModal open {...reveal} onClose={() => setReveal(null)} />}

      <ConfirmModal open={!!c} danger={c?.type === 'reset' || c?.type === 'delete' || c?.next === 'disabled'}
        title={c?.type === 'delete' ? (c.users.length === 1 ? `删除用户「${c.users[0].username}」？` : `删除 ${c.users.length} 个用户？`) : c?.type === 'reset' ? `重置「${c.users[0].username}」的密码？` : c?.next === 'active' ? `启用 ${c?.users.length} 个用户？` : `禁用 ${c?.users.length} 个用户？`}
        description={c?.type === 'delete' ? '删除后账号无法恢复，如只是暂时停用请使用「禁用」。此操作不可撤销。' : c?.type === 'reset' ? '系统将生成随机密码并仅展示一次，同时强制该用户下次登录修改密码。' : c?.next === 'active' ? '启用后账号可正常登录。' : '禁用后账号将立即无法登录，已登录会话在下次请求时失效。'}
        targets={c?.users.map((u) => `${u.name}（${u.username}）`) || []}
        impactList={c?.type === 'delete' ? ['用户账号及其角色绑定被永久删除', '该用户的登录会话立即失效', '已产生的审计日志予以保留'] : c?.type === 'reset' ? ['原密码立即失效', '该用户已有登录会话将被要求重新登录'] : c?.next === 'disabled' ? ['账号无法登录', '不删除用户数据与审计记录'] : []}
        confirmText={c?.type === 'delete' ? '确认删除' : c?.type === 'reset' ? '确认重置' : c?.next === 'active' ? '确认启用' : '确认禁用'} loading={busy} onCancel={() => setConfirm(null)} onConfirm={run} />
    </div>
  );
}
