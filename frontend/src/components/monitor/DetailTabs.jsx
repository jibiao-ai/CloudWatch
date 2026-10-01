import React from 'react';
import CapacityBar from '../CapacityBar';
import EmptyState from '../EmptyState';
import HealthTag from './HealthTag';
import TrendCard from './TrendCard';
import { formatBytes } from '../../utils/format';

const Table = ({ heads, children, min = 760 }) => (
  <div className="card overflow-x-auto">
    <table className="w-full border-collapse" style={{ minWidth: min }}>
      <thead><tr>{heads.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
const none = (title) => <div className="card"><EmptyState title={title} description="该接口本次未返回数据，可在「采集明细」查看原因" /></div>;

export function NodesTab({ snap, providerId, range, refreshKey }) {
  const [sel, setSel] = React.useState('');
  if (!snap.nodes.length) return none('暂无计算节点数据');
  return (
    <div className="space-y-4">
      <Table heads={['节点', 'IP', 'CPU 使用率', '用户态', '内核态', 'IO 等待', '内存使用率', '内存总量', '空闲内存']}>
        {snap.nodes.map((n) => (
          <tr key={n.name} className={`hover:bg-hover/60 cursor-pointer ${sel === n.name ? 'bg-primary-soft' : ''}`} onClick={() => setSel(n.name)}>
            <td className="td font-medium">{n.name}</td><td className="td"><code className="text-[13px]">{n.hostIp}</code></td>
            <td className="td w-[170px]">{n.cpuPercent != null ? <CapacityBar compact used={n.cpuPercent} total={100} /> : '—'}</td>
            <td className="td tabular-nums">{n.cpuUser ?? '—'}</td><td className="td tabular-nums">{n.cpuSystem ?? '—'}</td><td className="td tabular-nums">{n.cpuIowait ?? '—'}</td>
            <td className="td w-[170px]">{n.memPercent != null ? <CapacityBar compact used={n.memPercent} total={100} /> : '—'}</td>
            <td className="td tabular-nums">{n.memTotal != null ? formatBytes(n.memTotal) : '—'}</td><td className="td tabular-nums">{n.memFree != null ? formatBytes(n.memFree) : '—'}</td>
          </tr>
        ))}
      </Table>
      <div className="text-xs text-fg-muted">点击一行查看该节点的历史趋势</div>
      {sel && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          <TrendCard providerId={providerId} range={range} refreshKey={refreshKey} metric="node_cpu_percent" target={sel} title={`${sel} CPU 使用率`} unit="%" domain={[0, 100]} />
          <TrendCard providerId={providerId} range={range} refreshKey={refreshKey} metric="node_mem_percent" target={sel} title={`${sel} 内存使用率`} unit="%" domain={[0, 100]} seriesIndex={1} />
        </div>
      )}
    </div>
  );
}

export function DisksTab({ snap }) {
  if (!snap.disks.length) return none('暂无磁盘数据');
  const bad = (d) => d.healthy && !/^(ok|healthy|passed|normal|0)$/i.test(d.healthy);
  return (
    <Table min={1000} heads={['节点', '设备', '类型', '型号', '序列号', '容量', '使用', '健康', '已用寿命', '用途', 'OSD', '通电时长(h)']}>
      {snap.disks.map((d, i) => (
        <tr key={`${d.node}${d.device}${i}`} className="hover:bg-hover/60">
          <td className="td"><div className="font-medium">{d.node}</div><div className="text-xs text-fg-subtle">{d.hostIp}</div></td>
          <td className="td"><code className="text-[13px]">{d.device}</code></td><td className="td"><span className="tag-default">{d.type || '—'}</span></td>
          <td className="td">{d.model}</td><td className="td text-fg-muted text-[13px]">{d.serial}</td><td className="td tabular-nums">{d.capacity}</td><td className="td tabular-nums">{d.usage}</td>
          <td className="td">{bad(d) ? <span className="tag-danger">{d.healthy}</span> : <span className="tag-success">{d.healthy || '—'}</span>}</td>
          <td className="td tabular-nums">{d.usedLife === '-' ? '—（非 SSD）' : d.usedLife}</td><td className="td">{d.purpose}</td><td className="td">{d.osdId}</td><td className="td tabular-nums">{d.powerOnHours}</td>
        </tr>
      ))}
    </Table>
  );
}

export function ServicesTab({ snap }) {
  const s = snap.summary;
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-6 text-[13px]">
        <span>控制面服务 <HealthTag value={s?.controlPlaneHealth} /></span><span>存储服务 <HealthTag value={s?.storageServiceHealth} /></span><span>存储集群 <HealthTag value={s?.storageHealth} /></span>
      </div>
      {snap.services.length ? (
        <Table min={480} heads={['服务指标', '状态']}>
          {snap.services.map((v) => <tr key={v.name} className="hover:bg-hover/60"><td className="td"><code className="text-[13px]">{v.name}</code></td><td className="td"><HealthTag value={v.state} okText="正常" badText="异常" /></td></tr>)}
        </Table>
      ) : none('暂无服务状态数据')}
    </div>
  );
}

export function StepsTab({ snap }) {
  if (!snap.steps.length) return none('尚未采集');
  return (
    <Table min={560} heads={['接口', '结果', '耗时', '错误信息']}>
      {snap.steps.map((s) => (
        <tr key={s.key}><td className="td">{s.label}</td><td className="td">{s.ok ? <span className="tag-success">成功</span> : <span className="tag-danger">失败</span>}</td>
          <td className="td tabular-nums">{s.durationMs} ms</td><td className="td text-[13px] text-danger break-all">{s.error || ''}</td></tr>
      ))}
    </Table>
  );
}
