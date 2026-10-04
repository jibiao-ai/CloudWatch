import React, { useMemo } from 'react';
import MonTable from './MonTable';
import { PlatformCell, PctCell } from './cells';
import { diskUsagePct, usedLifeText, usedLifeNum } from '../../utils/monitorUtil';
import { xr, xs } from '../../utils/xlsxExport';

const bad = (d) => d.healthy && !/^(ok|healthy|passed|normal|0)$/i.test(d.healthy);

const EXPORT = {
  name: '磁盘状态',
  cols: [
    { title: '节点', get: (d) => xs(d.node) }, { title: '节点 IP', get: (d) => xs(d.hostIp) }, { title: '所属云平台', get: (d) => d._p?.name || '' }, { title: '控制台 IP', get: (d) => d._p?.consoleIp || '' },
    { title: '设备', get: (d) => xs(d.device) }, { title: '类型', get: (d) => xs(d.type) }, { title: '型号', get: (d) => xs(d.model) }, { title: '序列号', get: (d) => xs(d.serial) }, { title: '容量', get: (d) => xs(d.capacity) },
    { title: '使用率(%)', get: (d) => xr(diskUsagePct(d)) }, { title: '健康', get: (d) => xs(d.healthy) }, { title: '已用寿命', get: (d) => (usedLifeText(d) === '—' ? '' : usedLifeText(d)) },
    { title: '用途', get: (d) => xs(d.purpose) }, { title: 'OSD编号', get: (d) => xs(d.osdId) }, { title: '通电时长(h)', get: (d) => xs(d.powerOnHours) },
  ],
};

/** DisksTab —— 磁盘状态：使用率条（同内存使用率）；HDD 已用寿命显示「—」；OSD 编号 */
export default function DisksTab({ rows, plat, allTotal, initialKeyword }) {
  const columns = useMemo(() => [
    { key: 'node', title: '节点', width: 130, sortable: true, render: (d) => <div><div className="font-medium">{d.node || '—'}</div><div className="text-xs text-fg-subtle">{d.hostIp}</div></div> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: (d) => d._p?.name, render: (d) => <PlatformCell platform={d._p} /> },
    { key: 'device', title: '设备', width: 100, sortable: true, render: (d) => <code className="text-[13px]">{d.device}</code> },
    { key: 'type', title: '类型', width: 80, sortable: true, render: (d) => <span className="tag-default">{d.type || '—'}</span> },
    { key: 'model', title: '型号', width: 150, sortable: true, render: (d) => d.model || '—' },
    { key: 'serial', title: '序列号', width: 150, sortable: true, render: (d) => <span className="text-fg-muted text-[13px]">{d.serial || '—'}</span> },
    { key: 'capacity', title: '容量', width: 100, sortable: true, align: 'right', sortBy: (d) => parseFloat(d.capacity), render: (d) => <span className="tabular-nums">{d.capacity || '—'}</span> },
    { key: 'usage', title: '使用率', width: 170, sortable: true, sortBy: diskUsagePct, render: (d) => <PctCell value={diskUsagePct(d)} /> },
    { key: 'healthy', title: '健康', width: 90, sortable: true, render: (d) => (bad(d) ? <span className="tag-danger">{d.healthy}</span> : <span className="tag-success">{d.healthy || '—'}</span>) },
    { key: 'usedLife', title: '已用寿命', width: 100, sortable: true, align: 'right', sortBy: usedLifeNum, render: (d) => <span className="tabular-nums">{usedLifeText(d)}</span> },
    { key: 'purpose', title: '用途', width: 100, sortable: true, render: (d) => d.purpose || '—' },
    { key: 'osdId', title: 'OSD编号', width: 100, sortable: true, render: (d) => d.osdId || '—' },
    { key: 'powerOnHours', title: '通电时长(h)', width: 120, sortable: true, align: 'right', sortBy: (d) => parseFloat(d.powerOnHours), render: (d) => <span className="tabular-nums">{d.powerOnHours || '—'}</span> },
  ], []);
  return (
    <MonTable columns={columns} rows={rows} plat={plat} allTotal={allTotal} keyFn={(d, i) => `${d._pid}|${d.node}|${d.device}|${i}`} initialKeyword={initialKeyword} placeholder="搜索节点 / 设备 / 型号 / 序列号 / OSD编号 / 云平台"
      searchText={(d) => `${d._p?.name || ''} ${d.node} ${d.hostIp} ${d.device} ${d.model} ${d.serial} ${d.type} ${d.purpose} ${d.osdId}`} emptyTitle="暂无磁盘数据" exportSpec={EXPORT} initialSort={{ key: 'node', order: 'asc' }} />
  );
}
