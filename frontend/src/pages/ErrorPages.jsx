import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldOff, FileQuestion, ServerCrash, Home, ArrowLeft } from 'lucide-react';
import { LogoMark } from '../components/Logo';

/** ErrorPages —— 403 / 404 / 500 统一风格：图标 + 说明 + 返回首页 / 返回上一页 */
function Shell({ icon: Icon, code, title, children }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-full h-full flex items-center justify-center p-6 bg-bg">
      <div className="text-center max-w-md animate-pop-in">
        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-primary-soft text-primary-text flex items-center justify-center"><Icon size={38} /></div>
        <div className="text-5xl font-bold text-primary-text tracking-tight tabular-nums">{code}</div>
        <h1 className="mt-3 text-lg font-semibold text-fg">{title}</h1>
        <div className="mt-2 text-sm text-fg-muted leading-relaxed">{children}</div>
        <div className="mt-7 flex justify-center gap-3">
          <button type="button" className="btn-default" onClick={() => navigate(-1)}><ArrowLeft size={15} /> 返回上一页</button>
          <button type="button" className="btn-primary" onClick={() => navigate('/dashboard', { replace: true })}><Home size={15} /> 返回首页</button>
        </div>
        <div className="mt-10 flex justify-center opacity-60"><LogoMark size={22} badge={false} className="text-fg-muted" /></div>
      </div>
    </div>
  );
}

export function ForbiddenPage({ need }) {
  const { state } = useLocation();
  const code = need || state?.need;
  return (
    <Shell icon={ShieldOff} code="403" title="无权访问该页面">
      您的账号缺少访问此页面所需的权限{code ? <>：<code className="px-1.5 py-0.5 rounded bg-muted text-fg text-xs">{code}</code></> : ''}。
      <br />如需开通，请联系系统管理员为您的角色授权。
    </Shell>
  );
}
export const NotFoundPage = () => <Shell icon={FileQuestion} code="404" title="页面不存在">您访问的地址不存在或已被移动，请检查链接是否正确。</Shell>;
export const ServerErrorPage = () => <Shell icon={ServerCrash} code="500" title="页面出错了">页面渲染时发生了意外错误，请刷新重试；若问题持续，请联系管理员并附上发生时间。</Shell>;
export default NotFoundPage;
