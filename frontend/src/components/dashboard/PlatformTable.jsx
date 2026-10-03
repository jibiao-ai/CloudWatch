import React from 'react';
import { Link } from 'react-router-dom';
import { ConsoleIconLink } from '../ConsoleLink';
import StatusDot from '../StatusDot';
import CapacityBar from '../CapacityBar';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import { ENV_TAG, ENV_TYPES } from '../../data/dict';
import { formatNumber, fromNow } from '../../utils/format';

const pct = (v) => (v == null ? null : Number(v));
const Use = ({ v }) => (v == null ? <span className="text-fg-subtle">-</span> : <span className={`tabular-nums ${v >= 85 ? 'text-danger' : v >= 70 ? 'text-warning' : 'text-fg'}`}>{pct(v).toFixed(1)}%</span>);

/** PlatformTable —— 各平台概况：连通状态 / 节点 / 虚拟机 / 容量分配 / 实际使用率 / 服务 / 告警 / 最近采集 */
export default function PlatformTable({ rows, loading, perms }) {
  const cap = perms?.capacity;
  const mon = perms?.monitor;
  const head = ['平台', '环境', '状态', ...(cap ? ['节点', '虚拟机', 'vCPU 分配', '内存分配', '存储'] : []), ...(mon ? ['CPU / 内存实际', '服务', '告警'] : []), '最近采集'];
  return (
    <section className="card overflow-hidden" aria-label="各平台概况">
      <div className="px-4 py-3 flex items-center justify-between border-b border-line">
        <h2 className="text-sm font-medium text-fg">各平台概况</h2>
        <Link to="/system/providers" className="text-[13px] text-primary-text hover:underline">平台管理 →</Link>
      </div>
      {loading ? <Skeleton.Table rows={4} cols={7} /> : !rows?.length ? <EmptyState title="暂无纳管平台" description="请先在「平台管理」中新增并验证平台" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-hover/60 transition-colors">
                  <td className="td">
                    <div className="flex items-center gap-1"><Link to={`/system/providers?keyword=${encodeURIComponent(p.name)}`} className="font-medium text-primary-text hover:underline">{p.name}</Link><ConsoleIconLink ip={p.consoleIp} /></div>
                    {p.consoleIp && <div className="text-xs font-mono text-fg-muted">{p.consoleIp}</div>}
                  </td>
                  <td className="td"><span className={ENV_TAG[p.envType]}>{ENV_TYPES.find((e) => e.value === p.envType)?.label || p.envType}</span></td>
                  <td className="td"><StatusDot status={p.status} label /></td>
                  {cap && <>
                    <td className="td tabular-nums">{formatNumber(p.nodes)}{p.nodesDown > 0 && <span className="tag-danger ml-1">{p.nodesDown} 异常</span>}</td>
                    <td className="td tabular-nums"><Link to={`/capacity?tab=vms&providerId=${p.id}`} className="hover:underline">{formatNumber(p.vmsActive)} / {formatNumber(p.vms)}</Link></td>
                    <td className="td w-[130px]"><CapacityBar compact used={p.vcpu.used} total={p.vcpu.cap} label="vCPU 分配率" hideLabel /></td>
                    <td className="td w-[130px]"><CapacityBar compact used={p.memory.used} total={p.memory.cap} label="内存分配率" hideLabel /></td>
                    <td className="td w-[130px]"><CapacityBar compact used={p.storage.used} total={p.storage.cap} label="存储使用率" hideLabel /></td>
                  </>}
                  {mon && <>
                    <td className="td text-[13px]"><Use v={p.cpuUse} /> <span className="text-fg-subtle">/</span> <Use v={p.memUse} /></td>
                    <td className="td tabular-nums">{p.servicesTotal ? (p.servicesBad > 0 ? <span className="tag-danger">{p.servicesBad} 异常</span> : <span className="tag-success">全部正常</span>) : <span className="text-fg-subtle">-</span>}</td>
                    <td className="td">{p.alertFiring > 0 ? <Link to={`/alerts?providerId=${p.id}`} className={p.alertFiring > 4 ? 'tag-danger' : 'tag-warning'}>{p.alertFiring}</Link> : <span className="text-fg-subtle">0</span>}</td>
                  </>}
                  <td className="td text-[13px]">{p.collectedAt ? <span className={p.collectOk ? 'text-fg-muted' : 'text-danger'} title={p.collectOk ? '' : '最近一次采集失败'}>{fromNow(p.collectedAt)}{p.collectOk ? '' : '（失败）'}</span> : <span className="text-fg-subtle">未采集</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
