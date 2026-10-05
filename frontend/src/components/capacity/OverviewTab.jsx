import React, { useMemo } from 'react';
import { Server, Cpu, MemoryStick, HardDrive, MonitorCog, Cable, Database, Layers } from 'lucide-react';
import StatCard from '../StatCard';
import CapacityBar from '../CapacityBar';
import StatusDot from '../StatusDot';
import DataTable from '../DataTable';
import Carousel from '../Carousel';
import SearchInput from '../SearchInput';
import { useClientTable } from '../../hooks/useClientTable';
import { formatNumber, formatDateTime, fromNow, formatBytes } from '../../utils/format';
import { gb, mb, Tag, numCell, PlatCell } from './capUtil';

const KIND_LABEL = { phys: '物理节点', nodes: '计算节点', vms: '虚拟机', volumes: '云硬盘', ports: '虚拟网卡', pools: '集群存储' };
const n0 = (v) => formatNumber(Math.round(v || 0));

/** 使用率卡片：与 StatCard 同款布局（图标 + 标签 + 大号百分比），下方附进度条与已用 / 总量 */
function UsageCard({ icon: Icon, label, used, total, format }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct >= 85 ? 'bg-danger-soft text-danger' : pct >= 70 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success';
  const txt = pct >= 85 ? 'text-danger' : pct >= 70 ? 'text-warning' : 'text-fg';
  return (
    <div className="card p-4 flex items-start gap-3.5 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>{Icon && <Icon size={20} />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-fg-muted">{label}</div>
        <div className={`text-2xl font-semibold tabular-nums mt-0.5 leading-tight ${txt}`}>{pct.toFixed(1)}%</div>
        <div className="mt-1.5"><CapacityBar barOnly compact used={used} total={total} format={format} label={label} /></div>
        <div className="text-xs text-fg-subtle mt-1.5 leading-snug">
          {[['已用', used], ['可用', Math.max(0, total - used)], ['总量', total]].map(([k, v], i) => (
            <React.Fragment key={k}><span className="whitespace-nowrap">{k} {format(v)}{i < 2 ? '，' : ''}</span>{i < 2 ? ' ' : ''}</React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 总览：全部平台资产 KPI + 容量条 + 状态分布 + 各平台汇总（搜索 / 排序 / 分页）；采集明细已独立为「采集明细」页签 */
export default function OverviewTab({ ov, onJump }) {
  const t = ov.totals;
  const columns = useMemo(() => [
    { key: 'name', title: '所属云平台', width: 190, sortable: true, render: (p) => <PlatCell platform={p} /> },
    { key: 'state', title: '采集状态', width: 120, sortable: true, sortBy: (p) => (p.collectedAt ? (p.ok ? 2 : 1) : 0), render: (p) => <StatusDot status={p.collectedAt ? (p.ok ? 'online' : 'warning') : 'unknown'} label={p.collectedAt ? (p.ok ? '正常' : '部分失败') : '未采集'} /> },
    { key: 'collectedAt', title: '最近采集', width: 160, sortable: true, render: (p) => <span className="text-[13px] tabular-nums" title={p.collectedAt ? fromNow(p.collectedAt) : ''}>{p.collectedAt ? formatDateTime(p.collectedAt) : '—'}</span> },
    { key: 'phys', title: '物理节点', width: 90, sortable: true, align: 'right', sortBy: (p) => p.sum.phys, render: (p) => numCell(p.sum.phys, n0) },
    { key: 'nodes', title: '计算节点', width: 90, sortable: true, align: 'right', sortBy: (p) => p.sum.nodes, render: (p) => numCell(p.sum.nodes, n0) },
    { key: 'vms', title: '虚拟机', width: 80, sortable: true, align: 'right', sortBy: (p) => p.sum.vms, render: (p) => numCell(p.sum.vms, n0) },
    { key: 'volumes', title: '云硬盘', width: 80, sortable: true, align: 'right', sortBy: (p) => p.sum.volumeCount, render: (p) => numCell(p.sum.volumeCount, n0) },
    { key: 'ports', title: '虚拟网卡', width: 90, sortable: true, align: 'right', sortBy: (p) => p.sum.ports, render: (p) => numCell(p.sum.ports, n0) },
    { key: 'vcpu', title: 'vCPU 使用率', width: 160, sortable: true, sortBy: (p) => (p.sum.vcpusCap ? p.sum.vcpusUsed / p.sum.vcpusCap : -1), render: (p) => (p.sum.vcpusCap ? <div className="w-[130px]"><CapacityBar compact used={p.sum.vcpusUsed} total={p.sum.vcpusCap} label="vCPU" /></div> : '—') },
    { key: 'mem', title: '内存使用率', width: 160, sortable: true, sortBy: (p) => (p.sum.memMbCap ? p.sum.memMbUsed / p.sum.memMbCap : -1), render: (p) => (p.sum.memMbCap ? <div className="w-[130px]"><CapacityBar compact used={p.sum.memMbUsed} total={p.sum.memMbCap} label="内存" /></div> : '—') },
    { key: 'pool', title: '存储池容量', width: 190, sortable: true, sortBy: (p) => p.sum.poolTotalGb, render: (p) => (p.sum.poolTotalGb ? <div className="w-[160px]"><div className="text-xs text-fg-muted tabular-nums mb-0.5">{gb(p.sum.poolTotalGb - p.sum.poolFreeGb)} / {gb(p.sum.poolTotalGb)}</div><CapacityBar compact used={p.sum.poolTotalGb - p.sum.poolFreeGb} total={p.sum.poolTotalGb} label="存储" /></div> : '—') },
    { key: 'error', title: '采集错误', width: 320, render: (p) => <span className="text-[13px] text-danger break-all">{p.error || ''}</span> },
  ], []);
  const tbl = useClientTable({ rows: ov.platforms, columns, searchText: (p) => `${p.name} ${p.consoleIp} ${p.envType} ${p.error || ''}`, initialSort: { key: 'name', order: 'asc' } });
  const dist = Object.entries(ov.dist || {}).filter(([, l]) => l.length);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Layers} label="已对接云平台" value={ov.platforms.length} hint={`${ov.platforms.filter((p) => p.collectedAt && p.ok).length} 个采集正常`} />
        <StatCard icon={HardDrive} tone="info" label="物理节点" value={n0(t.phys)} hint={`CPU ${n0(t.physCores)} 核，内存 ${formatBytes((t.physMemGb || 0) * 1024 ** 3, 1)}`} />
        <StatCard icon={Server} tone="info" label="计算节点" value={n0(t.nodes)} hint={t.nodesDown ? `${n0(t.nodesDown)} 个宕机` : '全部运行中'} />
        <StatCard icon={MonitorCog} tone="success" label="虚拟机" value={n0(t.vms)} hint={`${n0(t.vmsActive)} 台运行中`} />
        <StatCard icon={HardDrive} tone="warning" label="云硬盘" value={n0(t.volumeCount)} hint={`合计 ${gb(t.volumeGb)}，${n0(t.volumeInUse)} 块使用中`} />
        <StatCard icon={Cable} tone="info" label="虚拟网卡" value={n0(t.ports)} />
        <StatCard icon={Database} label="存储池" value={n0(t.pools)} hint={t.poolsDown ? `${n0(t.poolsDown)} 个异常` : '全部正常'} tone={t.poolsDown ? 'danger' : 'success'} />
        <StatCard icon={Cpu} label="vCPU 总容量（含超分）" value={n0(t.vcpusCap)} hint={`物理 ${n0(t.vcpus)}，已用 ${n0(t.vcpusUsed)}`} />
        <StatCard icon={MemoryStick} label="内存总容量（含超分）" value={mb(t.memMbCap)} hint={`物理 ${mb(t.memMb)}，已用 ${mb(t.memMbUsed)}`} />
        <UsageCard icon={Cpu} label="vCPU 使用率" used={t.vcpusUsed} total={t.vcpusCap} format={n0} />
        <UsageCard icon={MemoryStick} label="内存使用率" used={t.memMbUsed} total={t.memMbCap} format={mb} />
        <UsageCard icon={HardDrive} label="存储使用率" used={t.poolTotalGb - t.poolFreeGb} total={t.poolTotalGb} format={gb} />
      </div>
      <Carousel ariaLabel="容量与平台汇总分页" idPrefix="cap-ov-slide" interval={10000} slides={[
        { key: 'cap', label: '容量与状态分布', node: (
          <>
            <div className="card p-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
              {[['存储池总容量', t.poolTotalGb], ['剩余容量', t.poolFreeGb], ['已分配容量', t.poolAllocatedGb], ['精简置备总容量', t.poolProvisionedGb]].map(([k, v]) => <div key={k}><div className="text-xs text-fg-muted">{k}</div><div className="text-lg font-semibold text-fg tabular-nums">{gb(v)}</div></div>)}
            </div>
            {dist.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {dist.map(([kind, list]) => (
                  <section key={kind} className="card p-4">
                    <h3 className="text-sm font-semibold text-fg mb-2.5">{KIND_LABEL[kind]}状态分布</h3>
                    <div className="flex flex-wrap gap-2">{list.map((d) => <button key={d.label} type="button" className="inline-flex items-center gap-1.5" onClick={() => onJump(kind)}><Tag text={d.label} tone={d.tone} /><span className="tabular-nums text-sm text-fg">{formatNumber(d.count)}</span></button>)}</div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) },
        { key: 'plat', label: '各云平台资产汇总', node: (
          <DataTable columns={columns} rows={tbl.pageRows} rowKey="id" page={tbl.page} pageSize={tbl.pageSize} total={tbl.total} onPageChange={tbl.setPage} pageSizeOptions={[10, 20, 50, 100]}
            sort={tbl.sort} onSortChange={tbl.setSort}
            toolbar={<><h3 className="text-sm font-semibold text-fg mr-2">各云平台资产汇总</h3><SearchInput value={tbl.keyword} onChange={tbl.setKeyword} placeholder="搜索平台名称 / 控制台 IP" width={260} /></>}
            empty={{ title: '暂无已对接的云平台', description: '请先在「平台管理」中新增并验证平台' }} />
        ) },
      ]} />
    </div>
  );
}
