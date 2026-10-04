import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import MonTable from './MonTable';
import VMDetailModal from './VMDetailModal';
import CustomSelect from '../CustomSelect';
import { PlatformCell, PctCell, FlavorCell } from './cells';
import { monitorApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { formatBytes, formatDateTime } from '../../utils/format';
import { xr, xs } from '../../utils/xlsxExport';

const STATE = { ACTIVE: ['运行中', 'tag-success'], SHUTOFF: ['已关机', 'tag-default'], ERROR: ['异常', 'tag-danger'], PAUSED: ['已暂停', 'tag-warning'], SUSPENDED: ['已挂起', 'tag-warning'], SHELVED: ['已搁置', 'tag-info'], SHELVED_OFFLOADED: ['已搁置', 'tag-info'], BUILD: ['创建中', 'tag-info'], REBOOT: ['重启中', 'tag-info'], HARD_REBOOT: ['重启中', 'tag-info'], MIGRATING: ['迁移中', 'tag-info'], RESIZE: ['调整中', 'tag-info'], VERIFY_RESIZE: ['调整中', 'tag-info'], DELETED: ['已删除', 'tag-default'] };
const stateOf = (s) => STATE[s] || [s || '未知', 'tag-default'];

/** VMsTab —— 虚拟机：样式与物理节点一致；列表来自 Nova，规格名称取自 Nova 规格（悬浮可看 vCPU / 内存），使用率来自 Gnocchi；末列「监控详情」 */
export default function VMsTab({ rows, platforms, plat, allTotal, initialKeyword, refreshKey }) {
  const [sel, setSel] = useState(null);
    // 各平台的云主机使用率汇总（近 N 天最大值），按「平台ID/云主机ID」合并
  const usage = useAsync(() => Promise.all(platforms.map((p) => monitorApi.getVMUsage(p.id).then((r) => ({ pid: p.id, ...r })).catch(() => null))), [platforms.map((p) => p.id).join(), refreshKey]);
  const um = useMemo(() => { const m = {}; (usage.data || []).forEach((r) => r && Object.entries(r.usage || {}).forEach(([id, u]) => { m[`${r.pid}/${id}`] = u; })); return m; }, [usage.data]);
  const days = (usage.data || []).find((r) => r?.days)?.days || 30;
  const [st, setSt] = useState('');
  const states = useMemo(() => [{ value: '', label: '全部状态' }, ...[...new Set(rows.map((v) => v.status))].sort().map((s) => ({ value: s, label: stateOf(s)[0] }))], [rows]);
  const columns = useMemo(() => [
    { key: 'name', title: '云主机', width: 200, sortable: true, render: (v) => <div><div className="font-medium truncate max-w-[190px]" title={v.name}>{v.name || '—'}</div><div className="text-xs text-fg-subtle truncate max-w-[190px]" title={v.id}>{v.id}</div></div> },
    { key: 'status', title: '状态', width: 90, sortable: true, render: (v) => <span className={stateOf(v.status)[1]}>{stateOf(v.status)[0]}</span> },
    { key: 'ips', title: 'IP 地址', width: 150, sortable: true, render: (v) => <code className="text-[13px] break-all">{v.ips || '—'}</code> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: (v) => v._p?.name, render: (v) => <PlatformCell platform={v._p} /> },
    { key: 'node', title: '所在节点', width: 110, sortable: true, render: (v) => v.node || '—' },
    { key: 'flavor', title: '规格名称', width: 150, sortable: true, render: (v) => <FlavorCell name={v.flavor} vcpus={v.vcpus} ramMb={v.ramMb} /> },
    { key: 'cpuPercent', title: 'CPU 使用率', width: 170, sortable: true, render: (v) => <PctCell value={v.cpuPercent} /> },
    { key: 'memPercent', title: '内存使用率', width: 170, sortable: true, render: (v) => <PctCell value={v.memPercent} /> },
    { key: 'cpuMax', title: `CPU 最大使用率（${days}天）`, width: 190, sortable: true, sortBy: (v) => um[`${v._pid}/${v.id}`]?.cpuMax ?? -1, render: (v) => <PctCell value={um[`${v._pid}/${v.id}`]?.cpuMax} label="CPU 最大使用率" /> },
    { key: 'memMax', title: `内存最大使用率（${days}天）`, width: 190, sortable: true, sortBy: (v) => um[`${v._pid}/${v.id}`]?.memMax ?? -1, render: (v) => <PctCell value={um[`${v._pid}/${v.id}`]?.memMax} label="内存最大使用率" /> },
    { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (v) => <span className="tabular-nums text-[13px]">{v.createdAt ? formatDateTime(v.createdAt) : '—'}</span> },
    { key: 'detail', title: '监控详情', width: 110, sticky: 'right', align: 'center', render: (v) => <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(v)}><Activity size={14} />详情</button> },
  ], [um, days]);
  const exportSpec = useMemo(() => ({
    name: '虚拟机',
    cols: [
      { title: '云主机', get: (v) => xs(v.name) }, { title: '云主机 ID', get: (v) => xs(v.id) }, { title: '状态', get: (v) => stateOf(v.status)[0] }, { title: 'IP 地址', get: (v) => xs(v.ips) },
      { title: '所属云平台', get: (v) => v._p?.name || '' }, { title: '控制台 IP', get: (v) => v._p?.consoleIp || '' }, { title: '所在节点', get: (v) => xs(v.node) },
      { title: '规格名称', get: (v) => xs(v.flavor) }, { title: 'vCPU(核)', get: (v) => xs(v.vcpus) }, { title: '内存(MiB)', get: (v) => xs(v.ramMb) },
      { title: 'CPU 使用率(%)', get: (v) => xr(v.cpuPercent) }, { title: '内存使用率(%)', get: (v) => xr(v.memPercent) },
      { title: `CPU 最大使用率(%)（${days}天）`, get: (v) => xr(um[`${v._pid}/${v.id}`]?.cpuMax) }, { title: `内存最大使用率(%)（${days}天）`, get: (v) => xr(um[`${v._pid}/${v.id}`]?.memMax) },
      { title: '创建时间', get: (v) => (v.createdAt ? formatDateTime(v.createdAt) : '') },
    ],
  }), [um, days]);
  const filterFn = useMemo(() => (v) => !st || v.status === st, [st]);
  return (
    <>
      <MonTable columns={columns} rows={rows} plat={plat} allTotal={allTotal} keyFn={(v) => `${v._pid}|${v.id}`} initialKeyword={initialKeyword} placeholder="搜索云主机名称 / ID / IP / 节点 / 云平台" filterFn={filterFn} emptyTitle="暂无云主机数据" exportSpec={exportSpec}
        searchText={(v) => `${v.name} ${v.id} ${v.ips} ${v.node} ${v.flavor} ${v.vcpus || ''} ${v._p?.name || ''} ${v._p?.consoleIp || ''} ${stateOf(v.status)[0]}`} initialSort={{ key: 'name', order: 'asc' }}
        filters={() => <div className="w-[130px]"><CustomSelect aria-label="状态筛选" value={st} onChange={setSt} options={states} /></div>} />
      <VMDetailModal vm={sel} platform={sel?._p} providerId={sel?._pid} onClose={() => setSel(null)} />
    </>
  );
}
