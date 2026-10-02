import React from 'react';
import { BellRing } from 'lucide-react';
import { fromNow } from '../../utils/format';
import { SEVERITY } from './topoUtil';

/** 告警面板：平台内全部未恢复告警；点击定位到关联节点 */
export default function AlertPanel({ alerts, byId, onPick }) {
  return (
    <section className="card p-4" id="topo-alerts" aria-label="未恢复告警">
      <h3 className="text-sm font-semibold text-fg flex items-center gap-1.5 mb-3"><BellRing size={15} />未恢复告警<span className="text-xs text-fg-subtle font-normal">{alerts.length}</span></h3>
      {alerts.length === 0 ? <div className="text-sm text-fg-muted py-4 text-center">当前没有未恢复告警</div> : (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {alerts.map((a) => {
            const n = byId.get(a.nodeId);
            const s = SEVERITY[a.severity] || SEVERITY.info;
            return (
              <li key={a.id}>
                <button type="button" disabled={!n} onClick={() => n && onPick(n)} className="w-full text-left rounded-md border border-line px-2.5 py-2 hover:bg-hover disabled:hover:bg-transparent">
                  <div className="flex items-center gap-2"><span className={s[1]}>{s[0]}</span><span className="text-[13px] text-fg truncate" title={a.title}>{a.title}</span></div>
                  <div className="text-xs text-fg-muted mt-1 truncate">{n ? `关联：${n.name}` : `节点：${a.nodeName || a.hostIp || '未关联'}`} · {fromNow(a.firedAt)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
