import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Portal from './Portal';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Drawer —— 右侧抽屉（明细不跳页，关闭后列表筛选状态保留）
 * 属性：open / title / subtitle / onClose / width / footer / children
 *  anchor：可选，返回 { top, bottom }（视口坐标）的函数；传入后抽屉只占据该纵向区间（例如表格工具栏 → 分页栏之间），
 *  内容超出时在抽屉内部滚动；窗口缩放 / 页面滚动时自动重新定位。不传则为整屏高度。
 */
export default function Drawer({ open, title, subtitle, onClose, width = 560, footer, children, actions, anchor }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useFocusTrap(ref, open, '[data-autofocus]');
  useLayoutEffect(() => {
    if (!open || !anchor) { setBox(null); return undefined; }
    const calc = () => {
      const a = anchor();
      const vh = window.innerHeight;
      const top = Math.max(0, Math.min(a.top, vh - 200));
      const bottom = Math.min(vh, Math.max(a.bottom, top + 200));
      setBox((b) => (b && b.top === top && b.bottom === bottom ? b : { top, bottom }));
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => { window.removeEventListener('resize', calc); window.removeEventListener('scroll', calc, true); };
  }, [open, anchor]);
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
          style={box ? { width, maxWidth: '100vw', top: box.top, height: box.bottom - box.top } : { width, maxWidth: '100vw' }}
          className={`absolute right-0 ${box ? 'rounded-l-xl border-y' : 'top-0 h-full'} bg-card border-l border-line-strong shadow-lg animate-slide-left flex flex-col`}
        >
          <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg truncate">{title}</h2>
              {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-1">
              {actions}
              <button type="button" className="btn-icon focus-visible:!outline-none" onClick={onClose} aria-label="关闭抽屉">
                <X size={18} />
              </button>
            </div>
          </header>
          <div data-autofocus tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto p-5 outline-none focus:outline-none focus-visible:!outline-none">{children}</div>
          {footer && <footer className="px-5 py-3 border-t border-line flex justify-end gap-2.5 shrink-0">{footer}</footer>}
        </aside>
      </div>
    </Portal>
  );
}
