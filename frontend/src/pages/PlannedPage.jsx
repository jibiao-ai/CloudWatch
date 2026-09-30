import React from 'react';
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { useStore } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

/** 规划中模块占位页：后续接口文档补充后逐个替换 */
export default function PlannedPage() {
  const { pathname } = useLocation();
  const menus = useStore((s) => s.menus);
  const item = menus.flatMap((g) => g.children).find((c) => c.path === pathname);
  return (
    <div>
      <PageHeader title={item?.name || '功能规划中'} description="该模块正在规划中，待补充接口文档后上线。" />
      <div className="card">
        <EmptyState icon={Construction} title="模块建设中" description="首批交付：登录 / 概览 / 系统管理。其余模块按接口文档陆续接入，菜单与权限码已预留。" />
      </div>
    </div>
  );
}
