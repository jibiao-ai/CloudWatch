import React from 'react';
import { BellRing } from 'lucide-react';
import { TYPES, HEALTH, pctTone } from './topoUtil';

function Mini({ label, v }) {
  if (v == null) return null;
  return (
    <div className="flex items-center gap-1.5" title={`${label} ${v.toFixed(1)}%`}>
      <span className="text-[10px] text-fg-subtle w-6 shrink-0">{label}</span>
      <span className="flex-1 h-1 rounded-full bg-muted overflow-hidden"><span className={`block h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} /></span>
      <span className="text-[10px] text-fg-muted tabular-nums w-9 text-right">{v.toFixed(0)}%</span>
    </div>
  );
}

/** 拓扑节点卡片：健康度色点 + 名称 + 副标题 + CPU / 内存迷你条 + 告警角标 */
export default function NodeChip({ node, active, onClick }) {
  const h = HEALTH[node.health] || HEALTH.unknown;
  const Icon = TYPES[node.type]?.icon;
  const alerts = node.alerts.critical + node.alerts.warning + node.alerts.info;
  const bars = node.type === 'host' || node.type === 'vm';
  return (
    <button type="button" data-nid={node.id} onClick={() => onClick(node)} title={`${TYPES[node.type]?.label}：${node.name}`}
      className={`relative text-left w-[176px] rounded-md border px-2.5 py-1.5 transition hover:shadow-md ${h.chip} ${node.health === 'off' ? 'opacity-70' : ''} ${active ? 'shadow-md border-fg border-2 -m-px' : ''}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${h.dot}`} />
        {Icon && <Icon size={13} className="text-fg-muted shrink-0" />}
        <span className="text-[13px] font-medium text-fg truncate">{node.name}</span>
      </div>
      <div className="text-[11px] text-fg-muted truncate mt-0.5 pl-3.5 tabular-nums">{node.sub || node.statusText || '—'}</div>
      {bars && (node.cpu != null || node.mem != null) && (
        <div className="mt-1 space-y-0.5 pl-3.5">
          <Mini label="CPU" v={node.cpu} />
          <Mini label="内存" v={node.mem} />
        </div>
      )}
      {alerts > 0 && (
        <span className={`absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 h-4 px-1 rounded-full text-[10px] font-medium ${node.alerts.critical ? 'bg-danger text-primary-on' : 'bg-warning text-primary-on'}`} title={`未恢复告警 ${alerts} 条`}>
          <BellRing size={9} />{alerts}
        </span>
      )}
    </button>
  );
}
