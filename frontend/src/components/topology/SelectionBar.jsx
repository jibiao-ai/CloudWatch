import React from 'react';
import { Waypoints, PanelRight, X } from 'lucide-react';
import { TYPES, HEALTH } from './topoUtil';

/** 选中节点条：说明当前高亮的是哪个资源的上下游链路，并提供「详情 / 仅看关联 / 取消」 */
export default function SelectionBar({ node, focusOnly, onFocus, onDetail, onClear }) {
  const h = HEALTH[node.health] || HEALTH.unknown;
  return (
    <div className="card px-4 py-2.5 mb-4 flex flex-wrap items-center gap-3 border-primary" id="topo-selection" role="status">
      <span className={`w-2 h-2 rounded-full ${h.dot}`} />
      <span className="text-sm text-fg">已选中 <b>{TYPES[node.type]?.label}</b>：{node.name}</span>
      <span className={h.tag}>{h.label}</span>
      <span className="text-xs text-fg-muted">已高亮其上下游关联链路（实线 = 承载，虚线 = 挂载 / 网卡 / 存储）</span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="btn-default btn-sm" onClick={onFocus}><Waypoints size={14} />{focusOnly ? '显示全部资源' : '仅看关联链路'}</button>
        <button type="button" className="btn-primary btn-sm" onClick={onDetail}><PanelRight size={14} />查看详情</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onClear} aria-label="取消选择"><X size={14} />取消</button>
      </div>
    </div>
  );
}
