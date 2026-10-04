import React, { lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import ToastViewport from './components/Toast';
import { RequireAuth, RedirectIfAuthed, RequirePermission } from './components/RouteGuards';
import { NotFoundPage } from './pages/ErrorPages';
import Skeleton from './components/Skeleton';
import { useStore } from './store/useStore';
import { authApi, settingsApi } from './services/api';
import { tokenStorage } from './utils/auth';
import { setNavigator } from './utils/navigate';
import { pickPolicy } from './utils/validators';

// 路由懒加载
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PlatformManagePage = lazy(() => import('./pages/PlatformManagePage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const DomainConfigPage = lazy(() => import('./pages/DomainConfigPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const AlertCenterPage = lazy(() => import('./pages/AlertCenterPage'));
const CapacityPage = lazy(() => import('./pages/CapacityPage'));
const TopologyPage = lazy(() => import('./pages/TopologyPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const InspectionPage = lazy(() => import('./pages/InspectionPage'));

/** 路由表：path + 权限码。菜单由后端权限树生成，这里的权限码用于路由守卫（无权限 → 403） */
const GUARDED = [
  ['/dashboard', DashboardPage, 'dashboard:view'],
  ['/monitor', PerformancePage, 'monitor:view'],
  ['/inspection', InspectionPage, 'inspection:view'],
  ['/alerts', AlertCenterPage, 'alert:view'],
  ['/capacity', CapacityPage, 'capacity:view'],
  ['/topology', TopologyPage, 'topology:view'],
  ['/analytics', AnalyticsPage, 'analytics:view'],
  ['/system/providers', PlatformManagePage, 'provider:view'],
  ['/system/users', UsersPage, 'user:view'],
  ['/system/roles', RolesPage, 'role:view'],
  ['/system/audit', AuditLogPage, 'audit:view'],
  ['/system/domain', DomainConfigPage, 'domain:view'],
  ['/system/settings', SettingsPage, 'settings:view'],
];

export default function App() {
  const navigate = useNavigate();
  const setSession = useStore((s) => s.setSession);
  const setAuthReady = useStore((s) => s.setAuthReady);
  const setBrand = useStore((s) => s.setBrand);
  const authReady = useStore((s) => s.authReady);
  const [booting, setBooting] = useState(true);

  useEffect(() => setNavigator(navigate), [navigate]);

  // 启动：品牌（公开）+ 会话恢复
  useEffect(() => {
    let alive = true;
    (async () => {
      settingsApi.getPublicSettings().then((s) => alive && setBrand({ platformName: s.platformName, subtitle: s.subtitle, copyright: s.copyright, primaryColor: s.primaryColor, logoUrl: s.logoUrl, loginBgUrl: s.loginBgUrl, captchaEnabled: !!s.captchaEnabled, pwdPolicy: pickPolicy(s) })).catch(() => {});
      if (tokenStorage.getAccess()) {
        try {
          const me = await authApi.getMe();
          if (alive) setSession(me);
        } catch {
          tokenStorage.clear();
          if (alive) setAuthReady(true);
        }
      } else if (alive) setAuthReady(true);
      if (alive) setBooting(false);
    })();
    return () => { alive = false; };
  }, [setSession, setAuthReady, setBrand]);

  if (booting || !authReady) {
    return (
      <div className="h-full p-8 space-y-5 bg-bg" aria-busy="true">
        <Skeleton.Block className="h-10 w-60" />
        <Skeleton.Cards />
        <Skeleton.Chart />
      </div>
    );
  }

  return (
    <>
      <React.Suspense fallback={<div className="h-full bg-bg p-8"><Skeleton.Block className="h-10 w-60" /></div>}>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route element={<RequireAuth><MainLayout /></RequireAuth>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {/* 运营分析旧子路径 → 同一页面的对应页签 */}
            {[['base', 'base'], ['vm', 'vm'], ['disk', 'disk'], ['optimize', 'optimize'], ['policy', 'policy']].map(([p, t]) => (
              <Route key={p} path={`/analytics/${p}`} element={<Navigate to={`/analytics?tab=${t}`} replace />} />
            ))}
            {GUARDED.map(([path, Page, code]) => (
              <Route key={path} path={path} element={<RequirePermission code={code}><Page /></RequirePermission>} />
            ))}
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </React.Suspense>
      <ToastViewport />
    </>
  );
}
