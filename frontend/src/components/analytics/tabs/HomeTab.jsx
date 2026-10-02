import React from 'react';
import { Layers, MonitorCog, HardDrive, Server, Database, ChevronRight } from 'lucide-react';
import StatCard from '../../StatCard';
import Panel from '../Panel';
import PlatformTable from '../PlatformTable';
import { AllocPanel, UsePanel, TrendPanel } from '../Blocks';
import { formatNumber } from '../../../utils/format';

/** HomeTab —— 运营分析 · 总览：资源数量、分配率与使用率、云主机趋势、优化建议入口、所属云平台汇总 */
export default function HomeTab({ d, tick, onOpt }) {
  const t = d.totals;
  const okN = d.platforms.filter((p) => p.collectedAt && p.ok).length;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Layers} label="已对接云平台" value={formatNumber(t.platforms)} hint={`${okN} 个采集正常`} />
        <StatCard icon={MonitorCog} tone="success" label="云主机" value={formatNumber(t.vms)} />
        <StatCard icon={HardDrive} tone="warning" label="磁盘" value={formatNumber(t.disks)} />
        <StatCard icon={Server} tone="info" label="宿主机" value={formatNumber(t.hosts)} />
        <StatCard icon={Database} tone="info" label="存储器" value={formatNumber(t.pools)} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <AllocPanel rates={d.rates} />
        <UsePanel rates={d.rates} />
      </div>
      <TrendPanel title="云主机趋势" kind="vm" suffix=" 台" refreshKey={tick} />
      <Panel title="云主机优化建议">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(d.suggestions || []).map((s) => (
            <button key={s.kind} type="button" onClick={() => onOpt(s.kind)} className="text-left rounded-lg border border-line px-4 py-3 hover:bg-hover transition flex items-center justify-between gap-2">
              <span>
                <span className="block text-[13px] font-medium text-fg">{s.name}{!s.enabled && <span className="ml-1.5 text-xs text-fg-subtle font-normal">（策略已停用）</span>}</span>
                <span className="block mt-1"><span className="text-2xl font-semibold text-fg tabular-nums">{s.count}</span><span className="text-xs text-fg-muted ml-1">台</span></span>
              </span>
              <ChevronRight size={16} className="text-fg-subtle shrink-0" />
            </button>
          ))}
        </div>
      </Panel>
      <PlatformTable platforms={d.platforms} />
    </>
  );
}
