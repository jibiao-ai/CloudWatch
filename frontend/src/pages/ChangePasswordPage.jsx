import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import FormField from '../components/FormField';
import PasswordInput from '../components/PasswordInput';
import LoadingButton from '../components/LoadingButton';
import PageHeader from '../components/PageHeader';
import { authApi } from '../services/api';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { checkPassword } from '../utils/validators';

const STRENGTH = ['很弱', '较弱', '一般', '较强', '很强'];
/**
 * ChangePasswordPage —— 主动改密 / 强制下次改密（forced 时不可跳过）
 * 密码规则来自系统配置（策略），前端做同规则校验；后端为准。
 */
export default function ChangePasswordPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const forced = state?.forced || user?.mustChangePassword;
  const [f, setF] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const chk = checkPassword(f.newPassword);

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!f.oldPassword) fe.oldPassword = '请输入原密码';
    if (!f.newPassword) fe.newPassword = '请输入新密码';
    else if (!chk.ok) fe.newPassword = `新密码需包含：${chk.missing.join('、')}`;
    else if (f.newPassword === f.oldPassword) fe.newPassword = '新密码不能与原密码相同';
    if (f.confirm !== f.newPassword) fe.confirm = '两次输入的密码不一致';
    setErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await authApi.changePassword({ oldPassword: f.oldPassword, newPassword: f.newPassword });
      setUser({ ...user, mustChangePassword: false });
      setF({ oldPassword: '', newPassword: '', confirm: '' });
      toast.success('密码已修改', '下次登录请使用新密码');
      navigate('/dashboard', { replace: true });
    } catch (e2) {
      setErr({ oldPassword: /原密码/.test(e2.message) ? e2.message : undefined, form: /原密码/.test(e2.message) ? undefined : e2.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="修改密码" description={forced ? '为保障账号安全，您需要先修改初始/重置的密码后才能继续使用。' : '定期修改密码有助于保障账号安全。'} />
      <form onSubmit={submit} noValidate className="card p-6 space-y-4">
        {err.form && <div role="alert" className="p-3 rounded-md bg-danger-soft text-danger text-[13px]">{err.form}</div>}
        <FormField label="原密码" required error={err.oldPassword}><PasswordInput value={f.oldPassword} onChange={set('oldPassword')} autoComplete="current-password" /></FormField>
        <FormField label="新密码" required error={err.newPassword} hint="至少 8 位，包含大小写字母、数字和特殊字符">
          <PasswordInput value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
        </FormField>
        {f.newPassword && (
          <div aria-live="polite">
            <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < chk.score ? (chk.score <= 1 ? 'bg-danger' : chk.score <= 2 ? 'bg-warning' : 'bg-success') : 'bg-muted'}`} />)}</div>
            <div className="text-xs text-fg-muted mt-1">强度：{STRENGTH[chk.score]}</div>
          </div>
        )}
        <FormField label="确认新密码" required error={err.confirm}><PasswordInput value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></FormField>
        <div className="flex justify-end gap-2.5 pt-2">
          {!forced && <button type="button" className="btn-default" onClick={() => navigate(-1)}>取消</button>}
          <LoadingButton type="submit" variant="primary" loading={busy} icon={ShieldCheck}>确认修改</LoadingButton>
        </div>
      </form>
    </div>
  );
}
