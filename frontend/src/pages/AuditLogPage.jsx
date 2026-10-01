import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import ExportButton from '../components/ExportButton';
import RangeSelector, { defaultRange } from '../components/RangeSelector';
import Drawer from '../components/Drawer';
import ConfirmModal from '../components/ConfirmModal';
import FullscreenButton from '../components/FullscreenButton';
import { auditApi } from '../services/api';
import { useListQuery } from '../hooks/useListQuery';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_RESULTS } from '../data/dict';
import { formatDateTime, formatDuration } from '../utils/format';
import { maskSensitive } from '../utils/mask';

const label = (list, v) => list.find((x) => x.value === v)?.label || v;
const CLEAN_OPTS = [30, 90, 180, 365].map((d) => ({ value: d, label: `${d} 天前` }));

/** 列表/导出统一的查询参数：审计周期 → start/end（毫秒），排序 → sortKey/sortOrder */
const toParams = (q) => ({ ...q, start: q.range.start, end: q.range.end, sortKey: q.sort?.key, sortOrder: q.sort?.order, range: undefined, sort: undefined });

/** AuditLogPage —— 审计日志：时间范围（自定义）+ 操作人 + 模块 + 动作 + 结果 + 关键字；详情抽屉（参数脱敏）；导出当前筛选；清理仅有权限者可见 */

