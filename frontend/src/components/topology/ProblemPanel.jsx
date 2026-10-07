import React, { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { TYPES, HEALTH } from './topoUtil';

const SHOW = 12;

/** 异常资源（资源自身状态异常）：严重优先，点击直达（宿主机 / 虚拟机 / 存储池） */
export default function ProblemPanel({ problems, onPick }) {
  const [all, setAll] = useState(false);
  const list = all ? problems : problems.slice(0, SHOW);
  return (
    <section className="card p-3" id="topo-problems" aria-label="异常资源">
      <h3 className="text-sm font-semibold text-fg flex items-center gap-1.5 mb-2"><CircleAlert size={14} />异常资源<span className="text-xs text-fg-subtle font-normal">共 {problems.length} · 异常优先</span></h3>
      {problems.length === 0 ? <div className="text-sm text-fg-muted py-4 text-center">当前没有状态异常的资源</div> : (
        <ul className="max-h-[420px] overflow-y-auto">
          {list.map((p) => {
            const h = HEALTH[p.node.health] || HEALTH.unknown;
            return (
              <li key={p.node.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => onPick(p.node)} className="w-full flex gap-2 items-start text-left py-1.5 px-1 rounded hover:bg-hover">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${h.dot}`} />
                  <span className="text-xs text-fg-muted w-[52px] shrink-0 mt-px">{TYPES[p.node.type]?.label}</span>
                  <span className="min-w-0 flex-1">
                    <b className="text-[13px] text-fg block truncate">{p.node.name}</b>
                    <span className="text-xs text-fg-subtle block truncate" title={p.node.reasons[0]}>{p.node.reasons[0] || h.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {problems.length > SHOW && <button type="button" className="btn-ghost btn-sm mt-2 w-full" onClick={() => setAll((v) => !v)}>{all ? '收起' : `展开其余 ${problems.length - SHOW} 条`}</button>}
    </section>
  );
}
