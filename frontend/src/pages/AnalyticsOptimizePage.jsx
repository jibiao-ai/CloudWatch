import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Settings, EyeOff, Eye } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingButton from '../components/LoadingButton';
import ErrorState from '../components/ErrorState';
import Skeleton from '../components/Skeleton';
import DataTable from '../components/DataTable';
import ConfirmModal from '../components/ConfirmModal';
import ExportButton from '../components/ExportButton';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import Tooltip from '../components/Tooltip';
import { Seg } from '../components/analytics/Panel';
import { IpCell } from '../components/analytics/columns';
import { pctText } from '../components/analytics/util';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useListQuery } from '../hooks/useListQuery';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime } from '../utils/format';

const VIEWS = [{ value: '0', label: '优化资源' }, { value: '1', label: '已忽略资源' }];
const FIELDS = [{ value: 'name', label: '名称' }, { value: 'ip', label: 'IP地址' }];
const pctCol = (key, title) => ({ key, title, width: 110, align: 'right', render: (r) => <span className="tabular-nums">{pctText(r[key])}</span> });
const toParams = (q) => ({ kind: q.kind, ignored: q.ignored, field: q.field, keyword: q.keyword });

/** AnalyticsOptimizePage —— 运营分析 · 云主机优化：按策略生成的升配 / 降配 / 回收建议，可忽略 / 取消忽略 */
export default function AnalyticsOptimizePage() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const canIgnore = useCan('analytics:ignore');
  const canPolicy = useCan('analytics:policy_update');
  const canExport = useCan('analytics:export');
  const sum = useAsync(() => analyticsApi.getOptSummary(), []);
  const cards = sum.data || [];
  const kind = ['downgrade', 'upgrade', 'recycle'].includes(sp.get('kind')) ? sp.get('kind') : 'downgrade';
  const list = useListQuery('analytics-opt', (q) => analyticsApi.getOptList({ ...toParams(q), page: q.page, pageSize: q.pageSize }).then((r) => ({ list: r.list, total: r.total })),
    { page: 1, pageSize: 10, kind, ignored: '0', field: 'name', keyword: '' });
  const { query, setQuery } = list;
  // URL 上的 kind 为准（总览页卡片跳转而来），列表查询随卡片选中同步
  useEffect(() => { if (query.kind !== kind) setQuery({ kind, ignored: '0' }); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ignoredView = query.ignored === '1';

  const pickKind = (k) => { setSelected([]); setSp({ kind: k }, { replace: true }); };
  const reloadAll = () => { sum.reload(); list.reload(); };
  const run = async () => {
    setBusy(true);
    try {
      await analyticsApi.setIgnore({ kind, ignore: !ignoredView, items: confirm.map((r) => ({ providerId: r.providerId, vmId: r.id })) });
      toast.success(ignoredView ? '已取消忽略' : '已忽略', `${confirm.length} 台云主机`);
      setConfirm(null); setSelected([]); reloadAll();
    } catch (e) { toast.error('操作失败', e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'name', title: '名称', width: 190, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'account', title: '云账号', width: 120 },
    { key: 'ips', title: 'IP地址', width: 170, render: (r) => <IpCell list={r.ipList} /> },
    { key: 'flavor', title: '实例规格', width: 140, render: (r) => r.flavor || '-' },
    { key: 'reason', title: '建议原因', width: 320, render: (r) => <Tooltip content={r.reason}><span className="block max-w-[310px] truncate text-[13px] text-fg-muted">{r.reason}</span></Tooltip> },
    pctCol('cpuAvg', 'CPU平均使用率'), pctCol('memAvg', '内存平均使用率'),
    ...(ignoredView ? [{ key: 'ignoredBy', title: '忽略人 / 时间', width: 190, render: (r) => <span className="text-[13px] text-fg-muted">{r.ignoredBy} · {formatDateTime(r.ignoredAt)}</span> }] : []),
    ...(canIgnore ? [{ key: 'op', title: '操作', width: 90, sticky: 'right', render: (r) => (
      <button type="button" className="text-primary-text hover:underline text-[13px]" onClick={() => setConfirm([r])}>{ignoredView ? '取消忽略' : '忽略'}</button>
    ) }] : []),
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="运营分析 · 云主机优化" description="按优化策略对云主机的 CPU / 内存使用率与运行状态分析后给出的优化建议；策略可在「优化策略」中调整"
        actions={<LoadingButton icon={RefreshCw} loading={sum.refreshing || list.refreshing} onClick={reloadAll}>刷新</LoadingButton>} />
      {sum.error ? <div className="card"><ErrorState error={sum.error} onRetry={sum.reload} /></div> : sum.loading ? <Skeleton.Cards count={3} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="建议类型">
          {cards.map((c) => (
            <div key={c.kind} role="radio" aria-checked={kind === c.kind} tabIndex={0} onClick={() => pickKind(c.kind)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pickKind(c.kind)}
              className={`card px-4 py-3 cursor-pointer transition ${kind === c.kind ? 'border-primary bg-primary-soft' : 'hover:bg-hover'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-fg">{c.name}{!c.enabled && <span className="ml-1.5 text-xs text-fg-subtle font-normal">（策略已停用）</span>}</span>
                {canPolicy && (
                  <Tooltip content="设置优化策略">
                    <button type="button" className="btn-ghost btn-icon" aria-label={`设置${c.name}策略`} onClick={(e) => { e.stopPropagation(); nav(`/analytics/policy?kind=${c.kind}`); }}><Settings size={15} /></button>
                  </Tooltip>
                )}
              </div>
              <div className="mt-1"><span className="text-2xl font-semibold text-fg tabular-nums">{c.count}</span><span className="text-xs text-fg-muted ml-1">台</span></div>
            </div>
          ))}
        </div>
      )}
      <DataTable columns={columns} rows={list.rows} rowKey="key" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })} pageSizeOptions={[10, 20, 50]}
        selectable={canIgnore} selected={selected} onSelectedChange={setSelected}
        selectionBar={<button type="button" className="btn-default btn-sm" onClick={() => setConfirm(list.rows.filter((r) => selected.includes(r.key)))}>
          {ignoredView ? <Eye size={14} /> : <EyeOff size={14} />} 批量{ignoredView ? '取消忽略' : '忽略'}（{selected.length}）</button>}
        toolbar={<>
          <Seg label="资源范围" items={VIEWS} value={query.ignored} onChange={(v) => { setSelected([]); setQuery({ ignored: v }); }} />
          <div className="w-[100px]"><CustomSelect size="sm" aria-label="搜索字段" options={FIELDS} value={query.field} onChange={(v) => setQuery({ field: v || 'name' })} /></div>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder={`请输入${query.field === 'ip' ? 'IP地址' : '名称'}搜索`} width={220} />
        </>}
        extra={canExport && <ExportButton fn={analyticsApi.exportList('opt')} params={toParams(query)} title="云主机优化建议" filters={{ 类型: cards.find((c) => c.kind === kind)?.name, 范围: ignoredView ? '已忽略' : '优化资源' }} />}
        empty={{ title: ignoredView ? '没有已忽略的资源' : '暂无优化建议', description: ignoredView ? '被忽略的云主机会出现在这里，可随时取消忽略' : '当前没有云主机命中该策略；使用率类策略需积累满统计周期的数据后才会产生建议' }} />
      <ConfirmModal open={!!confirm} title={ignoredView ? '取消忽略' : '忽略优化建议'} loading={busy}
        description={ignoredView ? '取消后，若这些云主机仍满足策略条件，将重新出现在「优化资源」中。' : '忽略后这些云主机不再计入该类优化建议，可在「已忽略资源」中恢复。'}
        targets={(confirm || []).map((r) => r.name)} confirmText={ignoredView ? '取消忽略' : '忽略'} onConfirm={run} onCancel={() => setConfirm(null)} />
    </div>
  );
}
