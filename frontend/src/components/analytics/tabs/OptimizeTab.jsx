import React from 'react';
import { Seg } from '../Panel';
import OptimizeTable from '../OptimizeTable';

/** OptimizeTab —— 运营分析 · 云主机优化：降配 / 升配 / 回收三类建议（带数量）切换，各自可忽略 / 取消忽略 */
export default function OptimizeTab({ d, tick, reloadOv, kind, onKind }) {
  const list = d.suggestions || [];
  const cur = list.find((s) => s.kind === kind);
  const items = list.map((s) => ({ value: s.kind, label: `${s.name}${s.enabled ? '' : '（已停用）'} ${s.count}` }));
  return (
    <>
      <div><Seg label="建议类型" items={items} value={kind} onChange={onKind} /></div>
      <OptimizeTable key={kind} kind={kind} kindName={cur?.name} platforms={d.platforms} refreshKey={tick} onChanged={reloadOv} />
    </>
  );
}
