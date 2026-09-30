import React from 'react';

/** Switch —— 开关。属性：checked / onChange(bool) / disabled / label / title(禁用原因) */
export default function Switch({ checked, onChange, disabled, label, title, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative shrink-0 w-10 h-[22px] rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-primary' : 'bg-line-strong'}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-card shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
    </button>
  );
}
