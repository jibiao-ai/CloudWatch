import React from 'react';
import { Layers, MonitorCog, HardDrive, Server, Database, ChevronRight } from 'lucide-react';
import StatCard from '../../StatCard';
import Panel from '../Panel';
import Carousel from '../../Carousel';
import PlatformTable from '../PlatformTable';
import { AllocPanel, UsePanel, TrendPanel } from '../Blocks';
import { RES_GROUPS, RES_UNIT } from '../util';
import { formatNumber } from '../../../utils/format';

/** HomeTab —— 运营中心 · 总览：资源数量、分配率与使用率；虚拟机趋势 / 优化建议 / 各云平台资源汇总以横向轮播展示（每 60 秒自动切换） */
export default function HomeTab({ d, tick, onOpt, keyword }) {
  const t = d.totals;
  const okN = d.platforms.filter((p) => p.collectedAt && p.ok).length;
  const suggest = (
    <Panel title="优化建议">
      <div className="space-y-4">
        {RES_GROUPS.map((g) => {
          const items = (d.suggestions || []).filter((s) => g.types.includes(s.resourceType));
          if (!items.length) return null;
          return (
            <section key={g.key} aria-label={g.label}>
              <h4 className="text-xs font-semibold text-fg-muted mb-2">{g.label}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {items.map((s) => (
                  <button key={s.kind} type="button" onClick={() => onOpt(s.kind)} className="text-left rounded-lg border border-line px-4 py-3 hover:bg-hover transition flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-fg truncate">{s.name}{!s.enabled && <span className="ml-1.5 text-xs text-fg-subtle font-normal">（已停用）</span>}</span>
                      <span className="block mt-1"><span className="text-2xl font-semibold text-fg tabular-nums">{s.count}</span><span className="text-xs text-fg-muted ml-1">{RES_UNIT[s.resourceType] || '个'}</span></span>
                    </span>
                    <ChevronRight size={16} className="text-fg-subtle shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
  const slides = [
    { key: 'trend', label: '虚拟机趋势', node: <TrendPanel title="虚拟机趋势" kind="vm" suffix=" 台" refreshKey={tick} /> },
    { key: 'suggest', label: '优化建议', node: suggest },
    { key: 'platforms', label: '各云平台资源汇总', node: <PlatformTable platforms={d.platforms} keyword={keyword} /> },
  ];
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Layers} label="已对接云平台" value={formatNumber(t.platforms)} hint={`${okN} 个采集正常`} />
        <StatCard icon={MonitorCog} tone="success" label="云主机" value={formatNumber(t.vms)} />
        <StatCard icon={HardDrive} tone="warning" label="磁盘" value={formatNumber(t.disks)} />
        <StatCard icon={Server} tone="info" label="计算节点" value={formatNumber(t.hosts)} />
        <StatCard icon={Database} tone="info" label="集群存储" value={formatNumber(t.pools)} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <AllocPanel rates={d.rates} />
        <UsePanel rates={d.rates} />
      </div>
      <Carousel ariaLabel="总览分页" idPrefix="home-slide" slides={slides} />
    </>
  );
}
