import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import PasswordInput from './PasswordInput';

/**
 * SecretInput —— 密钥类字段：保存后一律显示 ******，任何位置不回显。
 * 属性：saved(是否已保存过) / value / onChange(string) / placeholder / autoComplete
 * 行为：saved 且未输入 → 显示 ******（只读）+「修改」；点击后出现输入框，可「取消修改」回到 ******。value 为空 = 沿用已保存值。
 */
export default function SecretInput({ saved, value, onChange, placeholder = '请输入', autoComplete = 'new-password', id, className = '', error }) {
  const [editing, setEditing] = useState(false);
  if (saved && !editing && !value) {
    return (
      <div className="relative">
        <input id={id} className={`field !pr-16 tracking-widest ${className}`} value="******" readOnly aria-label="已保存（不回显）" />
        <button type="button" onClick={() => setEditing(true)} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded text-xs text-primary-text hover:bg-primary-soft inline-flex items-center gap-1"><Pencil size={12} /> 修改</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1"><PasswordInput id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} className={`${className} ${error ? 'field-error' : ''}`} autoFocus={saved} /></div>
      {saved && <button type="button" className="btn-ghost btn-sm" onClick={() => { onChange(''); setEditing(false); }}><X size={14} /> 取消修改</button>}
    </div>
  );
}
