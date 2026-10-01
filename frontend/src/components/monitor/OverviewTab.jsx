import React from 'react';
import { Cpu, HardDrive, MemoryStick, MonitorCog, Activity, Gauge } from 'lucide-react';
import StatCard from '../StatCard';
import CapacityBar from '../CapacityBar';
import HealthTag from './HealthTag';
import TrendCard from './TrendCard';
import { formatBytes, formatNumber } from '../../utils/format';

const MIB = 1024 * 1024; // 内存 usage/total 按 MiB 换算（文档示例 584704 = 571 GiB；与 Nova memory_mb 同量纲）
const mem = (v) => formatBytes(v * MIB);
const n = (v, f = formatNumber) => (v == null ? '—' : f(v));

/** OverviewTab —— 总览：KPI + 容量条 + 云主机状态分布 + 健康状态 + 趋势 */
export default function OverviewTab({ snap, providerId, range, refreshKey }) {
  const s = snap.summary;
  if (!s) return null;
  const vm = s.instances;
  const vmTotal = ['running', 'error', 'shutdown', 'recycleBin', 'others'].reduce((a, k) => a + (vm[k] || 0), 0);
  const memRatio = s.memory.percent;
  return (
    <div className="space-y-5">
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
        <TrendCard providerId={providerId} range={range} refreshKey={refreshKey} metric="vcpu_percent" title="vCPU 使用率" unit="%" domain={[0, 100]} seriesIndex={0} />
        <TrendCard providerId={providerId} range={range} refreshKey={refreshKey} metric="memory_percent" title="云主机内存使用率" unit="%" domain={[0, 100]} seriesIndex={1} />
        <TrendCard providerId={providerId} range={range} refreshKey={refreshKey} metric="storage_used_percent" title="存储实际使用率" unit="%" domain={[0, 100]} seriesIndex={3} />
        <TrendCard providerId={providerId} range={range} refreshKey={refreshKey} metric="iops_read" title="集群读 IOPS" seriesIndex={2} />
      </div>
    </div>
  );
}
