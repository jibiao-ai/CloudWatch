import React from 'react';
import { Cloud, HardDrive, Monitor, Server } from 'lucide-react';
import EmptyState from '../EmptyState';
import { ENV_TYPES, ENV_TAG } from '../../data/dict';
import { fromNow } from '../../utils/format';
import { pctTone, TYPES } from './topoUtil';
import { KpiCard, StateBar, StateLine } from './StatusUi';
import { stat } from './topoModel';
import OverviewHeat from './OverviewHeat';

const ORDER = ['phys', 'host', 'vm', 'volume', 'port', 'pool'];

function Usage({ label, v }) {
  return (
    <div className="flex items-center gap-2 text-xs" title={v == null ? `${label}：暂无数据` : `${label} ${v.toFixed(1)}%`}>
      <span className="w-12 text-fg-muted shrink-0">{label}</span>
      <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">{v != null && <span className={`block h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} />}</span>
      <span className="w-12 text-right tabular-nums text-fg">{v == null ? '—' : `${v.toFixed(1)}%`}</span>
    </div>
  );
}

function PlatformCard({ item, onOpen }) {
  const p = item.platform;
  const env = ENV_TYPES.find((e) => e.value === p.envType);
  const o = item.orphan || {};
  return (
    <article className="card p-4 flex flex-col gap-3" data-platform={p.id}>
      <header className="flex items-start gap-2.5">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.health === 'danger' ? 'bg-danger-soft text-danger' : p.health === 'warning' ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary-text'}`}><Cloud size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-fg truncate" title={p.name}>{p.name}</h3>
            {env && <span className={ENV_TAG[p.envType] || 'tag-default'}>{env.label}</span>}
          </div>
          <div className="text-xs text-fg-muted mt-0.5 font-mono">{p.consoleIp || '—'}</div>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        {ORDER.map((t) => {
          const s = stat(item.counts, t);
          const Icon = TYPES[t].icon;
          return (
            <div key={t} className="min-w-0" title={`${TYPES[t].label}：共 ${s.total}；异常 ${s.danger}，警示 ${s.warning}，停止 ${s.off}`}>
              <div className="flex items-center gap-1 text-[11px] text-fg-muted truncate"><Icon size={11} className="shrink-0" />{TYPES[t].label}</div>
              <div className="text-base font-semibold text-fg tabular-nums leading-tight mb-1">{s.total}</div>
              <StateBar s={s} />
              <StateLine s={{ ...s, off: 0 }} okText="正常" className="mt-0.5" />
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Usage label="vCPU" v={item.usage.vcpu} />
        <Usage label="内存" v={item.usage.mem} />
        <Usage label="存储" v={item.usage.storage} />
      </div>
      {o.count > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-fg-muted" title="未挂载到任何虚拟机的云硬盘">
          <HardDrive size={12} className="shrink-0" />未挂载云硬盘 <b className="text-fg tabular-nums">{o.count}</b> 块（{Math.round(o.sizeGb)} GB）
          {o.idle90 > 0 && <span className="text-warning">· 闲置超 90 天 {o.idle90}</span>}
        </div>
      )}
      <footer className="flex items-center justify-between gap-2 pt-2 border-t border-line text-xs text-fg-muted">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1" title={p.assetAt ? `资产采集：${p.assetOk ? '成功' : '失败'}（${fromNow(p.assetAt)}）` : '资产尚未采集'}>
            <span className={`w-1.5 h-1.5 rounded-full ${!p.assetAt ? 'bg-fg-subtle' : p.assetOk ? 'bg-success' : 'bg-danger'}`} />资产
          </span>
        </span>
        <button type="button" className="btn-default btn-sm shrink-0" onClick={() => onOpen(p.id)}>查看拓扑</button>
      </footer>
    </article>
  );
}

/** 第 0 层：全局总览（跨平台热力图 + 全局 KPI + 各云平台卡片） */
export default function Overview({ items, onOpen }) {
  if (!items.length) return <div className="card"><EmptyState title="暂无云平台" description="请先在「系统管理 → 平台管理」中对接云平台" /></div>;
  const agg = (t) => items.reduce((a, i) => { const s = stat(i.counts, t); return { total: a.total + s.total, danger: a.danger + s.danger, warning: a.warning + s.warning, off: a.off + s.off, ok: a.ok + s.ok }; }, { total: 0, danger: 0, warning: 0, off: 0, ok: 0 });
  const orphan = items.reduce((a, i) => ({ count: a.count + (i.orphan?.count || 0), sizeGb: a.sizeGb + (i.orphan?.sizeGb || 0), idle90: a.idle90 + (i.orphan?.idle90 || 0) }), { count: 0, sizeGb: 0, idle90: 0 });
  const platS = { total: items.length, danger: items.filter((i) => i.platform.health === 'danger').length, warning: items.filter((i) => i.platform.health === 'warning').length, off: 0 };
  platS.ok = platS.total - platS.danger - platS.warning;
  return (
    <div className="space-y-4" id="topo-overview">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Cloud} label="云平台" s={platS} unit="个" />
        <KpiCard icon={Server} label="物理节点" s={agg('phys')} unit="个" />
        <KpiCard icon={Server} label="计算节点" s={agg('host')} unit="个" />
        <KpiCard icon={Monitor} label="虚拟机" s={agg('vm')} unit="台" />
      </div>
      <OverviewHeat items={items} onOpen={onOpen} />
      {orphan.count > 0 && (
        <div className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" id="topo-orphan-total">
          <span className="inline-flex items-center gap-1.5 font-medium text-fg"><HardDrive size={15} />未挂载云硬盘治理</span>
          <span className="text-fg-muted">全局共 <b className="text-fg tabular-nums">{orphan.count}</b> 块 / {Math.round(orphan.sizeGb)} GB 未挂载到虚拟机{orphan.idle90 > 0 && <>，其中闲置超 90 天 <b className="text-warning tabular-nums">{orphan.idle90}</b> 块</>}</span>
          <span className="text-xs text-fg-subtle">进入各平台拓扑，在页面底部「未挂载云硬盘」分区治理</span>
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
        {items.map((it) => <PlatformCard key={it.platform.id} item={it} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
