import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import Tabs from '../Tabs';
import FormField from '../FormField';
import LoadingButton from '../LoadingButton';
import PermissionTree from './PermissionTree';
import DataScopeEditor from './DataScopeEditor';
import Skeleton from '../Skeleton';
import { roleApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';

/** RoleEditModal —— 角色基本信息 + 权限配置弹窗（Tab：① 功能权限 ② 数据权限）。内置角色只读（提示「复制为新角色」） */
export default function RoleEditModal({ open, role, onClose, onSaved }) {
  const editing = !!role?.id;
  const readOnly = !!role?.builtin;
  const toast = useToast();
  const [tab, setTab] = useState('func');
  const [f, setF] = useState(() => ({ name: role?.name || '', code: role?.code || '', description: role?.description || '', permissions: role?.permissions || [], dataScopes: role?.dataScopes || [] }));
  const [tree, setTree] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState(false);
  useEffect(() => { roleApi.getScopeTree().then(setTree).catch(() => setTree({ providers: [] })); }, []);
  const set = (k, v) => { setDirty(true); setF((s) => ({ ...s, [k]: v })); };

  const submit = async () => {
    const e = {};
    if (!f.name.trim()) e.name = '请输入角色名称';
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(f.code)) e.code = '编码为小写字母开头，可含数字与下划线（2~32 位）';
    setErr(e);
    if (Object.keys(e).length) { setTab('func'); return; }
    setBusy(true);
    try {
      const body = { ...f, name: f.name.trim() };
      const res = editing ? await roleApi.updateRole(role.id, body) : await roleApi.createRole(body);
      toast.success(editing ? '角色已更新' : '角色已创建', res.name);
      onSaved(res);
    } catch (ex) {
      if (/编码/.test(ex.message)) setErr({ code: ex.message }); else if (/名称/.test(ex.message)) setErr({ name: ex.message }); else toast.error('保存失败', ex.message);
    } finally { setBusy(false); }
  };
  const close = () => (dirty && !busy ? setLeave(true) : onClose());
  return (
    <>
      <Modal open={open} width={860} title={readOnly ? `查看内置角色：${role.name}` : editing ? `编辑角色：${role.name}` : '新增角色'} subtitle={readOnly ? '内置角色不可修改或裁剪，请使用「复制为新角色」后调整' : '配置功能权限（菜单 + 按钮）与数据权限（平台 / 集群 / 资源）'} onClose={close} closeOnMask={false}
        footer={<><button type="button" className="btn-default" onClick={close}>{readOnly ? '关闭' : '取消'}</button>{!readOnly && <LoadingButton variant="primary" loading={busy} onClick={submit}>{editing ? '保存' : '创建'}</LoadingButton>}</>}>
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <FormField label="角色名称" required error={err.name}><input className="field" value={f.name} disabled={readOnly} onChange={(e) => set('name', e.target.value)} /></FormField>
          <FormField label="角色编码" required error={err.code} hint={editing ? '编码创建后不可修改' : undefined}><input className="field" value={f.code} disabled={readOnly || editing} onChange={(e) => set('code', e.target.value)} placeholder="如 ops_team" /></FormField>
          <FormField label="描述"><input className="field" value={f.description} disabled={readOnly} onChange={(e) => set('description', e.target.value)} /></FormField>
        </div>
        <Tabs value={tab} onChange={setTab} items={[{ key: 'func', label: '① 功能权限' }, { key: 'data', label: '② 数据权限', count: f.dataScopes.length || undefined }]} className="mb-4" />
        {tab === 'func' && <PermissionTree value={f.permissions} onChange={(v) => set('permissions', v)} readOnly={readOnly} />}
        {tab === 'data' && (tree ? <DataScopeEditor tree={tree} value={f.dataScopes} onChange={(v) => set('dataScopes', v)} readOnly={readOnly} /> : <Skeleton.Table rows={4} cols={2} />)}
      </Modal>
      <Modal open={leave} width={400} title="放弃未保存的修改？" onClose={() => setLeave(false)} footer={<><button type="button" className="btn-default" onClick={() => setLeave(false)}>继续编辑</button><button type="button" className="btn-danger" onClick={() => { setLeave(false); onClose(); }}>放弃并关闭</button></>}>
        <p className="text-sm text-fg-muted">角色配置尚未保存，关闭后将丢失。</p>
      </Modal>
    </>
  );
}
