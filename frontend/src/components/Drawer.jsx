import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Portal from './Portal';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Drawer —— 右侧抽屉（明细不跳页，关闭后列表筛选状态保留）
 * 属性：open / title / subtitle / onClose / width / footer / children
 */
export default function Drawer({ open, title, subtitle, onClose, width = 560, footer, children, actions }) {
  const ref = useRef(null);
  useFocusTrap(ref, open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[90]">
        <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgb(var(--scrim) / 0.42)' }} onMouseDown={onClose} />
        <aside
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : '详情'}
          tabIndex={-1}
          style={{ width, maxWidth: '100vw' }}
          className="absolute right-0 top-0 h-full bg-card border-l border-line-strong shadow-lg animate-slide-left flex flex-col"
        >
          <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg truncate">{title}</h2>
              {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-1">
              {actions}
              <button type="button" className="btn-icon" onClick={onClose} aria-label="关闭抽屉">
                <X size={18} />
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <footer className="px-5 py-3 border-t border-line flex justify-end gap-2.5">{footer}</footer>}
        </aside>
      </div>
    </Portal>
  );
}
