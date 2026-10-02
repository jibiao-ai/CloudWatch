import React from 'react';

/** Panel —— 分析页的图表卡片：标题 + 右侧操作区 + 内容 */
export default function Panel({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`card p-4 min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Seg —— 分段切换（近7天 / 近30天 / 数量 / 容量 …），选中为主色浅底 */
export function Seg({ items, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-md border border-line p-0.5 bg-card">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          aria-pressed={value === it.value}
          onClick={() => onChange(it.value)}
          className={`px-2.5 h-6 text-xs rounded transition whitespace-nowrap ${value === it.value ? 'bg-primary-soft text-primary-text font-medium' : 'text-fg-muted hover:text-fg'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Filter —— 筛选栏里的「标签 + 下拉」容器 */
export function FilterBar({ children }) {
  return <div className="flex flex-wrap items-center gap-3 mb-4">{children}</div>;
}
