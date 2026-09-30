import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import Portal from './Portal';
import { useStore } from '../store/useStore';
import { authApi } from '../services/api';

/** 用户菜单：个人信息 / 修改密码 / 退出登录（Portal 弹出） */
export default function UserMenu() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    const down = (e) => { if (!btn.current?.contains(e.target) && !panel.current?.contains(e.target)) setOpen(false); };
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const doLogout = async () => {
    setOpen(false);
    try { await authApi.logout(); } catch { /* ignore */ }
    logout();
    navigate('/login', { replace: true });
  };
  const item = 'w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-sm text-fg hover:bg-hover transition';
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-hover transition">
        <span className="w-7 h-7 rounded-full bg-primary text-primary-on flex items-center justify-center text-xs font-semibold">{(user?.name || user?.username || '?').slice(0, 1).toUpperCase()}</span>
        <span className="hidden md:block text-[13px] text-fg max-w-[100px] truncate">{user?.name || user?.username}</span>
        <ChevronDown size={14} className="text-fg-subtle hidden md:block" />
      </button>
      {open && pos && (
        <Portal>
          <div ref={panel} role="menu" className="fixed z-[300] w-56 card-pop !rounded-xl p-1.5 animate-fade-in" style={{ top: pos.top, right: pos.right }}>
            <div className="px-3 py-2.5 mb-1 border-b border-line">
              <div className="text-sm font-medium text-fg truncate">{user?.name}</div>
              <div className="text-xs text-fg-muted truncate">{user?.email || user?.username}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">{(user?.roleNames || []).map((r) => <span key={r} className="tag-primary">{r}</span>)}</div>
            </div>
            <button role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/profile'); }}><User size={16} className="text-fg-muted" /> 个人信息</button>
            <button role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/change-password'); }}><KeyRound size={16} className="text-fg-muted" /> 修改密码</button>
            <div className="my-1 border-t border-line" />
            <button role="menuitem" className={`${item} !text-danger`} onClick={doLogout}><LogOut size={16} /> 退出登录</button>
          </div>
        </Portal>
      )}
    </>
  );
}
