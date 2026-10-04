import React, { useState } from 'react';
import { RefreshCw, PlayCircle, Settings2, Download, Trash2, ClipboardCheck, AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import DatePicker from '../components/DatePicker';
import StatCard from '../components/StatCard';
import ConfirmModal from '../components/ConfirmModal';
import LoadingButton from '../components/LoadingButton';
import StatusTag from '../components/inspection/StatusTag';
import RunModal from '../components/inspection/RunModal';
import ReportDrawer from '../components/inspection/ReportDrawer';
import SettingsModal from '../components/inspection/SettingsModal';
import { OVERALL_OPTIONS, TRIGGER, TRIGGER_OPTIONS } from '../components/inspection/common';
import { inspectionApi } from '../services/api';
import { useListQuery } from '../hooks/useListQuery';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime } from '../utils/format';
import { downloadBlob } from '../utils/download';

const toParams = (q) => ({ keyword: q.keyword, overall: q.overall, trigger: q.trigger, from: q.from, to: q.to, sortKey: q.sort?.key, sortOrder: q.sort?.order });
const docName = (r) => {
  const d = new Date(r.finishedAt);
  const p = (n) => String(n).padStart(2, '0');
  return `云平台自动巡检报告_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.docx`;
};

/** 定时巡检频率文案：每天 / 每周/ 每月 N 日 */
const scheduleText = (s) => `${s.mode === 'monthly' ? `每月 ${s.day || 1} 日` : s.mode === 'weekly' ? '每周' : '每天'} ${s.time}`;

