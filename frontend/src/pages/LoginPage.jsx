import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, RotateCw, TriangleAlert } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import FormField from '../components/FormField';
import PasswordInput from '../components/PasswordInput';
import LoadingButton from '../components/LoadingButton';
import Checkbox from '../components/Checkbox';
import { authApi, ApiError } from '../services/api';
import { useStore } from '../store/useStore';
import { tokenStorage, accountStorage } from '../utils/auth';
import { safeRedirect } from '../components/RouteGuards';

/**
 * LoginPage —— 账号 / 密码（明文切换）/ 验证码（系统配置开启后出现）/ 记住账号（只记账号，绝不存密码）
 * 失败分级：401 统一文案（不区分账号是否存在）/ 423 锁定+剩余分钟 / 403 已禁用 / 429 频繁 / 5xx 服务不可用+重试
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const setSession = useStore((s) => s.setSession);
  const brand = useStore((s) => s.brand);
  const [username, setUsername] = useState(accountStorage.get());
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!accountStorage.get());
  const [captcha, setCaptcha] = useState('');
  const [cap, setCap] = useState(null); // {id,image}
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState({});
  const [alert, setAlert] = useState(null); // {tone,text,retry}
  const userRef = useRef(null);

  useEffect(() => { userRef.current?.focus(); }, []);

  const loadCaptcha = useCallback(async () => {
    try { setCap(await authApi.getCaptcha()); setCaptcha(''); } catch { setCap(null); }
  }, []);
  // 系统配置里开启了登录验证码：进入登录页即显示（也兼容服务端返回 captchaRequired）
  useEffect(() => { if (brand.captchaEnabled) setNeedCaptcha(true); }, [brand.captchaEnabled]);
  useEffect(() => { if (needCaptcha) loadCaptcha(); }, [needCaptcha, loadCaptcha]);

  const submit = async (e) => {
    e?.preventDefault();
    const fe = {};
    if (!username.trim()) fe.username = '请输入账号';
    if (!password) fe.password = '请输入密码';
    if (needCaptcha && !captcha.trim()) fe.captcha = '请输入验证码';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setAlert(null);
    try {
      const res = await authApi.login({ username: username.trim(), password, captcha: captcha || undefined, captchaId: cap?.id });
      accountStorage.set(remember ? username.trim() : '');
      tokenStorage.set(res.accessToken, res.refreshToken);
      const me = await authApi.getMe();
      setSession(me);
      setPassword('');
      navigate(res.mustChangePassword || me.user.mustChangePassword ? '/change-password' : safeRedirect(sp.get('redirect')), { replace: true, state: res.mustChangePassword ? { forced: true } : undefined });
    } catch (err) {
      const s = err instanceof ApiError ? err.status : 0;
      if (err.data?.captchaRequired) setNeedCaptcha(true);
      if (needCaptcha) loadCaptcha();
      setPassword('');
      if (s === 401) setAlert({ tone: 'danger', text: err.code === 40101 ? err.message : '账号或密码错误' });
      else if (s === 423) setAlert({ tone: 'warning', text: err.message });
      else if (s === 403) setAlert({ tone: 'warning', text: err.message || '账号已被禁用，请联系管理员' });
      else if (s === 429) setAlert({ tone: 'warning', text: '尝试过于频繁，请稍后再试' });
      else setAlert({ tone: 'danger', text: s >= 500 || s === 0 ? '服务暂不可用，请稍后重试' : err.message, retry: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={`登录 ${brand.platformName}`} subtitle="使用您的运维账号登录" footer={brand.copyright}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {alert && (
          <div role="alert" className={`flex gap-2.5 p-3 rounded-md text-[13px] ${alert.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              {alert.text}
              {alert.retry && <button type="button" onClick={submit} className="ml-2 underline inline-flex items-center gap-1"><RotateCw size={12} /> 重试</button>}
            </div>
          </div>
        )}
        <FormField label="账号" error={fieldErr.username}>
          <input ref={userRef} className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入账号" autoComplete="username" />
        </FormField>
        <FormField label="密码" error={fieldErr.password}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" />
        </FormField>
        {needCaptcha && (
          <FormField label="验证码" error={fieldErr.captcha}>
            <div className="flex gap-2">
              <input className="field" value={captcha} onChange={(e) => setCaptcha(e.target.value)} placeholder="请输入验证码" autoComplete="off" inputMode="numeric" />
              <button type="button" onClick={loadCaptcha} className="shrink-0 h-9 w-[110px] rounded-md overflow-hidden border border-line-strong bg-muted flex items-center justify-center" aria-label="点击刷新验证码" title="点击刷新">
                {cap ? <img src={cap.image} alt="验证码" className="h-full" /> : <RotateCw size={16} className="text-fg-subtle" />}
              </button>
            </div>
          </FormField>
        )}
        <div className="flex items-center justify-between">
          <Checkbox checked={remember} onChange={setRemember} label="记住账号" />
          <span className="text-xs text-fg-subtle">忘记密码请联系管理员</span>
        </div>
        <LoadingButton type="submit" variant="primary" loading={busy} icon={LogIn} className="w-full !h-10">登 录</LoadingButton>
      </form>
    </AuthLayout>
  );
}
