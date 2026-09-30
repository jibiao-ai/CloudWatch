import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Moon, Sun, Bell, Search } from 'lucide-react';
import Sidebar from './Sidebar';
import Breadcrumb from './Breadcrumb';
import UserMenu from './UserMenu';
import FullscreenButton from './FullscreenButton';
import Skeleton from './Skeleton';
import Portal from './Portal';
import { useStore } from '../store/useStore';
import { dashboardApi, providerApi } from '../services/api';

/** 响应式：>=1280 完整侧栏；768-1279 图标模式；<768 抽屉 */
function useLayoutMode() {
  const calc = () => (window.innerWidth < 768 ? 'drawer' : window.innerWidth < 1280 ? 'icon' : 'full');
  const [m, setM] = useState(calc);
  useEffect(() => {
    const h = () => setM(calc());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

function PageFallback() {
  return (
    <div className="p-6 space-y-5">
      <Skeleton.Block className="h-8 w-56" />
      <Skeleton.Cards />
      <Skeleton.Chart />
    </div>
  );
}

export default function MainLayout() {
  const mode = useLayoutMode();
  const collapsedPref = useStore((s) => s.sidebarCollapsed);
  const mobileOpen = useStore((s) => s.mobileNavOpen);
  const setMobileOpen = useStore((s) => s.setMobileNavOpen);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const unread = useStore((s) => s.unreadAlerts);
  const setUnread = useStore((s) => s.setUnreadAlerts);
  const setProviders = useStore((s) => s.setProviders);
  const hasPermission = useStore((s) => s.hasPermission);
  const setBreadcrumbExtra = useStore((s) => s.setBreadcrumbExtra);
  const { pathname } = useLocation();
  const effective = mode === 'drawer' ? 'drawer' : mode === 'icon' || collapsedPref ? 'icon' : 'full';

  useEffect(() => { setBreadcrumbExtra([]); }, [pathname, setBreadcrumbExtra]);

  // 平台列表（写操作开关全站联动）+ 告警未读
  useEffect(() => {
    let alive = true;
    if (hasPermission('provider:view')) {
      providerApi.getProviderList({ page: 1, pageSize: 100 }).then((r) => alive && setProviders(r.list)).catch(() => {});
    }
    dashboardApi.getUnreadAlerts().then((r) => alive && setUnread(r.count)).catch(() => {});
    return () => { alive = false; };
  }, [hasPermission, setProviders, setUnread]);

  const isDark = theme === 'dark';
  return (
    <div className="h-full flex bg-bg">
      {mode !== 'drawer' && <Sidebar mode={effective} />}
      {mode === 'drawer' && mobileOpen && (
        <Portal>
          <div className="fixed inset-0 z-[95]">
            <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgb(var(--scrim) / 0.5)' }} onMouseDown={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 h-full animate-slide-right"><Sidebar mode="drawer" /></div>
          </div>
        </Portal>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 bg-card border-b border-line flex items-center gap-3 px-4">
          {mode === 'drawer' && (
            <button type="button" className="btn-icon -ml-2" aria-label="打开菜单" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          )}
          <div className="min-w-0 flex-1"><Breadcrumb /></div>
          <button type="button" className="hidden md:flex items-center gap-2 h-9 w-56 px-3 rounded-md bg-muted text-fg-subtle text-[13px] hover:bg-hover transition" aria-label="全局搜索" title="全局搜索（规划中）">
            <Search size={15} /> 搜索平台 / 资源…
            <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-card border border-line text-fg-muted">Ctrl K</kbd>
          </button>
          <button type="button" className="btn-icon relative" aria-label={`告警通知，${unread} 条未读`} title="告警中心">
            <Bell size={18} />
            {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-on text-[10px] leading-4 text-center font-medium">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button type="button" className="btn-icon" onClick={toggleTheme} aria-label={isDark ? '切换到浅色模式' : '切换到暗色模式'} title={isDark ? '浅色模式' : '暗色模式'}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <FullscreenButton iconOnly />
          <UserMenu />
        </header>
        <main className="flex-1 overflow-y-auto" id="main-content">
          <div key={pathname} className="animate-route-in p-4 md:p-6 mx-auto w-full max-w-[1680px]">
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
