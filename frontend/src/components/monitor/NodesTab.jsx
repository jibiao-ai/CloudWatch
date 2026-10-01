import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import MonTable from './MonTable';
import NodeDetailModal from './NodeDetailModal';
import { PlatformCell, PctCell, num } from './cells';
import { formatBytes, formatNumber } from '../../utils/format';

/** NodesTab —— 物理节点：所属云平台（控制台超链接）/ 总核数 / 使用核数 / CPU / 内存 / 磁盘 I/O；末列「监控详情」弹窗 */
export default function NodesTab({ snap, platform, providerId, initialKeyword, refreshKey }) {
  const [sel, setSel] = useState(null);
  const columns = useMemo(() => [
    { key: 'name', title: '节点', width: 130, sortable: true, render: (n) => <span className="font-medium">{n.name}</span> },
    { key: 'hostIp', title: '节点 IP', width: 130, sortable: true, render: (n) => <code className="text-[13px]">{n.hostIp || '—'}</code> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: () => platform?.name, render: () => <PlatformCell platform={platform} /> },
    { key: 'coresTotal', title: '总核数', width: 90, sortable: true, align: 'right', render: (n) => <span className="tabular-nums">{num(n.coresTotal, formatNumber)}</span> },
    { key: 'coresUsed', title: '使用核数', width: 100, sortable: true, align: 'right', render: (n) => <span className="tabular-nums" title="Nova 宿主机已分配 vCPU（vcpus_used）">{num(n.coresUsed, formatNumber)}</span> },
    { key: 'cpuPercent', title: 'CPU 使用率', width: 170, sortable: true, render: (n) => <PctCell value={n.cpuPercent} /> },
    { key: 'memPercent', title: '内存使用率', width: 170, sortable: true, render: (n) => <PctCell value={n.memPercent} /> },
    { key: 'memTotal', title: '内存总量', width: 100, sortable: true, align: 'right', render: (n) => <span className="tabular-nums">{n.memTotal != null ? formatBytes(n.memTotal) : '—'}</span> },
    { key: 'memFree', title: '空闲内存', width: 100, sortable: true, align: 'right', render: (n) => <span className="tabular-nums">{n.memFree != null ? formatBytes(n.memFree) : '—'}</span> },
    { key: 'diskIo', title: '磁盘 I/O 使用率', width: 170, sortable: true, render: (n) => <PctCell value={n.diskIo} /> },
    { key: 'detail', title: '监控详情', width: 110, sticky: 'right', align: 'center', render: (n) => <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(n)}><Activity size={14} />详情</button> },
  ], [platform]);
  return (
    <>
      <MonTable columns={columns} rows={snap.nodes} keyFn={(n) => n.name} initialKeyword={initialKeyword} placeholder="搜索节点名称 / IP / 云平台"
        searchText={(n) => `${n.name} ${n.hostIp} ${platform?.name || ''} ${platform?.consoleIp || ''}`} emptyTitle="暂无物理节点数据" initialSort={{ key: 'name', order: 'asc' }} />
      <NodeDetailModal node={sel} platform={platform} providerId={providerId} refreshKey={refreshKey} onClose={() => setSel(null)} />
    </>
  );
}
