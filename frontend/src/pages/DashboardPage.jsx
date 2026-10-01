import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { Cloud, Cpu, RefreshCw, Server, Siren, MonitorCog } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusDot from '../components/StatusDot';
import CapacityBar from '../components/CapacityBar';
import RangeSelector, { defaultRange } from '../components/RangeSelector';
import CustomSelect from '../components/CustomSelect';
import FullscreenButton from '../components/FullscreenButton';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import ChartTooltip from '../components/ChartTooltip';
import LoadingButton from '../components/LoadingButton';
import { dashboardApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useChartPalette } from '../hooks/useChartPalette';
import { useStore } from '../store/useStore';
import { ENV_TAG, ENV_TYPES } from '../data/dict';
import { formatBytes, formatDateTime, formatNumber, fromNow, pad } from '../utils/format';

const fmtAxis = (range) => (t) => {
  const d = new Date(t);
  return range.end - range.start > 2 * 86400e3 ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function TrendChart({ title, data, prev, dataKey, unit, pal, range, domain, fmt }) {
  const gid = `g-${dataKey}`;
  const merged = useMemo(() => data.map((d, i) => ({ ...d, prev: prev?.[i]?.[dataKey] })), [data, prev, dataKey]);
  return (
    <div className="card p-4">
      <div className="text-sm font-medium text-fg mb-3">{title}</div>
      <div className="h-[240px]">
        <ResponsiveContainer>
          <AreaChart data={merged} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pal.primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={pal.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={pal.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtAxis(range)} stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: pal.grid }} minTickGap={36} />
            <YAxis stroke={pal.axis} tick={{ fill: pal.axis, fontSize: 11 }} tickLine={false} axisLine={false} domain={domain} unit={unit} />
            <RTooltip cursor={{ stroke: pal.axis, strokeDasharray: '4 4' }} content={<ChartTooltip labelFormatter={(t) => formatDateTime(t, false)} valueFormatter={(v) => `${v}${unit}`} />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: pal.axis }} />
            <Area type="monotone" dataKey={dataKey} name={fmt || title} stroke={pal.primary} strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 4 }} />
            {prev && <Area type="monotone" dataKey="prev" name="上一周期" stroke={pal.series[4]} strokeWidth={1.5} strokeDasharray="5 4" fill="none" dot={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** DashboardPage —— 运维概览：KPI / 各平台容量（vCPU、内存、存储）/ 趋势 / 高负载节点 */
export default function DashboardPage() {
  const pal = useChartPalette();
  const boxRef = useRef(null);
  const providers = useStore((s) => s.providers);
  const [range, setRange] = useState(defaultRange('1d'));
  const [pids, setPids] = useState([]);
  const params = { providerIds: pids.join(',') || undefined };
  const ov = useAsync(() => dashboardApi.getOverview(params), [pids.join(',')]);
  const tr = useAsync(() => dashboardApi.getTrend({ start: range.start, end: range.end, compare: range.compare ? 1 : 0 }), [range.key, range.start, range.compare]);
  const t = ov.data?.totals;

  const refresh = () => { ov.reload(); tr.reload(); };
  return (
    <div ref={boxRef} className="bg-bg">
      <PageHeader
        title="运维概览"
        description="平台 → 集群 → 节点 → 云主机 → 存储的全链路健康与容量一览"
        actions={<>
          <div className="w-[240px]"><CustomSelect multiple clearable placeholder="全部平台" aria-label="筛选平台" value={pids} onChange={setPids} options={providers.map((p) => ({ value: p.id, label: p.name }))} /></div>
          <LoadingButton icon={RefreshCw} loading={ov.refreshing || tr.refreshing} onClick={refresh}>刷新</LoadingButton>
          <FullscreenButton containerRef={boxRef} />
        </>}
      />
      <div className="mb-5"><RangeSelector value={range} onChange={setRange} /></div>

      {ov.loading ? <Skeleton.Cards count={5} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div> : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={Cloud} label="纳管平台" value={`${t.online} / ${t.providers}`} hint="在线 / 总数" tone="primary" />
            <StatCard icon={Server} label="计算节点" value={formatNumber(t.nodes)} hint="超融合节点合计" tone="info" />
            <StatCard icon={MonitorCog} label="云主机" value={formatNumber(t.vms)} hint="运行中 + 已停止" tone="success" />
            <StatCard icon={Cpu} label="vCPU 分配率" value={`${(t.vcpu.total ? (t.vcpu.used / t.vcpu.total) * 100 : 0).toFixed(1)}%`} hint={`${formatNumber(t.vcpu.used)} / ${formatNumber(t.vcpu.total)} 核`} tone="warning" />
            <StatCard icon={Siren} label="活跃告警" value={formatNumber(t.alerts)} hint="含预警与严重" tone={t.alerts > 10 ? 'danger' : 'warning'} />
          </div>

          <div className="grid gap-4 mt-5 grid-cols-1 xl:grid-cols-3">
            <div className="card p-4"><CapacityBar label="vCPU（已用配额 / 全部配额）" used={t.vcpu.used} total={t.vcpu.total} format={(n) => `${formatNumber(n)} 核`} /></div>
            <div className="card p-4"><CapacityBar label="内存（已用配额 / 全部配额）" used={t.ram.used} total={t.ram.total} format={(n) => `${formatNumber(n)} GiB`} /></div>
            <div className="card p-4"><CapacityBar label="存储（Ceph 已用 / 总容量）" used={t.storage.used} total={t.storage.total} format={(n) => formatBytes(n)} /></div>
          </div>
        </>
      )}

      <div className="grid gap-4 mt-5 grid-cols-1 xl:grid-cols-2">
        {tr.loading ? (<><Skeleton.Chart /><Skeleton.Chart /></>) : tr.error ? <div className="card xl:col-span-2"><ErrorState error={tr.error} onRetry={tr.reload} /></div> : (
          <>
            <TrendChart title="计算节点 CPU 使用率" fmt="CPU 使用率" dataKey="cpu" unit="%" domain={[0, 100]} data={tr.data.current} prev={tr.data.previous} pal={pal} range={range} />
            <TrendChart title="计算节点 内存使用率" fmt="内存使用率" dataKey="mem" unit="%" domain={[0, 100]} data={tr.data.current} prev={tr.data.previous} pal={pal} range={range} />
          </>
        )}
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-line">
          <h2 className="text-sm font-medium text-fg">各平台概况</h2>
          <Link to="/system/providers" className="text-[13px] text-primary-text hover:underline">平台管理 →</Link>
        </div>
        {ov.loading ? <Skeleton.Table rows={4} cols={6} /> : !ov.data?.providers?.length ? <EmptyState title="暂无纳管平台" description="请先在「平台管理」中新增并验证平台" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead><tr>{['云管标识', '环境', '状态', '云主机', 'vCPU', '内存', '存储', '告警', '最后同步'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {ov.data.providers.map((p) => (
                  <tr key={p.id} className="hover:bg-hover/60 transition-colors">
                    <td className="td"><div className="font-medium">{p.name}</div><div className="text-xs text-fg-subtle">{p.consoleIp}</div></td>
                    <td className="td"><span className={ENV_TAG[p.envType]}>{ENV_TYPES.find((e) => e.value === p.envType)?.label}</span></td>
                    <td className="td"><StatusDot status={p.status} label /></td>
                    <td className="td tabular-nums">{formatNumber(p.vms)}</td>
                    <td className="td w-[150px]"><CapacityBar compact used={p.vcpu.used} total={p.vcpu.total} /></td>
                    <td className="td w-[150px]"><CapacityBar compact used={p.ram.used} total={p.ram.total} /></td>
                    <td className="td w-[150px]"><CapacityBar compact used={p.storage.used} total={p.storage.total} /></td>
                    <td className="td">{p.alerts > 0 ? <span className={p.alerts > 4 ? 'tag-danger' : 'tag-warning'}>{p.alerts}</span> : <span className="text-fg-subtle">0</span>}</td>
                    <td className="td text-fg-muted text-[13px]">{fromNow(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="px-4 py-3 border-b border-line"><h2 className="text-sm font-medium text-fg">高负载计算节点 TOP 6</h2><p className="text-xs text-fg-muted mt-0.5">指标口径：node_cpu_utilization_total / (node_memory_total − node_memory_free) / node_load5</p></div>
        {ov.loading ? <Skeleton.Table rows={4} cols={5} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead><tr>{['节点', '所属平台', 'CPU 使用率', '内存使用率', '5 分钟负载'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {(ov.data?.topNodes || []).map((n) => (
                  <tr key={n.provider + n.node} className="hover:bg-hover/60 transition-colors">
                    <td className="td font-medium">{n.node}</td><td className="td text-fg-muted">{n.provider}</td>
                    <td className="td w-[200px]"><CapacityBar compact used={n.cpu} total={100} /></td>
                    <td className="td w-[200px]"><CapacityBar compact used={n.mem} total={100} /></td>
                    <td className="td tabular-nums">{n.load5}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
