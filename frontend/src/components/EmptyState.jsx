import React from 'react';
import { Inbox } from 'lucide-react';

/** EmptyState —— 图标 + 说明 + 可选操作。属性：icon / title / description / action(节点) / compact */
export default function EmptyState({ icon: Icon = Inbox, title = '暂无数据', description, action, compact }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-fg-subtle mb-3">
        <Icon size={26} />
      </div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {description && <div className="text-xs text-fg-muted mt-1 max-w-sm">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