/** InspectionPage —— 自动巡检：历史报告列表 + 立即巡检 + 报告详情 + 导出 Word + 巡检设置 */
export default function InspectionPage() {
  const toast = useToast();
  const canRun = useCan('inspection:run');
  const canExport = useCan('inspection:export');
  const canConfig = useCan('inspection:config');
  const canDelete = useCan('inspection:delete');
  const list = useListQuery('inspection', (q) => inspectionApi.list({ ...toParams(q), page: q.page, pageSize: q.pageSize }), { page: 1, pageSize: 10, keyword: '', overall: '', trigger: '', from: '', to: '', sort: { key: 'finishedAt', order: 'desc' } });
  const { query, setQuery } = list;
  const cfg = useAsync(() => inspectionApi.getConfig(), []);
  const [runOpen, setRunOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const open = async (row) => {
    try { setDetail(await inspectionApi.get(row.id)); } catch (e) { toast.error('读取报告失败', e.message); }
  };
  const exportDoc = async (r) => {
    setExporting(true);
    try { const b = await inspectionApi.exportDocx(r.id); const n = docName(r); downloadBlob(b, n); toast.success('导出成功', n); }
    catch (e) { toast.error('导出失败', e.message); } finally { setExporting(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await inspectionApi.remove(del.id); toast.success('已删除', del.title); if (detail?.id === del.id) setDetail(null); setDel(null); list.reload(); }
    catch (e) { toast.error('删除失败', e.message); } finally { setBusy(false); }
  };

  const latest = list.rows[0];
  const columns = [
    { key: 'overall', title: '综合评估', width: 100, sortable: true, render: (r) => <StatusTag value={r.overall} /> },
    { key: 'title', title: '报告', width: 280, sortable: true, render: (r) => <div><div className="font-medium truncate max-w-[270px]" title={r.title}>{r.title}</div><div className="text-xs text-fg-subtle truncate max-w-[270px]" title={r.scope}>{r.scope}</div></div> },
    { key: 'score', title: '健康评分', width: 100, sortable: true, render: (r) => <span className="tabular-nums font-medium">{r.score}</span> },
    { key: 'counts', title: '正常 / 预警 / 异常 / 未采集', width: 210, render: (r) => <span className="tabular-nums text-[13px]"><span className="text-success">{r.counts.ok}</span> / <span className="text-warning">{r.counts.warn}</span> / <span className="text-danger">{r.counts.bad}</span> / <span className="text-fg-muted">{r.counts.na}</span></span> },
    { key: 'trigger', title: '发起方式', width: 100, sortable: true, render: (r) => <span className="tag-default">{TRIGGER[r.trigger] || r.trigger}</span> },
    { key: 'operatorName', title: '发起人', width: 110, render: (r) => <span className="text-[13px]">{r.operatorName || r.operator || '-'}</span> },
    { key: 'finishedAt', title: '完成时间', width: 160, sortable: true, render: (r) => <span className="tabular-nums text-[13px]">{formatDateTime(r.finishedAt)}</span> },
    { key: 'ops', title: '操作', width: 150, render: (r) => (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {canExport && <button type="button" className="btn-ghost btn-sm" disabled={exporting} aria-label={`导出 ${r.title}`} onClick={() => exportDoc(r)}><Download size={14} /> Word</button>}
        {canDelete && <button type="button" className="btn-ghost btn-sm text-danger" aria-label={`删除 ${r.title}`} onClick={() => setDel(r)}><Trash2 size={14} /></button>}
      </div>
    ) },
  ];

  return (
    <div className="bg-bg">
      <PageHeader title="自动巡检" description="对已对接的云平台只读巡检：服务状态、磁盘、集群容量、存储 IO、磁盘延迟、告警、云主机健康等，生成可追溯的报告并支持导出 Word" actions={<>
        <button type="button" className="btn-default" onClick={list.reload}><RefreshCw size={15} className={list.refreshing ? 'animate-spin' : ''} /> 刷新</button>
        {canConfig && <button type="button" className="btn-default" onClick={() => setSetOpen(true)}><Settings2 size={15} /> 巡检设置</button>}
        {canRun && <button type="button" className="btn-primary" onClick={() => setRunOpen(true)}><PlayCircle size={15} /> 立即巡检</button>}
      </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={ClipboardCheck} tone="primary" label="历史报告" value={list.total} hint={cfg.data?.config.schedule.enabled ? `定时巡检：${scheduleText(cfg.data.config.schedule)}` : '定时巡检未启用'} />
        <StatCard icon={latest?.overall === 'bad' ? AlertOctagon : latest?.overall === 'warn' ? AlertTriangle : CheckCircle2} tone={{ bad: 'danger', warn: 'warning', ok: 'success' }[latest?.overall] || 'info'} label="最近一次评估" value={latest ? ({ ok: '正常', warn: '预警', bad: '异常', na: '未采集' }[latest.overall]) : '-'} hint={latest && formatDateTime(latest.finishedAt)} />
        <StatCard icon={AlertOctagon} tone="danger" label="最近一次异常项" value={latest ? latest.counts.bad : '-'} />
        <StatCard icon={AlertTriangle} tone="warning" label="最近一次预警项" value={latest ? latest.counts.warn : '-'} />
      </div>
      <DataTable columns={columns} rows={list.rows} rowKey="id" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })} pageSizeOptions={[10, 20, 50]}
        sort={query.sort} onSortChange={(sort) => setQuery({ sort: sort || { key: 'finishedAt', order: 'desc' } })} onRowClick={open}
        toolbar={<>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder="关键字（报告 / 平台 / 发起人）" width={240} />
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="综合评估" aria-label="综合评估" value={query.overall} onChange={(overall) => setQuery({ overall })} options={OVERALL_OPTIONS} /></div>
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="发起方式" aria-label="发起方式" value={query.trigger} onChange={(trigger) => setQuery({ trigger })} options={TRIGGER_OPTIONS} /></div>
          <DatePicker width={150} clearable placeholder="开始日期" aria-label="开始日期" value={query.from} max={query.to || undefined} onChange={(from) => setQuery({ from })} />
          <DatePicker width={150} clearable placeholder="结束日期" aria-label="结束日期" value={query.to} min={query.from || undefined} onChange={(to) => setQuery({ to })} />
        </>}
        empty={{ title: '暂无巡检报告', description: canRun ? '点击右上角「立即巡检」生成第一份报告' : '还没有巡检报告' }} />
      <ReportDrawer report={detail} groups={cfg.data?.groups || []} onClose={() => setDetail(null)}
        footer={detail && (canExport || canDelete) ? <>
          {canDelete && <button type="button" className="btn-default mr-auto text-danger" onClick={() => setDel(detail)}><Trash2 size={15} /> 删除报告</button>}
          {canExport && <LoadingButton variant="primary" icon={Download} loading={exporting} onClick={() => exportDoc(detail)}>导出 Word</LoadingButton>}
        </> : null} />
      <RunModal open={runOpen} onClose={() => setRunOpen(false)} onDone={() => { list.reload(); }} />
      <SettingsModal open={setOpen} onClose={() => setSetOpen(false)} catalog={cfg.data?.catalog || []} groups={cfg.data?.groups || []} onSaved={() => cfg.reload && cfg.reload()} />
      <ConfirmModal open={!!del} danger title="删除巡检报告" description="删除后无法恢复，已导出的 Word 文件不受影响。" targets={del ? [del.title] : []} confirmText="删除" loading={busy} onConfirm={remove} onCancel={() => setDel(null)} />
    </div>
  );
}
