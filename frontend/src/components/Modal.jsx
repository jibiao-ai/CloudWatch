import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Portal from './Portal';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Modal —— 通用弹窗（Portal + 实色卡片 + 弹性动画）
 * 属性：open / title / subtitle / onClose / width(px|string) / footer(节点) / closeOnMask(默认 true) / children
 * 用法：<Modal open title="新增用户" onClose={...} footer={<>...</>}>表单</Modal>
 */
export default function Modal({ open, title, subtitle, onClose, width = 560, footer, closeOnMask = true, children, bodyClassName = '' }) {
  const ref = useRef(null);
  useFocusTrap(ref, open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgb(var(--scrim) / 0.5)' }} onMouseDown={closeOnMask ? onClose : undefined} />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          tabIndex={-1}
          style={{ width, maxWidth: '100%' }}
          className="relative surface rounded-2xl shadow-lg animate-pop-in flex flex-col max-h-[90vh]"
        >
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg">{title}</h2>
              {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" className="btn-icon -mr-2 -mt-1" onClick={onClose} aria-label="关闭">
              <X size={18} />
            </button>
          </header>
          <div className={`px-6 pb-4 overflow-y-auto ${bodyClassName}`}>{children}</div>
          {footer && <footer className="px-6 py-3.5 border-t border-line flex items-center justify-end gap-2.5 rounded-b-2xl">{footer}</footer>}
        </div>
      </div>
    </Portal>
  );
}
