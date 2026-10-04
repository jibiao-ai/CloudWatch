import React from 'react';
import CustomSelect from '../CustomSelect';

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

/** FilterBar —— 筛选栏（卡片）：「标签 + 下拉」组合，位于页签面板顶部 */
export function FilterBar({ children }) {
  return <div className="card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>;
}

/**
 * Filter —— 下拉筛选。默认带标签（用于 FilterBar）；bare=true 时只显示下拉（用于表格工具栏，占位文字为「全部…」，与配置中心一致）
 */
export function Filter({ label, options, value, onChange, width = 190, bare = false, placeholder, clearable = true }) {
  const sel = (
    <div style={{ width }}>
      <CustomSelect size="sm" clearable={clearable} placeholder={placeholder || (bare ? `全部${label}` : '全部')} aria-label={label} options={options} value={value} onChange={(v) => onChange(v || '')} />
    </div>
  );
  if (bare) return sel;
  return <div className="flex items-center gap-1.5 text-xs text-fg-muted"><span>{label}</span>{sel}</div>;
}
