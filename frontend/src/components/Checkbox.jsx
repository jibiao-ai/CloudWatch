import React, { useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';

/** Checkbox —— 自绘复选框（支持半选）。属性：checked / indeterminate / onChange(bool) / disabled / label / aria-label */
export default function Checkbox({ checked, indeterminate, onChange, disabled, label, 'aria-label': aria, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  const on = checked || indeterminate;
  return (
    <label className={`inline-flex items-center gap-2 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
      <span className="relative inline-flex">
        <input ref={ref} type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} aria-label={aria || (typeof label === 'string' ? label : undefined)} onChange={(e) => onChange?.(e.target.checked)} />
        <span className={`w-4 h-4 rounded border flex items-center justify-center transition ${on ? 'bg-primary border-primary text-primary-on' : 'bg-card border-line-strong'}`}>
          {indeterminate ? <Minus size={12} strokeWidth={3} /> : checked ? <Check size={12} strokeWidth={3} /> : null}
        </span>
      </span>
      {label && <span className="text-sm text-fg">{label}</span>}
    </label>
  );
}
