import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';

/** SearchInput —— 搜索框（防抖 300ms）。属性：value / onChange(v) / placeholder / delay / width */
export default function SearchInput({ value, onChange, placeholder = '搜索', delay = 300, width = 240, 'aria-label': aria }) {
  const [local, setLocal] = useState(value || '');
  const debounced = useDebounce(local, delay);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    if ((value || '') !== local && value === '') setLocal('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative" style={{ width, maxWidth: '100%' }}>
      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
      <input className="field !pl-8 !pr-7" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} aria-label={aria || placeholder} />
      {local && (
        <button type="button" aria-label="清空搜索" className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" onClick={() => setLocal('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
