import React from 'react';
import { Settings } from 'lucide-react';
import OptimizeTable from '../OptimizeTable';
import CustomSelect from '../../CustomSelect';
import { RES_GROUPS } from '../util';

const ALL = '__all';

/** OptimizeNotes —— 当前范围内「没有命中」的策略及原因（数据未积累满 / 平台未提供指标 / 已评估无命中），回答「为什么这条策略没有数据」 */
function OptimizeNotes({ list }) {
  const rows = list.filter((s) => s.enabled && s.count === 0 && s.hint);
  if (!rows.length) return null;
  return (
    <section aria-label="暂无命中的策略说明" className="card px-4 py-3">
      <h3 className="text-xs font-semibold text-fg-muted mb-1.5">暂无命中的策略（{rows.length}）</h3>
      <ul className="grid gap-x-8 gap-y-1 grid-cols-1 xl:grid-cols-2 text-[13px]">
        {rows.map((s) => (
          <li key={s.kind} className="min-w-0"><span className="font-medium text-fg">{s.name}</span><span className="text-fg-muted">：{s.hint}</span></li>
        ))}
      </ul>
    </section>
  );
}

/**
 * OptimizeTab —— 运营分析 · 优化建议：「虚拟机侧」「物理侧」两个下拉，选项为「全部」+ 该侧各条策略（带命中数量）；
 * 默认显示虚拟机侧的全部策略；两个下拉与「优化策略」入口在同一行。策略总数随自定义策略增减。
 * 地址栏：?side=vm|phys（全部）或 ?kind=（某条策略）。
 */
export default function OptimizeTab({ d, tick, reloadOv, kind, side, onSelect, onPolicy, keyword }) {
  const list = d.suggestions || [];
  const cur = list.find((s) => s.kind === kind);
  const curSide = cur ? RES_GROUPS.find((g) => g.types.includes(cur.resourceType))?.key : (side === 'phys' ? 'phys' : 'vm');
  const curKind = cur ? cur.kind : '';
  const inScope = list.filter((s) => (curKind ? s.kind === curKind : RES_GROUPS.find((g) => g.key === curSide)?.types.includes(s.resourceType)));
  const opts = (g) => {
    const items = list.filter((s) => g.types.includes(s.resourceType));
    return [{ value: ALL, label: `全部（${items.reduce((n, s) => n + s.count, 0)}）` }, ...items.map((s) => ({ value: s.kind, label: `${s.name}${s.enabled ? '' : '（已停用）'}（${s.count}）` }))];
  };
  return (
    <>
      <section aria-label="优化建议类型" className="card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {RES_GROUPS.map((g) => {
          if (!list.some((s) => g.types.includes(s.resourceType))) return null;
          const active = curSide === g.key;
          return (
            <div key={g.key} className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span className={active ? 'font-semibold text-fg' : ''}>{g.label}</span>
              <div style={{ width: 230 }}>
                <CustomSelect size="sm" clearable={false} aria-label={g.label} placeholder={`选择${g.label}策略`} options={opts(g)} value={active ? (curKind || ALL) : ''}
                  onChange={(v) => onSelect(g.key, v === ALL ? '' : v)} />
              </div>
            </div>
          );
        })}
        {onPolicy && <button type="button" className="btn-default btn-sm ml-auto" onClick={() => onPolicy(curKind)}><Settings size={14} /> 优化策略</button>}
      </section>
      <OptimizeNotes list={inScope} />
      <OptimizeTable key={`${curSide}|${curKind}`} kind={curKind} side={curSide} kindName={cur?.name || (curSide === 'phys' ? '物理侧优化建议' : '虚拟机侧优化建议')} resType={cur?.resourceType || (curSide === 'phys' ? 'host' : 'vm')}
        platforms={d.platforms} refreshKey={tick} onChanged={reloadOv} keyword={keyword} />
    </>
  );
}
