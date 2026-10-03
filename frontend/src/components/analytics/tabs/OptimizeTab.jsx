import React from 'react';
import OptimizeTable from '../OptimizeTable';
import { RES_GROUPS } from '../util';

/** OptimizeTab —— 运营分析 · 优化建议：虚拟机侧 / 物理侧（物理机、集群存储、云硬盘）两组策略，每条策略带命中数量，可忽略 / 取消忽略；策略总数随自定义策略增减 */
export default function OptimizeTab({ d, tick, reloadOv, kind, onKind }) {
  const list = d.suggestions || [];
  const cur = list.find((s) => s.kind === kind) || list[0];
  return (
    <>
      <nav aria-label="优化建议类型" className="card px-4 py-3 space-y-3">
        {RES_GROUPS.map((g) => {
          const items = list.filter((s) => g.types.includes(s.resourceType));
          if (!items.length) return null;
          return (
            <div key={g.key} className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span className="w-[72px] shrink-0 pt-1.5 text-xs font-semibold text-fg-muted">{g.label}</span>
              <div className="flex flex-wrap gap-2">
                {items.map((s) => (
                  <button key={s.kind} type="button" aria-pressed={cur?.kind === s.kind} onClick={() => onKind(s.kind)}
                    className={`px-3 h-8 rounded-md border text-[13px] transition whitespace-nowrap ${cur?.kind === s.kind ? 'border-primary bg-primary-soft text-primary-text font-medium' : 'border-line text-fg-muted hover:text-fg hover:bg-hover'}`}>
                    {s.name}{s.enabled ? '' : '（已停用）'} <span className="tabular-nums ml-1">{s.count}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      {cur && <OptimizeTable key={cur.kind} kind={cur.kind} kindName={cur.name} resType={cur.resourceType} platforms={d.platforms} refreshKey={tick} onChanged={reloadOv} />}
    </>
  );
}
