import React, { useMemo } from 'react';
import MonTable from './MonTable';
import DataState from './DataState';
import { PlatformCell, PctCell, num } from './cells';
import { Tag } from '../capacity/capUtil';
import { formatNumber } from '../../utils/format';

/** HostsTab —— 计算节点：分配率（Nova 超分配：已分配 / 容量）与使用率（监控实时），比率统一 1 位小数；样式与物理节点一致，无「集群」列 */
export default function HostsTab({ plat, allTotal, initialKeyword, q }) {
  const columns = useMemo(() => [
    { key: 'name', title: '计算节点', width: 150, sortable: true, render: (h) => <span className="font-medium">{h.name}</span> },
    { key: 'ip', title: '节点 IP', width: 130, sortable: true, render: (h) => <code className="text-[13px]">{h.ip || '—'}</code> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: (h) => h._p?.name, render: (h) => <PlatformCell platform={h._p} /> },
    { key: 'stateText', title: '运行状态', width: 96, sortable: true, render: (h) => <Tag text={h.stateText} tone={h.stateTone} /> },
    { key: 'runningVms', title: '运行虚拟机数', width: 110, sortable: true, align: 'right', render: (h) => <span className="tabular-nums">{num(h.runningVms, formatNumber)}</span> },
    { key: 'vcpusCap', title: 'vCPU（已分配 / 容量）', width: 150, sortable: true, align: 'right', render: (h) => <span className="tabular-nums text-[13px]">{num(h.vcpusUsed)} / {num(h.vcpusCap)}</span> },
    { key: 'cpuAlloc', title: 'CPU 分配率', width: 170, sortable: true, render: (h) => <PctCell value={h.cpuAlloc} label="CPU 分配率" /> },
    { key: 'memAlloc', title: '内存分配率', width: 170, sortable: true, render: (h) => <PctCell value={h.memAlloc} label="内存分配率" /> },
    { key: 'cpuUse', title: 'CPU 使用率', width: 170, sortable: true, render: (h) => <PctCell value={h.cpuUse} label="CPU 使用率" /> },
    { key: 'memUse', title: '内存使用率', width: 170, sortable: true, render: (h) => <PctCell value={h.memUse} label="内存使用率" /> },
  ], []);
  return (
    <DataState q={q}>
      {(d) => <MonTable columns={columns} rows={d.list} plat={plat} allTotal={allTotal} keyFn={(h) => `${h._pid}|${h.name}`} initialKeyword={initialKeyword} placeholder="搜索计算节点名称 / IP / 云平台"
        searchText={(h) => `${h.name} ${h.ip} ${h._p?.name || ''} ${h._p?.consoleIp || ''} ${h.stateText || ''}`} emptyTitle="暂无计算节点数据" initialSort={{ key: 'name', order: 'asc' }} />}
    </DataState>
  );
}
