import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, X } from 'lucide-react';
import Portal from '../Portal';
import Skeleton from '../Skeleton';
import { searchApi } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { searchTarget } from './searchNav';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
const TAG = { success: 'tag-success', danger: 'tag-danger', warning: 'tag-warning', info: 'tag-info', default: 'tag-default' };

/** 命中词高亮：用实色底 + 主色文字，不依赖半透明 */
function Hit({ text, words }) {
  if (!text) return null;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return text.split(re).map((s, i) => (i % 2 ? <mark key={i} className="bg-primary-soft text-primary-text rounded-sm px-0.5">{s}</mark> : <span key={i}>{s}</span>));
}

/**
 * GlobalSearch —— 顶栏全局搜索：Ctrl/⌘ + K 或点击打开；覆盖云平台、虚拟机、物理 / 计算节点、云硬盘、虚拟网卡、集群存储、监控、告警、域名映射 / 主机地址。
 * 多个关键词用空格分隔（同时命中）；↑↓ 选择、Enter 跳转、Esc 关闭。
 */
export default function GlobalSearch() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const dq = useDebounce(kw.trim(), 250);
  const [state, setState] = useState({ loading: false, groups: [], error: null, q: '' });
  const [cur, setCur] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const on = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); else { setKw(''); setState({ loading: false, groups: [], error: null, q: '' }); } }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!dq) { setState({ loading: false, groups: [], error: null, q: '' }); return; }
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    searchApi.search(dq).then((r) => { if (id === seq.current) { setState({ loading: false, groups: r.groups || [], error: null, q: dq }); setCur(0); } })
      .catch((e) => { if (id === seq.current) setState({ loading: false, groups: [], error: e, q: dq }); });
  }, [dq, open]);

  const flat = useMemo(() => state.groups.flatMap((g) => g.items), [state.groups]);
  const words = useMemo(() => state.q.split(/\s+/).filter(Boolean), [state.q]);
  const go = useCallback((it) => { setOpen(false); nav(searchTarget(it)); }, [nav]);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(flat.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && flat[cur]) { e.preventDefault(); go(flat[cur]); }
  };
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${cur}"]`)?.scrollIntoView({ block: 'nearest' }); }, [cur]);

  let idx = -1;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hidden md:flex items-center gap-2 h-9 w-56 px-3 rounded-md bg-muted text-fg-subtle text-[13px] hover:bg-hover transition" aria-label="全局搜索" aria-haspopup="dialog" id="global-search-trigger">
        <Search size={15} /> 搜索平台 / 资源…
        <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-card border border-line text-fg-muted">{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="md:hidden btn-icon" aria-label="全局搜索"><Search size={18} /></button>
      {open && (
        <Portal>
          <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[10vh] px-4" role="dialog" aria-modal="true" aria-label="全局搜索">
            <div className="absolute inset-0 animate-fade-in" style={{ background: 'rgb(var(--scrim) / 0.5)' }} onMouseDown={() => setOpen(false)} />
            <div className="relative w-full max-w-[720px] card-pop animate-fade-in flex flex-col max-h-[72vh] overflow-hidden" onKeyDown={onKey}>
              <div className="flex items-center gap-2 px-4 h-14 border-b border-line shrink-0">
                <Search size={18} className="text-fg-subtle shrink-0" />
                <input ref={inputRef} id="global-search-input" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索虚拟机 / 服务器 / IP / 主机地址 / MAC / 序列号 / 告警…（多个词用空格分隔）"
                  className="flex-1 h-10 bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none border-0 focus:ring-0" aria-label="搜索关键字" autoComplete="off" spellCheck={false} />
                {kw && <button type="button" className="btn-icon !w-8 !h-8" aria-label="清空" onClick={() => { setKw(''); inputRef.current?.focus(); }}><X size={15} /></button>}
                <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-line text-fg-muted">Esc</kbd>
              </div>
              <div ref={listRef} className="overflow-y-auto flex-1 min-h-[120px]" role="listbox" aria-label="搜索结果">
                {!kw.trim() ? (
                  <div className="px-5 py-8 text-center text-[13px] text-fg-muted leading-6">
                    输入关键字，搜索全平台的资源并直接跳转<br />
                    <span className="text-fg-subtle">支持：虚拟机名称 / ID、物理服务器名称、各类 IP 地址（管理 / 业务 / 浮动）、MAC、序列号、主机地址（域名映射）、云平台、告警、监控节点 / 磁盘 / 服务</span>
                  </div>
                ) : state.loading && !state.groups.length ? <div className="p-4"><Skeleton.Table rows={4} cols={2} /></div>
                  : state.error ? <div className="px-5 py-8 text-center text-[13px] text-danger">搜索失败：{state.error.message}</div>
                    : !state.groups.length ? <div className="px-5 py-8 text-center text-[13px] text-fg-muted">没有找到与「{state.q}」匹配的资源<div className="text-fg-subtle mt-1">仅展示你有权限查看的内容；可尝试更短的关键字或部分 IP</div></div>
                      : state.groups.map((g) => (
                        <div key={g.key} role="group" aria-label={g.label}>
                          <div className="px-4 pt-3 pb-1 text-xs font-medium text-fg-muted flex items-center justify-between sticky top-0 bg-card z-[1]">
                            <span>{g.label}</span><span className="text-fg-subtle font-normal">{g.total > g.items.length ? `显示 ${g.items.length} / 共 ${g.total}` : `${g.total} 项`}</span>
                          </div>
                          {g.items.map((it) => {
                            idx += 1; const i = idx; const active = i === cur;
                            return (
                              <button key={`${g.key}-${it.providerId}-${it.id}`} type="button" role="option" aria-selected={active} data-idx={i} onMouseMove={() => setCur(i)} onClick={() => go(it)}
                                className={`w-full text-left px-4 py-2 flex items-start gap-3 transition-colors ${active ? 'bg-hover' : ''}`}>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-fg truncate"><Hit text={it.title} words={words} /></span>
                                    {it.tag && <span className={`${TAG[it.tone] || 'tag-default'} shrink-0`}>{it.tag}</span>}
                                  </div>
                                  {it.subtitle && <div className="text-xs text-fg-muted truncate mt-0.5"><Hit text={it.subtitle} words={words} /></div>}
                                  {it.match && it.match !== '名称' && <div className="text-xs text-fg-subtle truncate mt-0.5">命中 {it.match}：<span className="text-fg-muted font-mono"><Hit text={it.matchValue} words={words} /></span></div>}
                                </div>
                                <div className="shrink-0 text-right text-xs text-fg-subtle pt-0.5">
                                  {it.providerName && <div className="truncate max-w-[140px]">{it.providerName}</div>}
                                  {active && <div className="mt-1 inline-flex items-center gap-1 text-fg-muted"><CornerDownLeft size={12} />跳转</div>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
              </div>
              <div className="px-4 h-9 border-t border-line flex items-center gap-4 text-[11px] text-fg-subtle shrink-0">
                <span>↑↓ 选择</span><span>Enter 跳转</span><span>Esc 关闭</span>
                {state.groups.length > 0 && <span className="ml-auto">共 {state.groups.reduce((n, g) => n + g.total, 0)} 项匹配</span>}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
