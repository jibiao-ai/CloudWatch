import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Logo from './Logo';
import { getIcon } from './icons';
import { useStore } from '../store/useStore';
import Tooltip from './Tooltip';

/**
 * Sidebar —— 菜单由后端返回的权限树生成（store.menus），再用 hasPermission 过滤，前端不硬编码可见性。
 * 支持：分组折叠（持久化 localStorage）/ 图标模式（<1280px 或手动折叠）/ 抽屉模式（<768px）
 */
export default function Sidebar({ mode }) {
  const menus = useStore((s) => s.menus);
  const permissions = useStore((s) => s.permissions);
  const hasPermission = useStore((s) => s.hasPermission);
  const brand = useStore((s) => s.brand);
  const collapsedPref = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const groups = useStore((s) => s.sidebarGroups);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const setMobileNavOpen = useStore((s) => s.setMobileNavOpen);
  const { pathname } = useLocation();

  const iconOnly = mode === 'icon';
  const drawer = mode === 'drawer';
  const visible = menus.map((g) => ({ ...g, children: g.children.filter((i) => hasPermission(i.permission)) })).filter((g) => g.children.length);

  // 仅在「路径发生变化」时收起抽屉（挂载时不能关，否则抽屉一打开就被关掉）
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (drawer && lastPath.current !== pathname) setMobileNavOpen(false);
    lastPath.current = pathname;
  }, [pathname, drawer, setMobileNavOpen]);

  return (
    <aside
      aria-label="主导航"
      className={`h-full bg-card border-r border-line flex flex-col shrink-0 transition-[width] duration-200 ${iconOnly ? 'w-[64px]' : 'w-[232px]'}`}
    >
      <div className={`h-14 flex items-center border-b border-line shrink-0 ${iconOnly ? 'justify-center px-0' : 'px-4 justify-between'}`}>
        {iconOnly ? <Logo size={32} src={brand.logoUrl} showText={false} name={brand.platformName} /> : <Logo size={32} src={brand.logoUrl} name={brand.platformName} subtitle={brand.subtitle} />}
        {drawer && (
          <button type="button" className="btn-icon" aria-label="关闭菜单" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1" key={permissions.join(',')}>
        {visible.map((g) => {
          const closed = !iconOnly && groups[g.code];
          const single = g.children.length === 1 && g.code !== 'system';
          return (
            <div key={g.code}>
              {!single && !iconOnly && (
                <button
                  type="button"
                  onClick={() => toggleGroup(g.code)}
                  aria-expanded={!closed}
                  className="w-full flex items-center gap-2 px-2.5 h-8 mt-2 text-[11px] font-semibold tracking-wide text-fg-subtle hover:text-fg-muted transition"
                >
                  <span className="flex-1 text-left">{g.name}</span>
                  <ChevronDown size={13} className={`transition-transform ${closed ? '-rotate-90' : ''}`} />
                </button>
              )}
              {!single && iconOnly && <div className="my-2 mx-2 border-t border-line" aria-hidden />}
              {!closed &&
                g.children.map((item) => {
                  const Icon = getIcon(item.icon);
                  const link = (
                    <NavLink
                      key={item.code}
                      to={item.path}
                      aria-label={iconOnly ? item.name : undefined}
                      className={({ isActive }) =>
                        `group flex items-center gap-2.5 h-9 rounded-md text-[13.5px] transition ${iconOnly ? 'justify-center px-0' : 'px-2.5'} ${
                          isActive ? 'bg-primary-soft text-primary-text font-medium' : 'text-fg-muted hover:bg-hover hover:text-fg'
                        }`
                      }
                    >
                      <Icon size={17} className="shrink-0" />
                      {!iconOnly && <span className="truncate flex-1">{single ? g.name : item.name}</span>}
                      {!iconOnly && item.planned && <span className="text-[10px] px-1.5 h-4 rounded bg-muted text-fg-subtle leading-4">规划中</span>}
                    </NavLink>
                  );
                  return iconOnly ? (
                    <Tooltip key={item.code} content={item.name} placement="top">
                      <div className="w-full flex">{React.cloneElement(link, { className: (s) => `${link.props.className(s)} w-full` })}</div>
                    </Tooltip>
                  ) : (
                    link
                  );
                })}
            </div>
          );
        })}
      </nav>

      {!drawer && (
        <div className="border-t border-line p-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleSidebar}
            className={`w-full h-9 rounded-md flex items-center gap-2 text-[13px] text-fg-muted hover:bg-hover hover:text-fg transition ${iconOnly ? 'justify-center' : 'px-2.5'}`}
            aria-label={collapsedPref ? '展开侧栏' : '折叠侧栏'}
          >
            {collapsedPref || iconOnly ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!iconOnly && <span>折叠侧栏</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
