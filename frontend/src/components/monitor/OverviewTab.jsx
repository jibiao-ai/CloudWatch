import React from 'react';
import { Cpu, HardDrive, MemoryStick, MonitorCog, Activity, Gauge, Server, Layers } from 'lucide-react';
import StatCard from '../StatCard';
import CapacityBar from '../CapacityBar';
import HealthTag from './HealthTag';
import TrendCard from './TrendCard';
import GlobalSearch from './GlobalSearch';
import CustomSelect from '../CustomSelect';
import { aggregateSummary } from '../../utils/monitorAgg';
import { formatBytes, formatNumber } from '../../utils/format';

const MIB = 1024 * 1024; // 内存 usage/total 按 MiB 换算（文档示例 584704 = 571 GiB；与 Nova memory_mb 同量纲）
const mem = (v) => formatBytes(v * MIB);
const n = (v, f = formatNumber) => (v == null ? '—' : f(v));

/** OverviewTab —— 总览：默认汇总全部云平台（可按所属云平台筛选）：KPI + 容量条 + 云主机状态分布 + 健康状态 + 趋势；items 为所选范围内 [{platform, snap}]，rows 为其合并后的条目 */
export default function OverviewTab({ items, rows, plat, range, refreshKey, onJump }) {
  const s = aggregateSummary(items);
  const ids = items.map((it) => it.platform.id);
  if (!s) return null;
  const vm = s.instances;
  const vmTotal = ['running', 'error', 'shutdown', 'recycleBin', 'others'].reduce((a, k) => a + (vm[k] || 0), 0);
  const memRatio = s.memory.percent;
  const alertFiring = items.reduce((a, it) => a + (it.snap?.alertFiring || 0), 0);
  const badSvc = rows.services.filter((x) => x.state != null && x.state !== 0).length;
  const badDisk = rows.disks.filter((d) => d.healthy && !/^(ok|healthy|passed|normal|0)$/i.test(d.healthy)).length;
  return (
    <div className="space-y-5">
      <GlobalSearch rows={rows} onJump={onJump}
        aside={<div className="w-[200px]"><CustomSelect size="sm" clearable placeholder="全部云平台" aria-label="所属云平台" value={plat.value} onChange={plat.onChange} options={plat.options} /></div>} />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Server} label="物理节点" value={formatNumber(rows.nodes.length)} hint={`磁盘 ${rows.disks.length} 块 · 异常 ${badDisk} 块`} tone={badDisk ? 'danger' : 'primary'} />
        <StatCard icon={MonitorCog} label="虚拟机（Nova）" value={formatNumber(rows.vms.length)} hint={`运行中 ${rows.vms.filter((v) => v.status === 'ACTIVE').length} 台`} tone="info" />
        <StatCard icon={Layers} label="平台服务" value={formatNumber(rows.services.length)} hint={`异常 ${badSvc} 项`} tone={badSvc ? 'danger' : 'success'} />
        <StatCard icon={Activity} label="告警中" value={formatNumber(alertFiring)} hint="来自 EMLA 告警" tone={alertFiring ? 'warning' : 'success'} />
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Cpu} label="vCPU 使用率" value={n(s.vcpu.percent, (v) => `${v.toFixed(1)}%`)} hint={s.vcpu.total != null ? `${formatNumber(s.vcpu.usage)} / ${formatNumber(s.vcpu.total)} 核` : '未采集到'} tone="primary" />
        <StatCard icon={MemoryStick} label="云主机内存使用率" value={n(memRatio, (v) => `${v.toFixed(2)}%`)} hint={s.memory.total != null ? `${mem(s.memory.usage)} / ${mem(s.memory.total)}（按 MiB 换算，原始值 ${formatNumber(s.memory.usage)} / ${formatNumber(s.memory.total)}）` : '未采集到'} tone="info" />
        <StatCard icon={HardDrive} label="存储实际使用率" value={n(s.storage.usedPercent, (v) => `${v.toFixed(1)}%`)} hint={s.storage.totalBytes != null ? `${formatBytes(s.storage.usedBytes)} / ${formatBytes(s.storage.totalBytes)}` : '未采集到'} tone="warning" />
        <StatCard icon={MonitorCog} label="云主机总数" value={formatNumber(vmTotal)} hint={`运行 ${n(vm.running)} · 异常 ${n(vm.error)} · 关机 ${n(vm.shutdown)}`} tone={vm.error > 0 ? 'danger' : 'success'} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <div className="card p-4"><CapacityBar label="vCPU（已用 / 总量）" used={s.vcpu.usage || 0} total={s.vcpu.total || 0} format={(v) => `${formatNumber(v)} 核`} /></div>
        <div className="card p-4"><CapacityBar label="云主机内存（已用 / 总量）" used={s.memory.usage || 0} total={s.memory.total || 0} format={mem} /></div>
        <div className="card p-4"><CapacityBar label="存储集群（实际使用 / 总量）" used={s.storage.usedBytes || 0} total={s.storage.totalBytes || 0} format={(v) => formatBytes(v)} /></div>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <div className="card p-4 xl:col-span-2">
          <h3 className="text-sm font-medium text-fg mb-3">云主机状态分布</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[['running', '运行中', 'tag-success'], ['error', '异常', 'tag-danger'], ['shutdown', '已关机', 'tag-default'], ['recycleBin', '回收站', 'tag-warning'], ['others', '其他', 'tag-info']].map(([k, name, cls]) => (
              <div key={k} className="rounded-lg bg-muted px-3 py-2.5">
                <span className={cls}>{name}</span>
                <div className="text-xl font-semibold text-fg tabular-nums mt-1.5">{n(vm[k])}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-medium text-fg mb-3">健康状态与 IOPS</h3>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex items-center justify-between"><dt className="text-fg-muted">控制面服务</dt><dd><HealthTag value={s.controlPlaneHealth} /></dd></div>
            <div className="flex items-center justify-between"><dt className="text-fg-muted">存储服务</dt><dd><HealthTag value={s.storageServiceHealth} /></dd></div>
            <div className="flex items-center justify-between"><dt className="text-fg-muted">存储集群</dt><dd><HealthTag value={s.storageHealth} /></dd></div>
            <div className="flex items-center justify-between"><dt className="text-fg-muted flex items-center gap-1.5"><Activity size={14} />集群读 IOPS</dt><dd className="font-medium tabular-nums">{n(s.iopsRead)}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-fg-muted flex items-center gap-1.5"><Gauge size={14} />集群写 IOPS</dt><dd className="font-medium tabular-nums">{n(s.iopsWrite)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <TrendCard providerIds={ids} range={range} refreshKey={refreshKey} metric="vcpu_percent" title="vCPU 使用率" unit="%" domain={[0, 100]} seriesIndex={0} />
        <TrendCard providerIds={ids} range={range} refreshKey={refreshKey} metric="memory_percent" title="云主机内存使用率" unit="%" domain={[0, 100]} seriesIndex={1} />
        <TrendCard providerIds={ids} range={range} refreshKey={refreshKey} metric="storage_used_percent" title="存储实际使用率" unit="%" domain={[0, 100]} seriesIndex={3} />
        <TrendCard providerIds={ids} range={range} refreshKey={refreshKey} metric="iops_read" agg="sum" title="集群读 IOPS" seriesIndex={2} />
      </div>
    </div>
  );
}
