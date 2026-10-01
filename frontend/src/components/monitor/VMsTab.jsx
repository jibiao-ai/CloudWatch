import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import MonTable from './MonTable';
import VMDetailModal from './VMDetailModal';
import CustomSelect from '../CustomSelect';
import { PlatformCell, PctCell } from './cells';
import { formatBytes, formatDateTime } from '../../utils/format';

const STATE = { ACTIVE: ['运行中', 'tag-success'], SHUTOFF: ['已关机', 'tag-default'], ERROR: ['异常', 'tag-danger'], PAUSED: ['已暂停', 'tag-warning'], SUSPENDED: ['已挂起', 'tag-warning'], SHELVED: ['已搁置', 'tag-info'], SHELVED_OFFLOADED: ['已搁置', 'tag-info'], BUILD: ['创建中', 'tag-info'], REBOOT: ['重启中', 'tag-info'], HARD_REBOOT: ['重启中', 'tag-info'], MIGRATING: ['迁移中', 'tag-info'], RESIZE: ['调整中', 'tag-info'], VERIFY_RESIZE: ['调整中', 'tag-info'], DELETED: ['已删除', 'tag-default'] };
const stateOf = (s) => STATE[s] || [s || '未知', 'tag-default'];

/** VMsTab —— 虚拟机：样式与物理节点一致；列表来自 Nova，CPU / 内存来自 Gnocchi；末列「监控详情」 */
export default function VMsTab({ snap, platform, providerId, initialKeyword }) {
  const [sel, setSel] = useState(null);
  const [st, setSt] = useState('');
  const states = useMemo(() => [{ value: '', label: '全部状态' }, ...[...new Set(snap.vms.map((v) => v.status))].sort().map((s) => ({ value: s, label: stateOf(s)[0] }))], [snap.vms]);
  const columns = useMemo(() => [
    { key: 'name', title: '云主机', width: 200, sortable: true, render: (v) => <div><div className="font-medium truncate max-w-[190px]" title={v.name}>{v.name || '—'}</div><div className="text-xs text-fg-subtle truncate max-w-[190px]" title={v.id}>{v.id}</div></div> },
    { key: 'status', title: '状态', width: 90, sortable: true, render: (v) => <span className={stateOf(v.status)[1]}>{stateOf(v.status)[0]}</span> },
    { key: 'ips', title: 'IP 地址', width: 150, sortable: true, render: (v) => <code className="text-[13px] break-all">{v.ips || '—'}</code> },
    { key: 'platform', title: '所属云平台', width: 170, sortable: true, sortBy: () => platform?.name, render: () => <PlatformCell platform={platform} /> },
    { key: 'node', title: '所在节点', width: 110, sortable: true, render: (v) => v.node || '—' },
    { key: 'vcpus', title: 'vCPU', width: 80, sortable: true, align: 'right', render: (v) => <span className="tabular-nums">{v.vcpus || '—'}</span> },
    { key: 'ramMb', title: '内存', width: 90, sortable: true, align: 'right', render: (v) => <span className="tabular-nums">{v.ramMb ? formatBytes(v.ramMb * 1048576) : '—'}</span> },
    { key: 'cpuPercent', title: 'CPU 使用率', width: 170, sortable: true, render: (v) => <PctCell value={v.cpuPercent} /> },
    { key: 'memPercent', title: '内存使用率', width: 170, sortable: true, render: (v) => <PctCell value={v.memPercent} /> },
    { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (v) => <span className="tabular-nums text-[13px]">{v.createdAt ? formatDateTime(v.createdAt) : '—'}</span> },
    { key: 'detail', title: '监控详情', width: 110, sticky: 'right', align: 'center', render: (v) => <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(v)}><Activity size={14} />详情</button> },
  ], [platform]);
  const filterFn = useMemo(() => (v) => !st || v.status === st, [st]);
  return (
    <>
      <MonTable columns={columns} rows={snap.vms} keyFn={(v) => v.id} initialKeyword={initialKeyword} placeholder="搜索云主机名称 / ID / IP / 节点 / 云平台" filterFn={filterFn} emptyTitle="暂无云主机数据"
        searchText={(v) => `${v.name} ${v.id} ${v.ips} ${v.node} ${v.flavor} ${platform?.name || ''} ${platform?.consoleIp || ''} ${stateOf(v.status)[0]}`} initialSort={{ key: 'name', order: 'asc' }}
        filters={() => <div className="w-[130px]"><CustomSelect aria-label="状态筛选" value={st} onChange={setSt} options={states} /></div>} />
      <VMDetailModal vm={sel} platform={platform} providerId={providerId} onClose={() => setSel(null)} />
    </>
  );
}
