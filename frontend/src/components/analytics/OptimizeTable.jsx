import React, { useEffect, useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import DataTable from '../DataTable';
import ConfirmModal from '../ConfirmModal';
import ExportButton from '../ExportButton';
import SearchInput from '../SearchInput';
import CustomSelect from '../CustomSelect';
import Tooltip from '../Tooltip';
import { Seg, Filter } from './Panel';
import { IpCell, platCol } from './columns';
import { pctText } from './util';
import { analyticsApi } from '../../services/api';
import { useListQuery } from '../../hooks/useListQuery';
import { useCan } from '../../hooks/useCan';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/format';

const VIEWS = [{ value: '0', label: '优化资源' }, { value: '1', label: '已忽略资源' }];
const FIELDS = [{ value: 'name', label: '名称' }, { value: 'ip', label: 'IP地址' }];
const pctCol = (key, title) => ({ key, title, width: 120, align: 'right', render: (r) => <span className="tabular-nums">{pctText(r[key])}</span> });
const rateCol = (key, title) => ({ key, title, width: 150, align: 'right', render: (r) => <span className="tabular-nums">{r[key] == null ? '-' : `${r[key]} KiB/s`}</span> });
const toParams = (q) => ({ kind: q.kind, ignored: q.ignored, field: q.field, keyword: q.keyword, providerId: q.providerId });

/** OptimizeTable —— 某一类优化建议（僵尸型 / 资源过剩 / 资源不足 / 长期关机）的列表（优化资源 / 已忽略资源）：搜索、所属云平台筛选、忽略 / 取消忽略、导出 */
export default function OptimizeTable({ kind, kindName, platforms, refreshKey, onChanged }) {
  const toast = useToast();
  const canIgnore = useCan('analytics:ignore');
  const canExport = useCan('analytics:export');
  const list = useListQuery('analytics-opt', (q) => analyticsApi.getOptList({ ...toParams(q), page: q.page, pageSize: q.pageSize }).then((r) => ({ list: r.list, total: r.total })),
    { page: 1, pageSize: 10, kind, ignored: '0', field: 'name', keyword: '', providerId: '' });
  const { query, setQuery } = list;
  useEffect(() => { if (query.kind !== kind) setQuery({ kind, ignored: '0' }); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = React.useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } list.reload(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ignoredView = query.ignored === '1';

  const run = async () => {
    setBusy(true);
    try {
      await analyticsApi.setIgnore({ kind, ignore: !ignoredView, items: confirm.map((r) => ({ providerId: r.providerId, vmId: r.id })) });
      toast.success(ignoredView ? '已取消忽略' : '已忽略', `${confirm.length} 台云主机`);
      setConfirm(null); setSelected([]); list.reload(); onChanged?.();
    } catch (e) { toast.error('操作失败', e.message); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'name', title: '名称', width: 190, render: (r) => <span className="font-medium">{r.name}</span> },
    platCol(),
    { key: 'ips', title: 'IP地址', width: 170, render: (r) => <IpCell list={r.ipList} /> },
    { key: 'flavor', title: '实例规格', width: 140, render: (r) => r.flavor || '-' },
    { key: 'reason', title: '建议原因', width: 320, render: (r) => <Tooltip content={r.reason}><span className="block max-w-[310px] truncate text-[13px] text-fg-muted">{r.reason}</span></Tooltip> },
    ...(kind === 'zombie' ? [rateCol('writeAvg', '写I/O平均速率')] : []),
    ...(kind === 'excess' || kind === 'shortage' ? [pctCol('cpuAvg', 'CPU平均使用率'), pctCol('memAvg', '内存平均使用率')] : []),
    ...(kind === 'longoff' ? [{ key: 'statusText', title: '实例状态', width: 110, render: (r) => r.statusText || '-' }, { key: 'shutdownDays', title: '持续关机', width: 110, align: 'right', render: (r) => <span className="tabular-nums">{r.shutdownDays == null ? '-' : `${r.shutdownDays} 天`}</span> }] : []),
    ...(ignoredView ? [{ key: 'ignoredBy', title: '忽略人 / 时间', width: 190, render: (r) => <span className="text-[13px] text-fg-muted">{r.ignoredBy} · {formatDateTime(r.ignoredAt)}</span> }] : []),
    ...(canIgnore ? [{ key: 'op', title: '操作', width: 90, sticky: 'right', render: (r) => (
      <button type="button" className="text-primary-text hover:underline text-[13px]" onClick={() => setConfirm([r])}>{ignoredView ? '取消忽略' : '忽略'}</button>
    ) }] : []),
  ];
  const filtered = !!(query.keyword || query.providerId);
  return (
    <>
      <DataTable columns={columns} rows={list.rows} rowKey="key" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })} pageSizeOptions={[10, 20, 50]}
        selectable={canIgnore} selected={selected} onSelectedChange={setSelected}
        selectionBar={<button type="button" className="btn-default btn-sm" onClick={() => setConfirm(list.rows.filter((r) => selected.includes(r.key)))}>
          {ignoredView ? <Eye size={14} /> : <EyeOff size={14} />} 批量{ignoredView ? '取消忽略' : '忽略'}（{selected.length}）</button>}
        toolbar={<>
          <Seg label="资源范围" items={VIEWS} value={query.ignored} onChange={(v) => { setSelected([]); setQuery({ ignored: v }); }} />
          <div className="w-[100px]"><CustomSelect size="sm" aria-label="搜索字段" options={FIELDS} value={query.field} onChange={(v) => setQuery({ field: v || 'name' })} /></div>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder={`请输入${query.field === 'ip' ? 'IP地址' : '名称'}搜索`} width={240} />
          <Filter bare label="所属云平台" width={200} options={platforms.map((p) => ({ value: p.providerId, label: p.name }))} value={query.providerId} onChange={(v) => { setSelected([]); setQuery({ providerId: v }); }} />
        </>}
        extra={<>
          <span className="text-[13px] text-fg-muted">共 {list.total} 项</span>
          {canExport && <ExportButton fn={analyticsApi.exportList('opt')} params={toParams(query)} title="云主机优化建议" filters={{ 类型: kindName, 范围: ignoredView ? '已忽略' : '优化资源' }} />}
        </>}
        empty={filtered ? { title: '没有匹配的结果', description: '请调整搜索关键字或筛选条件' } : { title: ignoredView ? '没有已忽略的资源' : '暂无优化建议', description: ignoredView ? '被忽略的云主机会出现在这里，可随时取消忽略' : '当前没有云主机命中该策略；使用率与写 I/O 类策略需积累满统计周期的数据后才会产生建议' }} />
      <ConfirmModal open={!!confirm} title={ignoredView ? '取消忽略' : '忽略优化建议'} loading={busy}
        description={ignoredView ? '取消后，若这些云主机仍满足策略条件，将重新出现在「优化资源」中。' : '忽略后这些云主机不再计入该类优化建议，可在「已忽略资源」中恢复。'}
        targets={(confirm || []).map((r) => r.name)} confirmText={ignoredView ? '取消忽略' : '忽略'} onConfirm={run} onCancel={() => setConfirm(null)} />
    </>
  );
}
