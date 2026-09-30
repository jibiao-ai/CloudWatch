import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect, useId } from 'react';
import { ChevronDown, X, Check, Search } from 'lucide-react';
import Portal from './Portal';

/**
 * CustomSelect —— 全站唯一下拉（禁用原生 <select>）
 * 属性：
 *  options      [{ value, label, disabled, group, hint }]
 *  value        单选为值，多选为数组
 *  onChange     (value) => void
 *  multiple     多选（显示为标签）
 *  searchable   显示搜索框（选项 > 8 时默认开启）
 *  placeholder / disabled / clearable / size('md'|'sm') / id / aria-label / error
 *  pageSize     超长列表分页加载（默认 100，滚动到底自动加载更多）
 * 键盘：↑↓ 切换，Enter 选中，Esc 关闭，Home/End，输入即搜索。
 * 弹层：Portal 挂 body，自动翻转，点击外部关闭。
 */
export default function CustomSelect({
  options = [], value, onChange, multiple = false, searchable, placeholder = '请选择', disabled, clearable, size = 'md', id, error, pageSize = 100, className = '', 'aria-label': ariaLabel, minWidth,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [limit, setLimit] = useState(pageSize);
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const listRef = useRef(null);
  const uid = useId();
  const canSearch = searchable ?? options.length > 8;

  const selected = useMemo(() => (multiple ? (Array.isArray(value) ? value : []) : value), [value, multiple]);
  const isSel = useCallback((v) => (multiple ? selected.includes(v) : selected === v), [multiple, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label}${o.hint || ''}${o.value}`.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const visible = filtered.slice(0, limit);

  // 分组渲染：保持顺序，按 group 归并
  const rows = useMemo(() => {
    const out = [];
    let lastGroup;
    visible.forEach((o) => {
      if (o.group && o.group !== lastGroup) out.push({ type: 'group', label: o.group });
      lastGroup = o.group;
      out.push({ type: 'opt', o });
    });
    return out;
  }, [visible]);
  const optRows = useMemo(() => rows.map((r, i) => (r.type === 'opt' ? i : -1)).filter((i) => i >= 0), [rows]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const place = useCallback(() => {
    if (!trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const panelH = Math.min(320, 48 + Math.min(filtered.length, 8) * 34 + (canSearch ? 44 : 0));
    const below = window.innerHeight - r.bottom;
    const flip = below < panelH + 12 && r.top > below;
    setPos({ left: r.left, width: Math.max(r.width, minWidth || 160), top: flip ? undefined : r.bottom + 6, bottom: flip ? window.innerHeight - r.top + 6 : undefined, maxH: Math.max(160, (flip ? r.top : below) - 16) });
  }, [filtered.length, canSearch, minWidth]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (trigger.current?.contains(e.target) || panel.current?.contains(e.target)) return;
      close();
    };
    const onScroll = (e) => {
      if (panel.current?.contains(e.target)) return;
      place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (open) {
      setLimit(pageSize);
      const idx = optRows.findIndex((ri) => isSel(rows[ri].o.value));
      setActive(idx >= 0 ? idx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const ri = optRows[active];
    listRef.current?.querySelector(`[data-ri="${ri}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, optRows]);

  const pick = (o) => {
    if (o.disabled) return;
    if (multiple) {
      const next = isSel(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value];
      onChange?.(next);
    } else {
      onChange?.(o.value);
      close();
      trigger.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      trigger.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, optRows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(optRows.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[optRows[active]];
      if (r) pick(r.o);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;
  const hasValue = multiple ? selected.length > 0 : selected !== undefined && selected !== null && selected !== '';
  const h = size === 'sm' ? 'min-h-8 text-[13px]' : 'min-h-9 text-sm';

  return (
    <>
      <div
        ref={trigger}
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`group flex items-center gap-1.5 w-full ${h} px-2.5 py-1 rounded-md bg-card border transition cursor-pointer select-none
          ${error ? 'border-danger' : open ? 'border-primary ring-2 ring-primary/20' : 'border-line-strong hover:border-fg-subtle'}
          ${disabled ? 'opacity-60 cursor-not-allowed bg-muted' : ''} ${className}`}
      >
        <div className="flex-1 min-w-0 flex flex-wrap gap-1 items-center">
          {!hasValue && <span className="text-fg-subtle truncate">{placeholder}</span>}
          {hasValue && !multiple && <span className="truncate text-fg">{labelOf(selected)}</span>}
          {hasValue && multiple &&
            selected.map((v) => (
              <span key={v} className="tag-primary !h-5 gap-0.5 max-w-full">
                <span className="truncate">{labelOf(v)}</span>
                {!disabled && (
                  <button type="button" tabIndex={-1} aria-label={`移除 ${labelOf(v)}`} className="hover:opacity-70" onClick={(e) => { e.stopPropagation(); onChange?.(selected.filter((x) => x !== v)); }}>
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
        </div>
        {clearable && hasValue && !disabled && (
          <button type="button" tabIndex={-1} aria-label="清除选择" className="text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); onChange?.(multiple ? [] : ''); }}>
            <X size={14} />
          </button>
        )}
        <ChevronDown size={15} className={`text-fg-subtle shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && pos && (
        <Portal>
          <div
            ref={panel}
            className="fixed z-[300] card-glass !rounded-lg animate-fade-in overflow-hidden flex flex-col shadow-lg"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(pos.maxH, 320) }}
            onKeyDown={onKeyDown}
          >
            {canSearch && (
              <div className="p-2 border-b border-line flex items-center gap-2">
                <Search size={14} className="text-fg-subtle shrink-0" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索..." aria-label="搜索选项" className="flex-1 bg-transparent text-sm outline-none min-w-0" />
              </div>
            )}
            <ul
              id={`${uid}-list`}
              ref={listRef}
              role="listbox"
              aria-multiselectable={multiple || undefined}
              className="overflow-y-auto py-1 flex-1"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24 && limit < filtered.length) setLimit((l) => l + pageSize);
              }}
              tabIndex={-1}
            >
              {rows.length === 0 && <li className="px-3 py-6 text-center text-xs text-fg-muted">无匹配选项</li>}
              {rows.map((r, i) => {
                if (r.type === 'group') return <li key={`g${i}`} className="px-3 pt-2 pb-1 text-[11px] font-semibold text-fg-subtle uppercase tracking-wide">{r.label}</li>;
                const o = r.o;
                const on = isSel(o.value);
                const isActive = optRows[active] === i;
                return (
                  <li
                    key={String(o.value)}
                    data-ri={i}
                    role="option"
                    aria-selected={on}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => setActive(optRows.indexOf(i))}
                    onClick={() => pick(o)}
                    className={`mx-1 px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 cursor-pointer ${o.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${isActive ? 'bg-hover' : ''} ${on ? 'text-primary-text font-medium' : 'text-fg'}`}
                  >
                    {multiple && (
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary text-primary-on' : 'border-line-strong'}`}>
                        {on && <Check size={12} />}
                      </span>
                    )}
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-fg-subtle">{o.hint}</span>}
                    {!multiple && on && <Check size={14} />}
                  </li>
                );
              })}
              {limit < filtered.length && <li className="px-3 py-2 text-center text-xs text-fg-subtle">向下滚动加载更多…</li>}
            </ul>
          </div>
        </Portal>
      )}
    </>
  );
}
