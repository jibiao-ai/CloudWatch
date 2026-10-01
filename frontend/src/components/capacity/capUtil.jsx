import React from 'react';
import CapacityBar from '../CapacityBar';
import { PlatformCell } from '../monitor/cells';
import { formatBytes, formatNumber, formatDateTime } from '../../utils/format';

/** 后端 *Tone → 标签样式（颜色全部走主题变量） */
const TAG = { success: 'tag-success', danger: 'tag-danger', warning: 'tag-warning', info: 'tag-info', default: 'tag-default' };
export const Tag = ({ text, tone }) => <span className={TAG[tone] || 'tag-default'}>{text || '—'}</span>;

/** 状态列：row[key+'Text'] / row[key+'Tone'] 由后端给出（中文 + 语义色） */
export const statusCol = (key = 'status', title = '状态', width = 100) => ({
  key, title, width, sortable: true, render: (r) => <Tag text={r[`${key}Text`]} tone={r[`${key}Tone`]} />,
});

const dash = <span className="text-fg-subtle">—</span>;
export const txt = (v, cls = '') => (v == null || v === '' ? dash : <span className={`text-[13px] ${cls}`}>{v}</span>);
export const mono = (v) => (v ? <code className="text-[12px] text-fg-muted break-all">{v}</code> : dash);
export const clip = (v, w = 180) => (v ? <span className="text-[13px] block truncate" style={{ maxWidth: w }} title={v}>{v}</span> : dash);
export const time = (v) => (v ? <span className="tabular-nums text-[13px]">{formatDateTime(v)}</span> : dash);
export const numCell = (v, f = formatNumber) => (v == null ? dash : <span className="tabular-nums text-[13px]">{f(v)}</span>);

/** 容量换算：接口中 GB 即 GiB（Cinder）；内存 MB 即 MiB（Nova） */
export const gb = (v) => formatBytes(Number(v) * 1024 ** 3, 2);
export const mb = (v) => formatBytes(Number(v) * 1024 ** 2, 2);
export const gbCell = (v) => (v == null ? dash : <span className="tabular-nums text-[13px]">{gb(v)}</span>);

/** 已用 / 总量 + 使用率条 */
export const Usage = ({ used, total, fmt }) => (total > 0
  ? <div className="w-[170px]"><div className="text-xs text-fg-muted tabular-nums mb-0.5">{fmt(used || 0)} / {fmt(total)}</div><CapacityBar compact used={used || 0} total={total} label="使用率" /></div>
  : dash);

/** 通用列：UUID 与 所属云平台（含控制台超链接） */
export const uuidCol = (title = 'UUID') => ({ key: 'id', title, width: 300, sortable: true, render: (r) => mono(r.id) });
export const platCol = () => ({
  key: 'providerName', title: '所属云平台', width: 170, sortable: true,
  render: (r) => <PlatformCell platform={{ name: r.providerName, consoleIp: r.consoleIp }} />,
});

export const KINDS = [
  { key: 'nodes', label: '计算节点', count: 'nodes' },
  { key: 'vms', label: '虚拟机', count: 'vms' },
  { key: 'volumes', label: '云硬盘', count: 'volumeCount' },
  { key: 'ports', label: '虚拟网卡', count: 'ports' },
  { key: 'pools', label: '集群存储', count: 'pools' },
];
