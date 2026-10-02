import React, { useState } from 'react';
import Modal from '../Modal';
import CustomSelect from '../CustomSelect';
import { ConsoleIconLink } from '../ConsoleLink';
import TrendCard from './TrendCard';
import { RANGES, formatRate } from '../../utils/monitorUtil';

/** NodeDetailModal —— 物理节点监控详情：CPU 使用率 / 内存使用率 / 网络收发流量 / 磁盘 I/O 使用率（历史趋势来自后台周期采集落库的样本） */
export default function NodeDetailModal({ node, platform, providerId, refreshKey, onClose }) {
  const [range, setRange] = useState('6h');
  if (!node) return null;
  const common = { providerId, range, refreshKey, target: node.name };
  return (
    <Modal open title={`节点监控详情 · ${node.name}`} width={1020} onClose={onClose}
      subtitle={<span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">{node.hostIp && <span>节点 IP：{node.hostIp}</span>}{platform && <span className="inline-flex items-center gap-1.5">所属云平台：{platform.name}<ConsoleIconLink ip={platform.consoleIp} />{platform.consoleIp && <span className="font-mono">{platform.consoleIp}</span>}</span>}</span>}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs text-fg-muted">趋势来自后台按平台同步间隔采集并落库的历史样本，采样点不足 2 个时显示「历史数据积累中」</span>
        <div className="w-[140px] shrink-0"><CustomSelect aria-label="趋势范围" value={range} onChange={setRange} options={RANGES} /></div>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <TrendCard {...common} metric="node_cpu_percent" title="CPU 使用率" unit="%" domain={[0, 100]} seriesIndex={0} />
        <TrendCard {...common} metric="node_mem_percent" title="内存使用率" unit="%" domain={[0, 100]} seriesIndex={1} />
        <TrendCard {...common} metrics={[{ metric: 'node_net_rx', name: '接收' }, { metric: 'node_net_tx', name: '发送' }]} title="网络接收 / 发送流量" format={formatRate} seriesIndex={2} />
        <TrendCard {...common} metric="node_disk_io" title="磁盘 I/O 使用率" unit="%" domain={[0, 100]} seriesIndex={4} />
      </div>
    </Modal>
  );
}
