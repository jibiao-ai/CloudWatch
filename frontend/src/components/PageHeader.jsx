import React from 'react';

/** PageHeader —— 页头：标题 + 一句话说明 + 右侧操作区（刷新 / 导出 / 全屏 / 主操作） */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg tracking-tight">{title}</h1>
        {description && <p className="text-[13px] text-fg-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
