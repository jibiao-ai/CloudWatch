import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import MonTable from './MonTable';
import NodeDetailModal from './NodeDetailModal';
import { PlatformCell, PctCell, num } from './cells';
import { formatBytes, formatNumber } from '../../utils/format';
import { xr, xGiB, xs } from '../../utils/xlsxExport';

const EXPORT = {
  name: '物理节点',
  cols: [
    { title: '节点', get: (n) => n.name }, { title: '节点 IP', get: (n) => xs(n.hostIp) }, { title: '所属云平台', get: (n) => n._p?.name || '' }, { title: '控制台 IP', get: (n) => n._p?.consoleIp || '' },
    { title: '总核数', get: (n) => xs(n.coresTotal) }, { title: '使用核数', get: (n) => (n.coresUsed == null ? '' : Math.round(n.coresUsed)) },
    { title: 'CPU 使用率(%)', get: (n) => xr(n.cpuPercent) }, { title: '内存使用率(%)', get: (n) => xr(n.memPercent) },
    { title: '内存总量(GiB)', get: (n) => xGiB(n.memTotal) }, { title: '空闲内存(GiB)', get: (n) => xGiB(n.memFree) }, { title: '磁盘 I/O 使用率(%)', get: (n) => xr(n.diskIo) },
  ],
};

/** NodesTab —— 物理节点：所属云平台（控制台超链接）/ 总核数 / 使用核数 / CPU / 内存 / 磁盘 I/O；末列「监控详情」弹窗 */
export default function NodesTab({ rows, plat, allTotal, initialKeyword, refreshKey }) {
  const [sel, setSel] = useState(null);
  const columns = useMemo(() => [
    { key: 'name', title: '节点', width: 130, sortable: true, render: (n) => <span className="font-medium">{n.name}</span> },
    { key: 'hostIp', title: '节点 IP', width: 130, sortable: true, render: (n) => <code className="text-[13px]">{n.hostIp || '—'}</code> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: (n) => n._p?.name, render: (n) => <PlatformCell platform={n._p} /> },
    { key: 'coresTotal', title: '总核数', width: 90, sortable: true, align: 'right', render: (n) => <span className="tabular-nums" title="计算节点取自 Nova，其余节点按主机名 / IP 匹配配置中心物理机">{num(n.coresTotal, formatNumber)}</span> },
    { key: 'coresUsed', title: '使用核数', width: 100, sortable: true, align: 'right', render: (n) => <span className="tabular-nums" title="计算节点取 Nova 已分配 vCPU；其余节点按 CPU 使用率 × 总核数取整">{num(n.coresUsed == null ? null : Math.round(n.coresUsed), formatNumber)}</span> },
    { key: 'cpuPercent', title: 'CPU 使用率', width: 170, sortable: true, render: (n) => <PctCell value={n.cpuPercent} /> },
    { key: 'memPercent', title: '内存使用率', width: 170, sortable: true, render: (n) => <PctCell value={n.memPercent} /> },
    { key: 'memTotal', title: '内存总量', width: 100, sortable: true, align: 'right', render: (n) => <span className="tabular-nums">{n.memTotal != null ? formatBytes(n.memTotal) : '—'}</span> },
    { key: 'memFree', title: '空闲内存', width: 100, sortable: true, align: 'right', render: (n) => <span className="tabular-nums">{n.memFree != null ? formatBytes(n.memFree) : '—'}</span> },
    { key: 'diskIo', title: '磁盘 I/O 使用率', width: 170, sortable: true, render: (n) => <PctCell value={n.diskIo} /> },
    { key: 'detail', title: '监控详情', width: 110, sticky: 'right', align: 'center', render: (n) => <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(n)}><Activity size={14} />详情</button> },
  ], []);
  return (
    <>
      <MonTable columns={columns} rows={rows} plat={plat} allTotal={allTotal} keyFn={(n) => `${n._pid}|${n.name}`} initialKeyword={initialKeyword} placeholder="搜索节点名称 / IP / 云平台"
        searchText={(n) => `${n.name} ${n.hostIp} ${n._p?.name || ''} ${n._p?.consoleIp || ''}`} emptyTitle="暂无物理节点数据" exportSpec={EXPORT} initialSort={{ key: 'name', order: 'asc' }} />
      <NodeDetailModal node={sel} platform={sel?._p} providerId={sel?._pid} refreshKey={refreshKey} onClose={() => setSel(null)} />
    </>
  );
}
