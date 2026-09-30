import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';

/** 面包屑：由当前路由匹配菜单树（分组 > 页面），页面可通过 store.setBreadcrumbExtra 追加下钻路径（平台 > 集群 > 资源） */
export default function Breadcrumb() {
  const { pathname } = useLocation();
  const menus = useStore((s) => s.menus);
  const extra = useStore((s) => s.breadcrumbExtra);
  const trail = [{ name: '首页', to: '/dashboard' }];
  for (const g of menus) {
    const hit = g.children.find((c) => pathname.startsWith(c.path));
    if (hit) {
      if (g.children.length > 1 || g.code === 'system') trail.push({ name: g.name });
      trail.push({ name: hit.name, to: extra.length ? hit.path : undefined });
      break;
    }
  }
  const all = [...trail, ...extra];
  return (
    <nav aria-label="面包屑" className="flex items-center gap-1 text-[13px] min-w-0">
      {all.map((t, i) => {
        const last = i === all.length - 1;
        // 窄屏只保留最后一级，避免被过度截断
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={13} className="text-fg-subtle shrink-0 hidden md:block" />}
            {t.to && !last ? (
              <Link to={t.to} className="text-fg-muted hover:text-fg truncate hidden md:inline">{t.name}</Link>
            ) : (
              <span className={`truncate ${last ? 'text-fg font-medium' : 'text-fg-muted hidden md:inline'}`}>{t.name}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
