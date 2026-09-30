import React from 'react';

/**
 * Tabs —— 属性：items[{key,label,count,dot}] / value / onChange / idPrefix。
 * 支持左右方向键、Home/End；窄屏横向滚动；dot=true 显示「有未保存修改」圆点；
 * 传 idPrefix 时每个标签带 id=`${idPrefix}-${key}`，对应面板用 id=`${idPrefix}-panel` + aria-labelledby 关联。
 */
export default function Tabs({ items, value, onChange, className = '', idPrefix }) {
  const onKey = (e) => {
    const i = items.findIndex((t) => t.key === value);
    let next = null;
    if (e.key === 'ArrowRight') next = items[(i + 1) % items.length].key;
    if (e.key === 'ArrowLeft') next = items[(i - 1 + items.length) % items.length].key;
    if (e.key === 'Home') next = items[0].key;
    if (e.key === 'End') next = items[items.length - 1].key;
    if (next == null) return;
    e.preventDefault();
    onChange(next);
    if (idPrefix) requestAnimationFrame(() => document.getElementById(`${idPrefix}-${next}`)?.focus());
  };
  return (
    <div role="tablist" onKeyDown={onKey} className={`flex gap-1 border-b border-line overflow-x-auto ${className}`}>
      {items.map((t) => (
        <button
          key={t.key}
          id={idPrefix ? `${idPrefix}-${t.key}` : undefined}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          aria-controls={idPrefix ? `${idPrefix}-panel` : undefined}
          tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          className={`px-3.5 h-9 text-sm -mb-px border-b-2 transition whitespace-nowrap shrink-0 ${value === t.key ? 'border-primary text-primary-text font-medium' : 'border-transparent text-fg-muted hover:text-fg'}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-fg-subtle">{t.count}</span>}
          {t.dot && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-warning align-middle" role="img" aria-label="有未保存的修改" />}
        </button>
      ))}
    </div>
  );
}
