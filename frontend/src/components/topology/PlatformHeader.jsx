import React from 'react';
import { Cloud, BellRing } from 'lucide-react';
import { fromNow } from '../../utils/format';
import { ENV_TYPES, ENV_TAG } from '../../data/dict';
import { HEALTH, pctTone } from './topoUtil';

function Gauge({ label, v }) {
  return (
    <div className="min-w-[110px] flex-1">
      <div className="flex justify-between text-xs mb-1"><span className="text-fg-muted">{label}</span><span className="tabular-nums text-fg">{v == null ? '—' : `${v.toFixed(1)}%`}</span></div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">{v != null && <div className={`h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} />}</div>
    </div>
  );
}

/** 平台摘要：名称 / 环境 / 采集状态 / vCPU·内存·存储使用率 / 未恢复告警 */
export default function PlatformHeader({ graph }) {
  const p = graph.platform; const h = HEALTH[p.health] || HEALTH.unknown;
  const env = ENV_TYPES.find((e) => e.value === p.envType);
  const a = graph.alertTotals;
  return (
    <section className="card px-4 py-3 mb-4" id="topo-platform" aria-label="云平台">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-primary-soft text-primary-text flex items-center justify-center shrink-0"><Cloud size={18} /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-fg truncate">{p.name}</h2><span className={h.tag}>{h.label}</span>{env && <span className={ENV_TAG[p.envType] || 'tag-default'}>{env.label}</span>}</div>
            <div className="text-xs text-fg-muted mt-0.5">
              <span className="font-mono">{p.consoleIp || '—'}</span>
              <span className="mx-2">资产采集：{p.assetAt ? `${p.assetOk ? '成功' : '失败'}（${fromNow(p.assetAt)}）` : '尚未采集'}</span>
              <span>监控采集：{p.monitorAt ? `${p.monitorOk ? '成功' : '失败'}（${fromNow(p.monitorAt)}）` : '尚未采集'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4 flex-1 min-w-[320px]"><Gauge label="vCPU" v={graph.usage.vcpu} /><Gauge label="内存" v={graph.usage.mem} /><Gauge label="存储" v={graph.usage.storage} /></div>
        <div className={`inline-flex items-center gap-1.5 text-sm ${p.alertFiring ? (a.critical ? 'text-danger' : 'text-warning') : 'text-fg-muted'}`}><BellRing size={15} />{p.alertFiring ? `未恢复告警 ${p.alertFiring} 条（严重 ${a.critical}）` : '无未恢复告警'}</div>
      </div>
    </section>
  );
}