export default function AuditLogPage() {
  const toast = useToast();
  const canExport = useCan('audit:export');
  const canClean = useCan('audit:clean');
  const boxRef = React.useRef(null);
  const list = useListQuery('audit', (q) => auditApi.getAuditList(toParams(q)), { page: 1, pageSize: 20, range: defaultRange('1M'), operator: '', module: '', action: '', result: '', keyword: '', sort: { key: 'time', order: 'desc' } });
  const { query, setQuery } = list;
  const [detail, setDetail] = useState(null);
  const [clean, setClean] = useState(null); // days
  const [busy, setBusy] = useState(false);
  const params = toParams(query);

  const doClean = async () => {
    setBusy(true);
    try { const r = await auditApi.cleanAudits({ beforeDays: clean }); toast.success('清理完成', `已删除 ${r.removed} 条 ${clean} 天前的日志`); setClean(null); list.reload(); }
    catch (e) { toast.error('清理失败', e.message); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'time', title: '时间', width: 170, sortable: true, render: (a) => <span className="tabular-nums text-[13px]">{formatDateTime(a.time)}</span> },
    { key: 'operator', title: '操作人', width: 110, render: (a) => <div><div className="font-medium">{a.operator}</div>{a.operatorName && <div className="text-xs text-fg-subtle">{a.operatorName}</div>}</div> },
    { key: 'ip', title: 'IP', width: 120, render: (a) => <code className="text-[13px] text-fg-muted">{a.ip}</code> },
    { key: 'module', title: '模块', width: 100, render: (a) => <span className="tag-default">{label(AUDIT_MODULES, a.module)}</span> },
    { key: 'action', title: '动作', width: 100, render: (a) => label(AUDIT_ACTIONS, a.action) },
    { key: 'target', title: '目标', width: 240, render: (a) => <span className="truncate block max-w-[230px]" title={a.target}>{a.target}</span> },
    { key: 'result', title: '结果', width: 80, render: (a) => (a.result === 'success' ? <span className="tag-success">成功</span> : <span className="tag-danger">失败</span>) },
    { key: 'duration', title: '耗时', width: 90, sortable: true, align: 'right', render: (a) => <span className="tabular-nums text-fg-muted text-[13px]">{formatDuration(a.duration)}</span> },
  ];
  return (
    <div ref={boxRef} className="bg-bg">
      <PageHeader title="审计日志" description="记录登录与所有管理操作，默认按时间倒序；请求参数中的密码 / Token / 密钥一律脱敏" actions={<>
        <button type="button" className="btn-default" onClick={list.reload}><RefreshCw size={15} className={list.refreshing ? 'animate-spin' : ''} /> 刷新</button>
        <FullscreenButton containerRef={boxRef} />
        {canClean && <button type="button" className="btn-default !text-danger" onClick={() => setClean(180)}><Trash2 size={15} /> 清理日志</button>}
      </>} />
      <DataTable columns={columns} rows={list.rows} rowKey="id" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })} pageSizeOptions={[20, 50, 100]}
        sort={query.sort} onSortChange={(sort) => setQuery({ sort: sort || { key: 'time', order: 'desc' } })} onRowClick={setDetail}
        toolbar={<>
        <RangeSelector variant="select" label="审计周期" showCompare={false} value={query.range} onChange={(range) => setQuery({ range })} />
        <SearchInput value={query.operator} onChange={(operator) => setQuery({ operator })} placeholder="操作人" width={150} />
        <div className="w-[140px]"><CustomSelect size="sm" clearable placeholder="模块" aria-label="模块" value={query.module} onChange={(module) => setQuery({ module })} options={AUDIT_MODULES} /></div>
        <div className="w-[140px]"><CustomSelect size="sm" clearable placeholder="动作" aria-label="动作" value={query.action} onChange={(action) => setQuery({ action })} options={AUDIT_ACTIONS} /></div>
        <div className="w-[110px]"><CustomSelect size="sm" clearable placeholder="结果" aria-label="结果" value={query.result} onChange={(result) => setQuery({ result })} options={AUDIT_RESULTS} /></div>
        <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder="关键字（目标 / 错误 / IP）" width={240} />
        </>}
        extra={canExport && <ExportButton fn={auditApi.exportAudits} params={params} title="审计日志" filters={{ 模块: query.module, 动作: query.action, 结果: query.result, 操作人: query.operator, 关键字: query.keyword }} />}
        empty={{ title: '没有符合条件的日志', description: '尝试放宽时间范围或清除部分筛选条件' }} />

      <Drawer open={!!detail} title="审计详情" subtitle={detail && `${formatDateTime(detail.time)} · ${detail.operator}`} width={580} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              {[['操作人', `${detail.operator}${detail.operatorName ? `（${detail.operatorName}）` : ''}`], ['来源 IP', detail.ip], ['模块', label(AUDIT_MODULES, detail.module)], ['动作', label(AUDIT_ACTIONS, detail.action)], ['耗时', formatDuration(detail.duration)], ['结果', detail.result === 'success' ? '成功' : '失败']].map(([k, v]) => <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd className="text-sm text-fg mt-0.5">{v}</dd></div>)}
              <div className="col-span-2"><dt className="text-xs text-fg-muted">目标资源</dt><dd className="text-sm text-fg mt-0.5 flex items-center gap-2">{detail.target}{detail.targetLink && <Link to={detail.targetLink} onClick={() => setDetail(null)} className="text-primary-text text-[13px] inline-flex items-center gap-1 hover:underline"><ExternalLink size={13} />前往查看</Link>}</dd></div>
            </dl>
            {detail.error && <section><h3 className="text-[13px] font-semibold text-fg mb-1.5">错误信息</h3><pre className="text-xs text-danger bg-danger-soft rounded-lg px-3 py-2.5 whitespace-pre-wrap break-all font-mono">{detail.error}</pre></section>}
            <section><h3 className="text-[13px] font-semibold text-fg mb-1.5">请求参数（已脱敏）</h3><pre className="text-xs text-fg bg-muted rounded-lg px-3 py-3 overflow-x-auto font-mono leading-relaxed">{JSON.stringify(maskSensitive(detail.requestParams), null, 2)}</pre></section>
          </div>
        )}
      </Drawer>
      <ConfirmModal open={clean != null} danger title="清理审计日志？" description="将永久删除所选时间之前的审计日志，无法恢复。清理动作本身会被记录。"
        impactList={[`删除 ${clean} 天前产生的全部审计记录`, '不影响近期日志与业务数据', '建议先导出留档']} confirmText="确认清理" loading={busy} onCancel={() => setClean(null)} onConfirm={doClean}>
        <div className="mt-3"><div className="label">清理范围</div><CustomSelect value={clean} onChange={setClean} options={CLEAN_OPTS} aria-label="清理范围" /></div>
      </ConfirmModal>
    </div>
  );
}
