import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, MonitorCog, Server, ShieldCheck, Siren, DatabaseZap } from 'lucide-react';
import StatCard from '../StatCard';
import CapacityBar from '../CapacityBar';
import { formatBytes, formatNumber } from '../../utils/format';

const Link2 = ({ to, children }) => {
  const nav = useNavigate();
  return <div role="link" tabIndex={0} className="cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2" onClick={() => nav(to)} onKeyDown={(e) => { if (e.key === 'Enter') nav(to); }}>{children}</div>;
};

/** KpiRow —— 关键指标：平台 / 节点 / 虚拟机 / 告警 / 服务 / 采集；无对应权限的指标不展示 */
export function KpiRow({ data }) {
  const t = data.totals || {};
  const perms = data.perms || {};
  const firing = data.alertStats?.firing ?? 0;
  const crit = data.alertStats?.severity?.critical ?? 0;
  const items = [
    <Link2 key="p" to="/system/providers"><StatCard icon={Cloud} label="纳管平台" value={`${t.online ?? 0} / ${t.platforms ?? 0}`} hint="在线 / 总数" tone={t.online < t.platforms ? 'warning' : 'primary'} /></Link2>,
  ];
  if (perms.capacity) {
    items.push(
      <Link2 key="n" to="/capacity?tab=nodes"><StatCard icon={Server} label="计算节点" value={formatNumber(t.nodes)} hint={t.nodesDown > 0 ? `${t.nodesDown} 个异常 · 物理节点 ${t.phys}` : `全部正常 · 物理节点 ${t.phys}`} tone={t.nodesDown > 0 ? 'danger' : 'info'} /></Link2>,
      <Link2 key="v" to="/capacity?tab=vms"><StatCard icon={MonitorCog} label="虚拟机" value={`${formatNumber(t.vmsActive)} / ${formatNumber(t.vms)}`} hint="运行中 / 总数" tone="success" /></Link2>,
    );
  }
  if (perms.alert) {
    items.push(<Link2 key="a" to="/alerts"><StatCard icon={Siren} label="活跃告警" value={formatNumber(firing)} hint={crit ? `其中严重 ${crit} 条` : '无严重告警'} tone={crit ? 'danger' : firing ? 'warning' : 'success'} /></Link2>);
  }
  if (perms.monitor) {
    items.push(
      <Link2 key="s" to="/monitor?tab=services"><StatCard icon={ShieldCheck} label="平台服务" value={`${(t.servicesTotal ?? 0) - (t.servicesBad ?? 0)} / ${t.servicesTotal ?? 0}`} hint={t.servicesBad ? `${t.servicesBad} 项异常` : '全部正常'} tone={t.servicesBad ? 'danger' : 'success'} /></Link2>,
    );
  }
  if (perms.capacity) {
    items.push(<Link2 key="c" to="/capacity"><StatCard icon={DatabaseZap} label="资产采集" value={t.collectBad ? `${t.collectBad} 个异常` : '正常'} hint="最近一次资产同步" tone={t.collectBad ? 'warning' : 'success'} /></Link2>);
  }
  return <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-6">{items}</div>;
}

/** CapacityRow —— 全平台 vCPU / 内存（分配口径）与存储（实际使用）水位 */
export function CapacityRow({ totals }) {
  const t = totals || {};
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-3" aria-label="容量水位">
      <div className="card p-4"><CapacityBar label="vCPU 分配（已分配 / 可分配含超分）" used={t.vcpuUsed} total={t.vcpuCap} format={(n) => `${formatNumber(Math.round(n))} 核`} /></div>
      <div className="card p-4"><CapacityBar label="内存 分配（已分配 / 可分配含超分）" used={(t.memUsed || 0) / 1024} total={(t.memCap || 0) / 1024} format={(n) => `${formatNumber(Math.round(n))} GiB`} /></div>
      <div className="card p-4"><CapacityBar label="存储（已用 / 总容量）" used={t.storageUsed} total={t.storageCap} format={(n) => formatBytes(n)} /></div>
    </div>
  );
}
