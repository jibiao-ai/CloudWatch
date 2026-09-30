import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import Portal from './Portal';
import { useStore } from '../store/useStore';

/**
 * ToastViewport —— 全局消息容器（在 App 根部挂一次）。
 * 使用：const toast = useToast(); toast.success('保存成功', '描述可选', { duration: 3000 })
 * 类型：success / error / warning / info；最多同时 3 条；可手动关闭；错误默认停留更久。
 */
const META = {
  success: { icon: CheckCircle2, cls: 'text-success' },
  error: { icon: XCircle, cls: 'text-danger' },
  warning: { icon: AlertTriangle, cls: 'text-warning' },
  info: { icon: Info, cls: 'text-info' },
};

function ToastItem({ t }) {
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    const d = t.duration ?? (t.type === 'error' ? 6000 : 4000);
    if (!d) return undefined;
    const timer = setTimeout(() => dismiss(t.id), d);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, t.type, dismiss]);
  const { icon: Icon, cls } = META[t.type] || META.info;
  return (
    <div role={t.type === 'error' ? 'alert' : 'status'} className="surface rounded-lg shadow-lg animate-toast-in w-[340px] max-w-[92vw] flex gap-3 p-3.5 pr-2.5">
      <Icon size={20} className={`${cls} shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg break-words">{t.title}</div>
        {t.description && <div className="text-xs text-fg-muted mt-0.5 break-words leading-relaxed">{t.description}</div>}
      </div>
      <button type="button" className="btn-icon !w-6 !h-6 shrink-0" onClick={() => dismiss(t.id)} aria-label="关闭消息">
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastViewport() {
  const toasts = useStore((s) => s.toasts);
  return (
    <Portal>
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem t={t} />
          </div>
        ))}
      </div>
    </Portal>
  );
}
