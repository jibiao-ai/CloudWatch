import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * LoadingButton —— 按钮内联 loading（防重复提交）
 * 属性：loading / variant('primary'|'default'|'ghost'|'danger') / size('md'|'sm') / icon / disabled / title(禁用原因提示)
 */
export default function LoadingButton({ loading, variant = 'default', size = 'md', icon: Icon, children, disabled, className = '', type = 'button', ...rest }) {
  const cls = { primary: 'btn-primary', default: 'btn-default', ghost: 'btn-ghost', danger: 'btn-danger' }[variant];
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`${cls} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} {...rest}>
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}
