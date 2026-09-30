import React from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { tokenStorage } from '../utils/auth';
import { ForbiddenPage } from '../pages/ErrorPages';

/** 需登录：未登录 → /login?redirect=；强制改密 → /change-password */
export function RequireAuth({ children }) {
  const user = useStore((s) => s.user);
  const { pathname, search } = useLocation();
  if (!tokenStorage.getAccess() || !user) return <Navigate to={`/login?redirect=${encodeURIComponent(pathname + search)}`} replace />;
  if (user.mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace state={{ forced: true }} />;
  return children;
}

/** 仅允许站内相对路径，防止开放重定向 */
export const safeRedirect = (r) => (r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/login') ? r : '/dashboard');

/** 已登录访问登录页 → 跳首页（有 redirect 参数则跳回原页面） */
export function RedirectIfAuthed({ children }) {
  const user = useStore((s) => s.user);
  const [sp] = useSearchParams();
  if (tokenStorage.getAccess() && user && !user.mustChangePassword) return <Navigate to={safeRedirect(sp.get('redirect'))} replace />;
  return children;
}

/** 路由权限码守卫：无权限 → 403 页面（不静默白屏） */
export function RequirePermission({ code, children }) {
  const permissions = useStore((s) => s.permissions);
  const ok = !code || permissions.includes('*') || permissions.includes(code);
  return ok ? children : <ForbiddenPage need={code} />;
}
