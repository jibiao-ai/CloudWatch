import React from 'react';

/** Tabs —— 属性：items[{key,label,count}] / value / onChange。支持左右方向键切换。 */
export default function Tabs({ items, value, onChange, className = '' }) {
  const onKey = (e) => {
    const i = items.findIndex((t) => t.key === value);
    if (e.key === 'ArrowRight') onChange(items[(i + 1) % items.length].key);
    if (e.key === 'ArrowLeft') onChange(items[(i - 1 + items.length) % items.length].key);
  };
  return (
    <div role="tablist" onKeyDown={onKey} className={`flex gap-1 border-b border-line ${className}`}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          className={`px-3.5 h-9 text-sm -mb-px border-b-2 transition ${value === t.key ? 'border-primary text-primary-text font-medium' : 'border-transparent text-fg-muted hover:text-fg'}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-fg-subtle">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
