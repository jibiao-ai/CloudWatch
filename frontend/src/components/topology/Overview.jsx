import React from 'react';
import { BellRing, Cloud, Server, Monitor, TriangleAlert } from 'lucide-react';
import StatCard from '../StatCard';
import EmptyState from '../EmptyState';
import { ENV_TYPES, ENV_TAG } from '../../data/dict';
import { fromNow } from '../../utils/format';
import { TYPES, HEALTH, pctTone } from './topoUtil';

const ORDER = ['phys', 'host', 'vm', 'volume', 'port', 'pool'];

function Usage({ label, v }) {
  return (
    <div className="flex items-center gap-2 text-xs" title={v == null ? `${label}：暂无数据` : `${label} ${v.toFixed(1)}%`}>
      <span className="w-14 text-fg-muted shrink-0">{label}</span>
      <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">{v != null && <span className={`block h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} />}</span>
      <span className="w-12 text-right tabular-nums text-fg">{v == null ? '—' : `${v.toFixed(1)}%`}</span>
    </div>
  );
}

function PlatformCard({ item, onOpen }) {
  const p = item.platform;
  const h = HEALTH[p.health] || HEALTH.unknown;
  const alerts = item.alerts.critical + item.alerts.warning + item.alerts.info;
  const env = ENV_TYPES.find((e) => e.value === p.envType);
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
        <span className={h.tag}>{h.label}</span>
      </header>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        {ORDER.map((t) => {
          const c = item.counts[t] || { total: 0, abnormal: 0, off: 0 };
          const Icon = TYPES[t].icon;
          return (
            <div key={t} className="min-w-0" title={`${TYPES[t].label}：共 ${c.total}，异常/告警 ${c.abnormal}，已停止 ${c.off}`}>
              <div className="flex items-center gap-1 text-[11px] text-fg-muted truncate"><Icon size={11} className="shrink-0" />{TYPES[t].label}</div>
              <div className="text-base font-semibold text-fg tabular-nums leading-tight">{c.total}
                {c.abnormal > 0 && <span className="ml-1 text-xs font-medium text-danger">{c.abnormal} 异常</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Usage label="vCPU" v={item.usage.vcpu} />
        <Usage label="内存" v={item.usage.mem} />
        <Usage label="存储" v={item.usage.storage} />
      </div>
      <footer className="flex items-center justify-between gap-2 pt-2 border-t border-line text-xs text-fg-muted">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1" title={p.assetAt ? `资产采集：${p.assetOk ? '成功' : '失败'}（${fromNow(p.assetAt)}）` : '资产尚未采集'}>
            <span className={`w-1.5 h-1.5 rounded-full ${!p.assetAt ? 'bg-fg-subtle' : p.assetOk ? 'bg-success' : 'bg-danger'}`} />资产
          </span>
          <span className="inline-flex items-center gap-1" title={p.monitorAt ? `监控采集：${p.monitorOk ? '成功' : '失败'}（${fromNow(p.monitorAt)}）` : '监控尚未采集'}>
            <span className={`w-1.5 h-1.5 rounded-full ${!p.monitorAt ? 'bg-fg-subtle' : p.monitorOk ? 'bg-success' : 'bg-danger'}`} />监控
          </span>
          <span className={`inline-flex items-center gap-1 ${alerts ? (item.alerts.critical ? 'text-danger' : 'text-warning') : ''}`}><BellRing size={12} />{alerts ? `${alerts} 条告警` : '无告警'}</span>
        </span>
        <button type="button" className="btn-default btn-sm shrink-0" onClick={() => onOpen(p.id)}>查看拓扑</button>
      </footer>
    </article>
  );
}

/** 第 0 层：全局总览（全部云平台 → 各层资源数量 / 健康度 / 使用率 / 告警） */
export default function Overview({ items, onOpen }) {
  if (!items.length) return <div className="card"><EmptyState title="暂无云平台" description="请先在「系统管理 → 平台管理」中对接云平台" /></div>;
  const sum = (t, k) => items.reduce((a, i) => a + ((i.counts[t] || {})[k] || 0), 0);
  const alerts = items.reduce((a, i) => a + i.alerts.critical + i.alerts.warning + i.alerts.info, 0);
  const critical = items.reduce((a, i) => a + i.alerts.critical, 0);
  const bad = items.filter((i) => i.platform.health === 'danger' || i.platform.health === 'warning').length;
  const abn = ORDER.reduce((a, t) => a + sum(t, 'abnormal'), 0);
  return (
    <div className="space-y-4" id="topo-overview">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Cloud} label="云平台" value={items.length} hint={bad ? `${bad} 个平台需关注` : '全部平台健康'} tone={bad ? 'warning' : 'success'} />
        <StatCard icon={Server} label="物理节点 / 计算节点" value={`${sum('phys', 'total')} / ${sum('host', 'total')}`} hint="配置中心" tone="primary" />
        <StatCard icon={Monitor} label="虚拟机" value={sum('vm', 'total')} hint={`已停止 ${sum('vm', 'off')} 台`} tone="info" />
        <StatCard icon={critical ? TriangleAlert : BellRing} label="未恢复告警" value={alerts} hint={abn ? `${abn} 个资源异常 / 告警` : critical ? `严重 ${critical} 条` : '告警中心'} tone={critical ? 'danger' : alerts ? 'warning' : 'success'} />
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {items.map((it) => <PlatformCard key={it.platform.id} item={it} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
