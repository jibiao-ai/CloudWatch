import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * SearchHits —— 运营分析图表类页签的全局搜索结果：在该页签可筛选的对象（所属云平台 / 宿主机 / 集群存储 …）中按关键字匹配，
 * 点击某一项即应用为该页签的筛选条件。
 * 属性：keyword / groups[{ type, items:[{ value, label, sub, ... }], onPick(item) }] / onClear
 */
export default function SearchHits({ keyword, groups, onClear }) {
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return null;
  const hits = groups.flatMap((g) => g.items.filter((it) => `${it.label} ${it.sub || ''}`.toLowerCase().includes(k)).map((it) => ({ ...it, type: g.type, pick: g.onPick })));
  return (
    <section aria-label="搜索结果" className="card px-4 py-3">
      <header className="flex items-center gap-2 text-[13px]">
        <Search size={14} className="text-fg-subtle" />
        <span className="font-medium text-fg">搜索「{keyword}」</span>
        <span className="text-fg-muted">共匹配 {hits.length} 项{hits.length > 12 ? '（仅显示前 12 项）' : ''}，点击即作为筛选条件</span>
        <button type="button" className="ml-auto text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-xs" onClick={onClear}><X size={13} /> 清除搜索</button>
      </header>
      {hits.length ? (
        <ul className="mt-2 grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {hits.slice(0, 12).map((h) => (
            <li key={`${h.type}${h.value}`}>
              <button type="button" className="w-full text-left rounded-lg bg-muted hover:bg-hover px-3 py-2 transition" onClick={() => { h.pick(h); onClear(); }}>
                <span className="tag-default mr-2">{h.type}</span><span className="text-[13px] font-medium text-fg">{h.label}</span>
                {h.sub && <div className="text-xs text-fg-subtle mt-0.5 truncate">{h.sub}</div>}
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="mt-2 text-[13px] text-fg-muted">没有匹配的条目，请换一个关键字</div>}
    </section>
  );
}

/** 把选项（含 providerId）转换为带「所属云平台」副标题的条目 */
export const withPlat = (list = [], plats = []) => list.map((o) => ({ ...o, sub: plats.find((p) => p.value === (o.providerId || o.value))?.label || '' }));
