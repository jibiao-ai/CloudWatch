import React from 'react';

/**
 * Radio —— 自绘单选组（原生 input 仅作无障碍与键盘支持，不使用彩色聚焦光圈）
 * 属性：options [{value,label,hint?}] / value / onChange(value) / disabled / name / aria-label / inline
 */
export default function Radio({ options = [], value, onChange, disabled, name, 'aria-label': aria, inline = true, className = '' }) {
  return (
    <div role="radiogroup" aria-label={aria} className={`flex ${inline ? 'flex-wrap items-center gap-x-6 gap-y-2' : 'flex-col gap-2'} ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label key={String(o.value)} className={`inline-flex items-center gap-2 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input type="radio" className="peer sr-only" name={name} checked={on} disabled={disabled} onChange={() => onChange?.(o.value)} />
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${on ? 'border-primary' : 'border-line-strong bg-card'}`}>
              {on && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            <span className="text-sm text-fg">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
