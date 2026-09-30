import React, { useState } from 'react';
import Modal from '../Modal';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import { USER_SOURCES } from '../../data/dict';
import { userApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { isEmail, isPhone } from '../../utils/validators';

const blank = { username: '', name: '', email: '', phone: '', department: '', source: 'local', roleIds: [], status: 'active' };

/** 用户新增 / 编辑弹窗。用户名创建后不可改；新增成功后由父组件展示一次性初始密码 */
export default function UserFormModal({ open, user, roles, onClose, onSaved }) {
  const editing = !!user;
  const toast = useToast();
  const [f, setF] = useState(() => (user ? { ...blank, ...user } : blank));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState(false);
  const set = (k) => (v) => { setDirty(true); setF((s) => ({ ...s, [k]: v && v.target ? v.target.value : v })); };

  const submit = async () => {
    const e = {};
    if (!f.username.trim()) e.username = '请输入用户名';
    else if (!/^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/.test(f.username)) e.username = '3~32 位，字母开头，可含数字 _ . -';
    if (!f.name.trim()) e.name = '请输入姓名';
    if (f.email && !isEmail(f.email)) e.email = '邮箱格式不正确';
    if (f.phone && !isPhone(f.phone)) e.phone = '请输入 11 位手机号';
    if (!f.roleIds.length) e.roleIds = '请至少选择一个角色';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { ...f, username: f.username.trim(), name: f.name.trim() };
      const res = editing ? await userApi.updateUser(user.id, body) : await userApi.createUser(body);
      toast.success(editing ? '用户已更新' : '用户已创建', res.username);
      onSaved(res, !editing);
    } catch (ex) {
      if (/用户名/.test(ex.message)) setErr({ username: ex.message });
      else if (/邮箱/.test(ex.message)) setErr({ email: ex.message });
      else if (/超级管理员/.test(ex.message)) setErr({ roleIds: ex.message });
      else toast.error('保存失败', ex.message);
    } finally { setBusy(false); }
  };
  const close = () => (dirty && !busy ? setLeave(true) : onClose());
  return (
    <>
      <Modal open={open} width={620} title={editing ? `编辑用户：${user.username}` : '新增用户'} onClose={close} closeOnMask={false}
        footer={<><button type="button" className="btn-default" onClick={close}>取消</button><LoadingButton variant="primary" loading={busy} onClick={submit}>{editing ? '保存' : '创建'}</LoadingButton></>}>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="用户名" required error={err.username} hint={editing ? '用户名创建后不可修改' : undefined}><input className="field" value={f.username} disabled={editing} onChange={set('username')} autoComplete="off" /></FormField>
          <FormField label="姓名" required error={err.name}><input className="field" value={f.name} onChange={set('name')} /></FormField>
          <FormField label="邮箱" error={err.email}><input className="field" value={f.email} onChange={set('email')} /></FormField>
          <FormField label="手机" error={err.phone}><input className="field" value={f.phone} onChange={set('phone')} inputMode="numeric" maxLength={11} /></FormField>
          <FormField label="部门"><input className="field" value={f.department} onChange={set('department')} /></FormField>
          <FormField label="来源"><CustomSelect value={f.source} onChange={set('source')} options={USER_SOURCES} disabled={editing} /></FormField>
          <FormField className="sm:col-span-2" label="角色" required error={err.roleIds}>
            <CustomSelect multiple value={f.roleIds} onChange={set('roleIds')} placeholder="选择角色（可多选）" options={roles.map((r) => ({ value: r.id, label: r.name, hint: r.builtin ? '内置' : '' }))} />
          </FormField>
          {editing && <FormField label="状态"><CustomSelect value={f.status === 'locked' ? 'active' : f.status} onChange={set('status')} options={[{ value: 'active', label: '正常' }, { value: 'disabled', label: '禁用' }]} /></FormField>}
        </div>
        {!editing && <p className="hint mt-4">创建后系统将生成一次性初始密码，用户首次登录须修改密码。</p>}
      </Modal>
      <Modal open={leave} width={400} title="放弃未保存的修改？" onClose={() => setLeave(false)} footer={<><button type="button" className="btn-default" onClick={() => setLeave(false)}>继续编辑</button><button type="button" className="btn-danger" onClick={() => { setLeave(false); onClose(); }}>放弃并关闭</button></>}>
        <p className="text-sm text-fg-muted">表单中有尚未保存的内容，关闭后将丢失。</p>
      </Modal>
    </>
  );
}
