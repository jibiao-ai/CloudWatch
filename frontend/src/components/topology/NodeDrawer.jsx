import React from 'react';
import { ExternalLink, Crosshair } from 'lucide-react';
import Drawer from '../Drawer';
import { formatDateTime } from '../../utils/format';
import { TYPES, HEALTH, SEVERITY, pctTone } from './topoUtil';

function Bar({ label, v }) {
  if (v == null) return null;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="text-fg-muted">{label}</span><span className="tabular-nums text-fg">{v.toFixed(1)}%</span></div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
    </div>
  );
}

/** 节点详情抽屉：健康度 / 原因 / 使用率 / 关联告警 / 上下游 / 属性；可跳转资产详情 */
export default function NodeDrawer({ node, graph, idx, onPick, onAsset, onClose }) {
  if (!node) return <Drawer open={false} />;
  const h = HEALTH[node.health] || HEALTH.unknown;
  const t = TYPES[node.type];
  const alerts = graph.alerts.filter((a) => a.nodeId === node.id);
  const ups = (idx.inn.get(node.id) || []).map((i) => idx.byId.get(i)).filter(Boolean);
  const downs = (idx.out.get(node.id) || []).map((i) => idx.byId.get(i)).filter(Boolean);
  const group = (list) => Object.entries(list.reduce((m, n) => { (m[n.type] = m[n.type] || []).push(n); return m; }, {}));
  return (
    <Drawer open title={`${t?.label || '资源'}：${node.name}`} subtitle={graph.platform.name} width={520} onClose={onClose}
      footer={node.ref ? <button type="button" className="btn-primary" onClick={() => onAsset(node)}><ExternalLink size={15} />查看资产详情</button> : null}>
      <div className="space-y-5" id="topo-node-drawer">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={h.tag}>{h.label}</span>
          {node.statusText && <span className="tag-default">{node.statusText}</span>}
          {node.sub && <span className="text-xs text-fg-muted">{node.sub}</span>}
        </div>
        {node.reasons.length > 0 && (
          <section><h3 className="text-[13px] font-semibold text-fg mb-2">健康度判定依据</h3>
            <ul className="space-y-1">{node.reasons.map((r, i) => <li key={i} className="text-sm text-fg flex gap-2"><span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${h.dot}`} />{r}</li>)}</ul>
          </section>
        )}
        {(node.cpu != null || node.mem != null) && (
          <section><h3 className="text-[13px] font-semibold text-fg mb-2">使用率（监控中心）</h3>
            <div className="space-y-2.5">
              <Bar label={node.type === 'pool' ? '存储使用率' : 'CPU 使用率'} v={node.type === 'pool' ? node.mem : node.cpu} />
              {node.type !== 'pool' && <Bar label="内存使用率" v={node.mem} />}
            </div>
          </section>
        )}
        <section><h3 className="text-[13px] font-semibold text-fg mb-2">关联告警（告警中心）<span className="ml-1.5 text-xs text-fg-subtle font-normal">{alerts.length}</span></h3>
          {alerts.length === 0 ? <div className="text-sm text-fg-muted">该资源当前没有未恢复告警</div> : (
            <ul className="space-y-2">{alerts.map((a) => (
              <li key={a.id} className="rounded-md border border-line px-3 py-2">
                <div className="flex items-center gap-2"><span className={(SEVERITY[a.severity] || SEVERITY.info)[1]}>{(SEVERITY[a.severity] || SEVERITY.info)[0]}</span><span className="text-sm text-fg truncate" title={a.title}>{a.title}</span></div>
                <div className="text-xs text-fg-muted mt-1">触发于 {formatDateTime(a.firedAt)}{a.acked ? ' · 已确认' : ''}</div>
              </li>))}</ul>
          )}
        </section>
        {(ups.length > 0 || downs.length > 0) && (
          <section><h3 className="text-[13px] font-semibold text-fg mb-2">上下游关系</h3>
            {[['上游', ups], ['下游', downs]].filter(([, l]) => l.length).map(([lab, l]) => (
              <div key={lab} className="mb-3">
                <div className="text-xs text-fg-muted mb-1.5">{lab}</div>
                {group(l).map(([ty, ns]) => (
                  <div key={ty} className="mb-1.5">
                    <div className="text-xs text-fg-subtle mb-1">{TYPES[ty]?.label}（{ns.length}）</div>
                    <div className="flex flex-wrap gap-1.5">{ns.slice(0, 12).map((n) => (
                      <button key={n.id} type="button" onClick={() => onPick(n)} className="inline-flex items-center gap-1 h-6 px-2 rounded border border-line text-xs text-fg hover:bg-hover max-w-[200px]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(HEALTH[n.health] || HEALTH.unknown).dot}`} /><span className="truncate">{n.name}</span>
                      </button>))}
                      {ns.length > 12 && <span className="text-xs text-fg-subtle self-center">等 {ns.length} 个</span>}
                    </div>
                  </div>))}
              </div>))}
          </section>
        )}
        <section><h3 className="text-[13px] font-semibold text-fg mb-2 flex items-center gap-1.5"><Crosshair size={13} />基本属性（配置中心）</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {node.attrs.filter((a) => a[1] !== '' && a[1] != null).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-fg-muted">{k}</dt><dd className="text-sm text-fg mt-0.5 break-all">{v}</dd></div>)}
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
