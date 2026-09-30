import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** PasswordInput —— 密码框（明文切换）。仅 props 透传，不落 console / localStorage / URL */
export default function PasswordInput({ value, onChange, className = '', autoComplete = 'current-password', ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} className={`field !pr-9 ${className}`} value={value} onChange={onChange} autoComplete={autoComplete} spellCheck={false} {...rest} />
      <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} aria-label={show ? '隐藏密码' : '显示密码'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded text-fg-subtle hover:text-fg">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
