import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Portal from './Portal';
import LoadingButton from './LoadingButton';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * ConfirmModal —— 统一确认弹窗（禁用 window.confirm / alert / prompt）
 * 属性：open / title / description / impactList(影响范围条目 string[]) / targets(目标资源清单 string[])
 *       confirmText / cancelText / danger / loading / onConfirm / onCancel / children(额外内容)
 * 规则：danger 时主按钮为红色，且默认聚焦「取消」；loading 时确认按钮禁用防重复提交；Esc 关闭。
 */
export default function ConfirmModal({ open, title, description, impactList = [], targets = [], confirmText = '确认', cancelText = '取消', danger, loading, onConfirm, onCancel, children }) {
  const ref = useRef(null);
  useFocusTrap(ref, open, danger ? '[data-cancel]' : '[data-confirm]');
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && !loading && onCancel?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);
  if (!open) return null;
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <Portal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgb(var(--scrim) / 0.55)' }} onMouseDown={() => !loading && onCancel?.()} />
        <div ref={ref} role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1} className="relative surface rounded-2xl shadow-lg w-[460px] max-w-full animate-pop-in p-6">
          <div className="flex gap-4">
            <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${danger ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary-text'}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-fg">{title}</h2>
              {description && <p className="text-sm text-fg-muted mt-1.5 leading-relaxed">{description}</p>}
              {targets.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-fg-muted mb-1.5">目标资源（{targets.length}）</div>
                  <ul className="max-h-24 overflow-y-auto rounded-md bg-muted px-3 py-2 space-y-0.5">
                    {targets.map((t, i) => (
                      <li key={i} className="text-[13px] text-fg truncate">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {impactList.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-fg-muted mb-1.5">影响范围</div>
                  <ul className={`rounded-md px-3 py-2 space-y-1 ${danger ? 'bg-danger-soft' : 'bg-primary-soft'}`}>
                    {impactList.map((t, i) => (
                      <li key={i} className="text-[13px] text-fg flex gap-2">
                        <span className={`mt-[7px] w-1 h-1 rounded-full shrink-0 ${danger ? 'bg-danger' : 'bg-primary'}`} />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {children}
            </div>
          </div>
          <div className="flex justify-end gap-2.5 mt-6">
            <button type="button" data-cancel className="btn-default" onClick={onCancel} disabled={loading}>{cancelText}</button>
            <LoadingButton data-confirm variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmText}</LoadingButton>
          </div>
        </div>
      </div>
    </Portal>
  );
}
