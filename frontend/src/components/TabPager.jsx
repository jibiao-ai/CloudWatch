import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** TabPager —— 标签页底部「上一项 / 第 X / N 项 / 下一项」翻页条。属性：items[{key,label}] / value / onChange(key) */
export default function TabPager({ items, value, onChange }) {
  const i = items.findIndex((t) => t.key === value);
  const prev = items[i - 1];
  const next = items[i + 1];
  return (
    <nav className="card px-5 py-3 flex items-center justify-between gap-3" aria-label="标签翻页">
      <button type="button" className="btn-ghost btn-sm" disabled={!prev} onClick={() => onChange(prev.key)}><ChevronLeft size={15} />{prev ? `上一项：${prev.label}` : '上一项'}</button>
      <span className="text-xs text-fg-muted tabular-nums" aria-live="polite">第 {i + 1} / {items.length} 项</span>
      <button type="button" className="btn-ghost btn-sm" disabled={!next} onClick={() => onChange(next.key)}>{next ? `下一项：${next.label}` : '下一项'}<ChevronRight size={15} /></button>
    </nav>
  );
}
