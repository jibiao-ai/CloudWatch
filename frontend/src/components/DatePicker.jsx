import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import Portal from './Portal';
import { pad } from '../utils/format';

/**
 * DatePicker —— 自绘日期（时间）选择器（禁用原生 input[type=date|datetime-local|time|month|week]），交互与 CustomSelect 一致：
 * 触发器 + Portal 浮层 + 键盘（Esc 关闭 / Enter 选中 / 方向键移动）。
 * 属性：value('YYYY-MM-DD'；withTime 时为 'YYYY-MM-DDTHH:mm') / onChange(value) / min / max（同 value 格式的日期上下限，按日比较）
 *       withTime / clearable / placeholder / size('sm'|'md') / disabled / aria-label / width
 */
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v || '');
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3], hh: +(m[4] || 0), mm: +(m[5] || 0) } : null;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export default function DatePicker({ value, onChange, min, max, withTime = false, clearable = false, placeholder = '选择日期', size = 'sm', disabled, 'aria-label': ariaLabel, width, className = '' }) {
  const cur = parse(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: cur?.y ?? today.getFullYear(), m: cur?.m ?? today.getMonth() });
  const [time, setTime] = useState({ hh: cur?.hh ?? 0, mm: cur?.mm ?? 0 });
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const minD = min ? min.slice(0, 10) : '';
  const maxD = max ? max.slice(0, 10) : '';

  const close = useCallback(() => setOpen(false), []);
  const place = useCallback(() => {
    if (!trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const h = withTime ? 372 : 330;
    const below = window.innerHeight - r.bottom;
    const flip = below < h + 12 && r.top > below;
    setPos({ left: Math.min(r.left, window.innerWidth - 276), top: flip ? undefined : r.bottom + 6, bottom: flip ? window.innerHeight - r.top + 6 : undefined });
  }, [withTime]);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!trigger.current?.contains(e.target) && !panel.current?.contains(e.target)) close(); };
    const onScroll = (e) => { if (!panel.current?.contains(e.target)) place(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); };
  }, [open, close, place]);
  useEffect(() => {
    if (open) {
      const c = parse(value);
      setView({ y: c?.y ?? today.getFullYear(), m: c?.m ?? today.getMonth() });
      setTime({ hh: c?.hh ?? 0, mm: c?.mm ?? 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, i) => {
      const dt = new Date(view.y, view.m, i - first + 1);
      return { key: ymd(dt.getFullYear(), dt.getMonth(), dt.getDate()), d: dt.getDate(), out: i < first || i >= first + days };
    });
  }, [view]);
  const disabledDay = (k) => (minD && k < minD) || (maxD && k > maxD);
  const emit = (day, t = time) => onChange?.(withTime ? `${day}T${pad(t.hh)}:${pad(t.mm)}` : day);
  const pickDay = (k) => {
    if (disabledDay(k)) return;
    emit(k);
    if (!withTime) { close(); trigger.current?.focus(); }
  };
  const shift = (dm) => setView((v) => { const d = new Date(v.y, v.m + dm, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const setT = (k, raw, hi) => {
    const n = clamp(parseInt(raw.replace(/\D/g, '') || '0', 10), 0, hi);
    const t = { ...time, [k]: n };
    setTime(t);
    if (cur) emit(value.slice(0, 10), t);
  };
  const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate());
  const selKey = cur ? ymd(cur.y, cur.m, cur.d) : '';
  const text = cur ? `${ymd(cur.y, cur.m, cur.d)}${withTime ? ` ${pad(cur.hh)}:${pad(cur.mm)}` : ''}` : '';
  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) { if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); } return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); trigger.current?.focus(); }
  };
  const nav = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-hover transition';

  return (
    <>
      <div ref={trigger} role="combobox" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown} onClick={() => !disabled && setOpen((o) => !o)} style={width ? { width } : undefined}
        className={`group flex items-center gap-1.5 ${width ? '' : 'w-full'} ${size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm'} px-2.5 rounded-md bg-card border transition cursor-pointer select-none ${open ? 'border-fg-subtle' : 'border-line-strong hover:border-fg-subtle'} ${disabled ? 'opacity-60 cursor-not-allowed bg-muted' : ''} ${className}`}>
        <CalendarDays size={14} className="text-fg-subtle shrink-0" />
        <span className={`flex-1 min-w-0 truncate tabular-nums ${text ? 'text-fg' : 'text-fg-subtle'}`}>{text || placeholder}</span>
        {clearable && text && !disabled && (
          <button type="button" tabIndex={-1} aria-label="清除日期" className="text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); onChange?.(''); }}><X size={13} /></button>
        )}
      </div>
      {open && pos && (
        <Portal>
          <div ref={panel} role="dialog" aria-label="选择日期" onKeyDown={onKeyDown} className="fixed z-[300] card-pop !rounded-lg animate-fade-in shadow-lg w-[264px] p-3" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex">
                <button type="button" className={nav} aria-label="上一年" onClick={() => shift(-12)}><ChevronsLeft size={15} /></button>
                <button type="button" className={nav} aria-label="上个月" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
              </div>
              <span className="text-sm font-medium text-fg tabular-nums">{view.y} 年 {view.m + 1} 月</span>
              <div className="flex">
                <button type="button" className={nav} aria-label="下个月" onClick={() => shift(1)}><ChevronRight size={15} /></button>
                <button type="button" className={nav} aria-label="下一年" onClick={() => shift(12)}><ChevronsRight size={15} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-fg-subtle mb-1">{WEEK.map((w) => <span key={w} className="h-6 leading-6">{w}</span>)}</div>
            <div role="grid" className="grid grid-cols-7 gap-y-0.5">
              {cells.map((c) => {
                const on = c.key === selKey;
                const dis = disabledDay(c.key);
                return (
                  <button key={c.key} type="button" role="gridcell" aria-selected={on} aria-label={c.key} disabled={dis} onClick={() => pickDay(c.key)}
                    className={`h-8 w-8 mx-auto rounded-md text-[13px] tabular-nums transition ${on ? 'bg-primary text-primary-on font-medium' : c.out ? 'text-fg-subtle hover:bg-hover' : 'text-fg hover:bg-hover'} ${c.key === todayKey && !on ? 'border border-primary text-primary-text' : ''} ${dis ? 'opacity-35 cursor-not-allowed hover:bg-transparent' : ''}`}>
                    {c.d}
                  </button>
                );
              })}
            </div>
            {withTime && (
              <div className="mt-2 pt-2 border-t border-line flex items-center gap-2 text-[13px] text-fg-muted">
                <span>时间</span>
                <input className="field !h-7 !w-[48px] !px-2 text-center" inputMode="numeric" aria-label="小时" value={pad(time.hh)} onChange={(e) => setT('hh', e.target.value, 23)} />
                <span>:</span>
                <input className="field !h-7 !w-[48px] !px-2 text-center" inputMode="numeric" aria-label="分钟" value={pad(time.mm)} onChange={(e) => setT('mm', e.target.value, 59)} />
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-line flex items-center justify-between">
              <button type="button" className="text-xs text-primary-text hover:underline disabled:opacity-40 disabled:no-underline" disabled={disabledDay(todayKey)} onClick={() => { setView({ y: today.getFullYear(), m: today.getMonth() }); pickDay(todayKey); }}>今天</button>
              {withTime && <button type="button" className="btn-primary btn-sm" onClick={() => { if (!cur) emit(todayKey); close(); }}>确定</button>}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
