import React from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingButton from '../components/LoadingButton';
import ErrorState from '../components/ErrorState';
import Skeleton from '../components/Skeleton';
import DataTable from '../components/DataTable';
import Panel from '../components/analytics/Panel';
import { AllocPanel, UsePanel, TrendPanel } from '../components/analytics/Blocks';
import { analyticsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useClientTable } from '../hooks/useClientTable';
import { useNavigate } from 'react-router-dom';

const OVERVIEW = [['accounts', '云账号'], ['vms', '云主机'], ['disks', '磁盘'], ['hosts', '宿主机'], ['pools', '存储器']];
const COLS = [
  { key: 'name', title: '云账号', sortable: true },
  { key: 'vms', title: '云主机', align: 'right', sortable: true },
  { key: 'disks', title: '磁盘', align: 'right', sortable: true },
  { key: 'hosts', title: '宿主机', align: 'right', sortable: true },
  { key: 'pools', title: '存储器', align: 'right', sortable: true },
];

/** AnalyticsHomePage —— 运营分析 · 总览：资源概览 / 明细、分配率与使用率、云主机趋势、优化建议汇总 */
export default function AnalyticsHomePage() {
  const nav = useNavigate();
  const ov = useAsync(() => analyticsApi.getOverview(), []);
  const d = ov.data;
  const tbl = useClientTable({ rows: d?.accounts || [], columns: COLS, searchText: (r) => r.name, initialSort: null, pageSize: 5 });
  return (
    <div className="space-y-4">
      <PageHeader title="运营分析 · 总览" description="汇总云账号下的云主机、磁盘、宿主机与存储器，查看资源分配率 / 使用率、云主机趋势与优化建议"
        actions={<LoadingButton icon={RefreshCw} loading={ov.refreshing} onClick={ov.reload}>刷新</LoadingButton>} />
      {ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div> : (
        <>
          <Panel title="资源概览">
            {ov.loading ? <Skeleton.Cards count={5} /> : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {OVERVIEW.map(([k, label]) => (
                  <div key={k} className="rounded-lg border border-line px-4 py-3">
                    <div className="text-xs text-fg-muted">{label}</div>
                    <div className="text-xl font-semibold text-fg tabular-nums mt-1">{d.totals[k] ?? 0}</div>
                  </div>
                ))}
              </div>
            )}
            <h3 className="text-sm font-semibold text-fg mt-5 mb-2">资源明细</h3>
            <DataTable columns={COLS} rows={tbl.pageRows} rowKey="providerId" loading={ov.loading} page={tbl.page} pageSize={tbl.pageSize} total={tbl.total}
              onPageChange={tbl.setPage} sort={tbl.sort} onSortChange={tbl.setSort} pageSizeOptions={[5, 10, 20]} empty={{ title: '暂无云账号', description: '请先在「平台管理」中对接云平台' }} />
          </Panel>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AllocPanel rates={d?.rates} loading={ov.loading} />
            <UsePanel rates={d?.rates} loading={ov.loading} />
          </div>
          <TrendPanel title="云主机趋势" kind="vm" suffix=" 台" />
          <Panel title="云主机优化建议">
            {ov.loading ? <Skeleton.Cards count={4} /> : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(d.suggestions || []).map((s) => (
                  <button key={s.kind} type="button" onClick={() => nav(`/analytics/optimize?kind=${s.kind}`)} className="text-left rounded-lg border border-line px-4 py-3 hover:bg-hover transition">
                    <div className="text-[13px] font-medium text-fg">{s.name}{!s.enabled && <span className="ml-1.5 text-xs text-fg-subtle font-normal">（策略已停用）</span>}</div>
                    <div className="mt-1"><span className="text-xl font-semibold text-fg tabular-nums">{s.count}</span><span className="text-xs text-fg-muted ml-1">台</span></div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
