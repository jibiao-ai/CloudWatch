import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Checkbox from '../Checkbox';
import { PERMISSION_MODULES } from '../../data/permissions';

/**
 * PermissionTree —— 功能权限树：按模块分组（菜单级 + 按钮级），全选 / 反选 / 展开折叠
 * 属性：value(string[]) / onChange / readOnly
 * 规则：按钮级权限依赖菜单级 —— 勾选按钮自动勾选菜单；取消菜单同时取消其按钮。
 */
export default function PermissionTree({ value, onChange, readOnly }) {
  const all = value.includes('*');
  const set = useMemo(() => new Set(value), [value]);
  const [open, setOpen] = useState(() => Object.fromEntries(PERMISSION_MODULES.map((m) => [m.code, true])));
  const has = (c) => all || set.has(c);
  const commit = (s) => onChange([...s]);
  const toggleMenu = (m, v) => {
    const s = new Set(value);
    if (v) s.add(m.menu); else { s.delete(m.menu); m.buttons.forEach((b) => s.delete(b.code)); }
    commit(s);
  };
  const toggleBtn = (m, b, v) => {
    const s = new Set(value);
    if (v) { s.add(b.code); s.add(m.menu); } else s.delete(b.code);
    commit(s);
  };
  const toggleModule = (m, v) => {
    const s = new Set(value);
    [m.menu, ...m.buttons.map((b) => b.code)].forEach((c) => (v ? s.add(c) : s.delete(c)));
    commit(s);
  };
  const allCodes = PERMISSION_MODULES.flatMap((m) => [m.menu, ...m.buttons.map((b) => b.code)]);
  const selectAll = () => commit(new Set(allCodes));
  const clear = () => commit(new Set());
  const invert = () => commit(new Set(allCodes.filter((c) => !set.has(c))));
  const dis = readOnly || all;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" className="btn-default btn-sm" disabled={dis} onClick={selectAll}>全选</button>
        <button type="button" className="btn-default btn-sm" disabled={dis} onClick={invert}>反选</button>
        <button type="button" className="btn-default btn-sm" disabled={dis} onClick={clear}>清空</button>
        <span className="w-px h-5 bg-line mx-1" />
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(Object.fromEntries(PERMISSION_MODULES.map((m) => [m.code, true])))}>展开全部</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen({})}>折叠全部</button>
        <span className="ml-auto text-xs text-fg-muted">{all ? '拥有全部权限' : `已选 ${value.length} / ${allCodes.length}`}</span>
      </div>
      <div className="rounded-lg border border-line divide-y divide-line">
        {PERMISSION_MODULES.map((m) => {
          const codes = [m.menu, ...m.buttons.map((b) => b.code)];
          const n = codes.filter(has).length;
          return (
            <div key={m.code}>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/50">
                <button type="button" className="text-fg-muted w-5" aria-label={`${open[m.code] ? '折叠' : '展开'}${m.name}`} aria-expanded={!!open[m.code]} onClick={() => setOpen((o) => ({ ...o, [m.code]: !o[m.code] }))} disabled={!m.buttons.length}>
                  {m.buttons.length > 0 && <ChevronRight size={15} className={`transition-transform ${open[m.code] ? 'rotate-90' : ''}`} />}
                </button>
                <Checkbox checked={n === codes.length} indeterminate={n > 0 && n < codes.length} disabled={dis} onChange={(v) => toggleModule(m, v)} label={<span className="font-medium">{m.name}</span>} />
                <span className="text-xs text-fg-subtle ml-1">{n}/{codes.length}</span>
              </div>
              {open[m.code] && (
                <div className="px-3 py-2.5 pl-10 flex flex-wrap gap-x-6 gap-y-2">
                  <Checkbox checked={has(m.menu)} disabled={dis} onChange={(v) => toggleMenu(m, v)} label={<span className="text-fg-muted">菜单可见</span>} />
                  {m.buttons.map((b) => <Checkbox key={b.code} checked={has(b.code)} disabled={dis} onChange={(v) => toggleBtn(m, b, v)} label={b.name} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
