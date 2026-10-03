import React, { useMemo } from 'react';
import MonTable from './MonTable';
import DataState from './DataState';
import { PlatformCell, PctCell } from './cells';
import { Tag, gbCell } from '../capacity/capUtil';

/** PoolsTab —— 集群存储：首列后端名称，其余字段与资产管理「集群存储」一致，另含分配率；比率统一 1 位小数 */
export default function PoolsTab({ plat, allTotal, initialKeyword, q }) {
  const columns = useMemo(() => [
    { key: 'backendName', title: '后端名称', width: 190, sortable: true, render: (r) => <span className="font-medium break-all" title={r.name}>{r.backendName || r.poolName || '—'}</span> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: (r) => r._p?.name, render: (r) => <PlatformCell platform={r._p} /> },
    { key: 'totalGb', title: '总容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.totalGb) },
    { key: 'freeGb', title: '剩余容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.freeGb) },
    { key: 'allocatedGb', title: '已分配容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.allocatedGb) },
    { key: 'provisionedGb', title: '精简置备总容量', width: 130, sortable: true, align: 'right', render: (r) => gbCell(r.provisionedGb) },
    { key: 'allocPercent', title: '存储分配率', width: 170, sortable: true, render: (r) => <PctCell value={r.allocPercent} label="存储分配率" /> },
    { key: 'usedPercent', title: '存储使用率', width: 170, sortable: true, render: (r) => <PctCell value={r.usedPercent} label="存储使用率" /> },
    { key: 'vendorText', title: '供应商', width: 170, sortable: true, render: (r) => <span className="text-[13px]" title={r.vendorName}>{r.vendorText || '—'}</span> },
    { key: 'statusText', title: '后端状态', width: 100, sortable: true, render: (r) => <Tag text={r.statusText} tone={r.statusTone} /> },
  ], []);
  return (
    <DataState q={q}>
      {(d) => <MonTable columns={columns} rows={d.list} plat={plat} allTotal={allTotal} keyFn={(r) => `${r._pid}|${r.name}`} initialKeyword={initialKeyword} placeholder="搜索后端名称 / 存储池 / 供应商 / 云平台"
        searchText={(r) => `${r.backendName} ${r.poolName} ${r.name} ${r.vendorText} ${r.protocolText} ${r._p?.name || ''} ${r._p?.consoleIp || ''}`} emptyTitle="暂无集群存储数据" initialSort={{ key: 'backendName', order: 'asc' }} />}
    </DataState>
  );
}
