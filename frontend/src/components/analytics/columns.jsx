import React, { useState } from 'react';
import { pctText } from './util';

const stateTag = (text, status) => {
  const s = String(status || '').toLowerCase();
  const cls = ['active', 'up', 'enabled', 'in-use', 'available', 'running'].includes(s) ? 'tag-success' : ['error', 'down', 'disabled', 'critical'].includes(s) ? 'tag-danger' : ['shutoff', 'stopped'].includes(s) ? 'tag-default' : 'tag-warning';
  return <span className={cls}>{text || '-'}</span>;
};
const num = (v) => (v == null ? '-' : v);
const pct = (key, title, extra = {}) => ({ key, title, width: 110, align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{pctText(r[key])}</span>, ...extra });

/** IpCell —— IP 地址：多个时显示第 1 个 + 「更多」展开 */
export function IpCell({ list = [] }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return <span className="text-fg-subtle">-</span>;
  if (list.length === 1) return <span className="tabular-nums">{list[0]}</span>;
  return (
    <div className="text-[13px]">
      <span className="tabular-nums">{list[0]}</span>
      {open && list.slice(1).map((ip) => <div key={ip} className="tabular-nums">{ip}</div>)}
      <button type="button" className="ml-1.5 text-primary-text hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? '收起' : `更多(${list.length - 1})`}</button>
    </div>
  );
}

export const HOST_COLS = [
  { key: 'name', title: '宿主机', width: 190, sortable: true },
  { key: 'account', title: '云账号', width: 130, sortable: true },
  { key: 'cluster', title: '集群', width: 110, sortable: true },
  { key: 'ip', title: 'IP地址', width: 130, render: (r) => <span className="tabular-nums">{r.ip || '-'}</span> },
  { key: 'stateText', title: '状态', width: 90, render: (r) => stateTag(r.stateText, r.state) },
  { key: 'runningVms', title: '运行中云主机', width: 120, align: 'right', sortable: true },
  { key: 'vcpus', title: 'vCPU(已分配/总量)', width: 150, align: 'right', render: (r) => <span className="tabular-nums">{r.vcpus}</span> },
  pct('cpuAlloc', 'CPU分配率'), pct('memAlloc', '内存分配率'), pct('cpuUse', 'CPU使用率'), pct('memUse', '内存使用率'),
];

export const POOL_COLS = [
  { key: 'name', title: '存储器', width: 190, sortable: true },
  { key: 'account', title: '云账号', width: 130, sortable: true },
  { key: 'backend', title: '后端名称', width: 150, render: (r) => r.backend || '-' },
  { key: 'statusText', title: '状态', width: 90, render: (r) => stateTag(r.statusText, r.status) },
  { key: 'totalGb', title: '总容量(G)', width: 110, align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{num(r.totalGb)}</span> },
  { key: 'usedGb', title: '已用(G)', width: 110, align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{num(r.usedGb)}</span> },
  pct('usedPercent', '使用率'), pct('allocPercent', '分配率'),
];

export const VM_COLS = [
  { key: 'name', title: '名称', width: 200, sortable: true },
  { key: 'account', title: '云账号', width: 130, sortable: true },
  { key: 'flavor', title: '实例规格', width: 150, render: (r) => r.flavor || '-' },
  { key: 'ips', title: 'IP地址', width: 170, render: (r) => <IpCell list={r.ipList} /> },
  { key: 'statusText', title: '状态', width: 90, render: (r) => stateTag(r.statusText, r.status) },
  { key: 'host', title: '宿主机', width: 150, render: (r) => r.host || '-' },
  pct('cpuAvg', 'CPU平均使用率', { width: 130 }), pct('cpuMax', 'CPU最大使用率', { width: 130 }),
  pct('memAvg', '内存平均使用率', { width: 140 }), pct('memMax', '内存最大使用率', { width: 140 }),
];

export const DISK_COLS = [
  { key: 'name', title: '名称', width: 200, sortable: true },
  { key: 'account', title: '云账号', width: 130, sortable: true },
  { key: 'az', title: '集群/可用区', width: 120, render: (r) => r.az || '-' },
  { key: 'server', title: '所属云主机', width: 180, render: (r) => r.server || '-' },
  { key: 'statusText', title: '状态', width: 90, render: (r) => stateTag(r.statusText, r.status) },
  { key: 'sizeGb', title: '大小(G)', width: 100, align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{num(r.sizeGb)}</span> },
];
