import React, { useState } from 'react';
import { RefreshCw, CheckCheck, AlertOctagon, AlertTriangle, Info, BellRing } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import ExportButton from '../components/ExportButton';
import Drawer from '../components/Drawer';
import StatCard from '../components/StatCard';
import { alertApi } from '../services/api';
import { useListQuery } from '../hooks/useListQuery';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime } from '../utils/format';

const SEV = [{ value: 'critical', label: '严重' }, { value: 'warning', label: '警告' }, { value: 'info', label: '提示' }];
const STATUS = [{ value: 'firing', label: '告警中' }, { value: 'resolved', label: '已恢复' }];
const TYPE = [{ value: 'service', label: '服务' }, { value: 'storage', label: '存储' }, { value: 'log', label: '日志' }, { value: 'host', label: '主机' }, { value: 'others', label: '其他' }];
const ACKED = [{ value: '0', label: '未确认' }, { value: '1', label: '已确认' }];
const SEV_TAG = { critical: 'tag-danger', warning: 'tag-warning', info: 'tag-info' };
const lab = (list, v) => list.find((x) => x.value === v)?.label || v || '-';
const toParams = (q) => ({ keyword: q.keyword, severity: q.severity, status: q.status, type: q.type, acked: q.acked, sortKey: q.sort?.key, sortOrder: q.sort?.order });

/** AlertCenterPage —— 告警中心：统计 + 筛选 + 列表 + 详情抽屉 + 确认 / 同步 / 导出（对接 EMLA 第5章告警接口） */
export default function AlertCenterPage() {
  const toast = useToast();
  const canAck = useCan('alert:ack');
  const canSync = useCan('alert:sync');
  const canExport = useCan('alert:export');
  const list = useListQuery('alerts', (q) => alertApi.getAlertList({ ...toParams(q), page: q.page, pageSize: q.pageSize }), { page: 1, pageSize: 10, keyword: '', severity: '', status: '', type: '', acked: '', sort: { key: 'firedAt', order: 'desc' } });
  const { query, setQuery } = list;
  const stats = useAsync(() => alertApi.getAlertStats(), []);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const st = stats.data || { severity: {}, firing: 0, unacked: 0 };

  const reloadAll = () => { list.reload(); stats.reload && stats.reload(); };
  const ack = async (ids) => {
    setBusy(true);
    try { await alertApi.ackAlerts(ids); toast.success('已确认', `${ids.length} 条告警`); setSelected([]); setDetail(null); reloadAll(); }
    catch (e) { toast.error('确认失败', e.message); } finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true);
    try { await alertApi.syncAlerts(); toast.success('同步完成', '已从云平台拉取最新告警'); reloadAll(); }
    catch (e) { toast.error('同步失败', e.message); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'severity', title: '级别', width: 80, sortable: true, render: (a) => <span className={SEV_TAG[a.severity] || 'tag-default'}>{lab(SEV, a.severity)}</span> },
    { key: 'name', title: '告警名称', width: 260, sortable: true, render: (a) => <div><div className="font-medium truncate max-w-[250px]" title={a.name}>{a.name}</div>{a.summary && <div className="text-xs text-fg-subtle truncate max-w-[250px]" title={a.summary}>{a.summary}</div>}</div> },
    { key: 'type', title: '类型', width: 80, render: (a) => <span className="tag-default">{lab(TYPE, a.type)}</span> },
    { key: 'object', title: '对象', width: 170, render: (a) => <span className="text-[13px]">{a.nodeName || a.hostIp || a.component || '-'}</span> },
    { key: 'providerName', title: '平台', width: 130, render: (a) => <span className="text-[13px] text-fg-muted">{a.providerName}</span> },
    { key: 'status', title: '状态', width: 80, render: (a) => (a.status === 'firing' ? <span className="tag-danger">告警中</span> : <span className="tag-success">已恢复</span>) },
    { key: 'acked', title: '确认', width: 80, render: (a) => (a.acked ? <span className="tag-default">已确认</span> : <span className="tag-warning">未确认</span>) },
    { key: 'firedAt', title: '触发时间', width: 160, sortable: true, render: (a) => <span className="tabular-nums text-[13px]">{formatDateTime(a.firedAt)}</span> },
    { key: 'resolvedAt', title: '恢复时间', width: 160, sortable: true, render: (a) => <span className="tabular-nums text-[13px]">{a.resolvedAt ? formatDateTime(a.resolvedAt) : '-'}</span> },
  ];
  const kv = (d) => [['英文名', d.nameEn], ['类型', lab(TYPE, d.type)], ['组件', d.component], ['节点', d.nodeName], ['主机 IP', d.hostIp], ['项目', d.project], ['平台', d.providerName], ['规则 ID', d.ruleId], ['触发时间', formatDateTime(d.firedAt)], ['恢复时间', d.resolvedAt ? formatDateTime(d.resolvedAt) : '-'], ['确认', d.acked ? `${d.ackedBy} · ${formatDateTime(d.ackedAt)}` : '未确认']];
  const Block = ({ title, text }) => text ? <section><h3 className="text-[13px] font-semibold text-fg mb-1.5">{title}</h3><div className="text-sm text-fg bg-muted rounded-lg px-3 py-2.5 whitespace-pre-wrap break-all">{text}</div></section> : null;

  return (
    <div className="bg-bg">
      <PageHeader title="告警中心" description="汇聚云平台（EMLA）告警：自动采集、自动恢复、通知渠道推送；告警中心仅记录，处理请在云平台完成" actions={<>
        <button type="button" className="btn-default" onClick={reloadAll}><RefreshCw size={15} className={list.refreshing ? 'animate-spin' : ''} /> 刷新</button>
        {canSync && <button type="button" className="btn-primary" disabled={busy} onClick={sync}><BellRing size={15} /> 立即同步</button>}
      </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={AlertOctagon} tone="danger" label="严重（告警中）" value={st.severity.critical || 0} />
        <StatCard icon={AlertTriangle} tone="warning" label="警告（告警中）" value={st.severity.warning || 0} />
        <StatCard icon={Info} tone="info" label="提示（告警中）" value={st.severity.info || 0} />
        <StatCard icon={BellRing} tone="primary" label="告警中 / 未确认" value={`${st.firing} / ${st.unacked}`} />
      </div>
      <div className="card p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder="关键字（名称 / 节点 / IP）" width={240} />
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="级别" aria-label="级别" value={query.severity} onChange={(severity) => setQuery({ severity })} options={SEV} /></div>
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="状态" aria-label="状态" value={query.status} onChange={(status) => setQuery({ status })} options={STATUS} /></div>
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="类型" aria-label="类型" value={query.type} onChange={(type) => setQuery({ type })} options={TYPE} /></div>
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="确认" aria-label="确认" value={query.acked} onChange={(acked) => setQuery({ acked })} options={ACKED} /></div>
        </div>
      </div>
      <DataTable columns={columns} rows={list.rows} rowKey="id" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })} pageSizeOptions={[10, 20, 50, 100]}
        sort={query.sort} onSortChange={(sort) => setQuery({ sort: sort || { key: 'firedAt', order: 'desc' } })} onRowClick={setDetail}
        selectable={canAck} selected={selected} onSelectedChange={setSelected} isRowSelectable={(r) => !r.acked}
        selectionBar={<button type="button" className="btn-default btn-sm" disabled={busy} onClick={() => ack(selected)}><CheckCheck size={14} /> 批量确认（{selected.length}）</button>}
        extra={canExport && <ExportButton fn={alertApi.exportAlerts} params={toParams(query)} title="告警列表" filters={{ 关键字: query.keyword, 级别: lab(SEV, query.severity), 状态: lab(STATUS, query.status) }} />}
        empty={{ title: '暂无告警', description: '云平台当前没有符合条件的告警' }} />
      <Drawer open={!!detail} title={detail?.name || '告警详情'} subtitle={detail && `${lab(SEV, detail.severity)} · ${lab(STATUS, detail.status)}`} width={600} onClose={() => setDetail(null)}
        footer={detail && canAck && !detail.acked ? <button type="button" className="btn-primary" disabled={busy} onClick={() => ack([detail.id])}><CheckCheck size={15} /> 确认告警</button> : null}>
        {detail && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              {kv(detail).map(([k, v]) => <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd className="text-sm text-fg mt-0.5 break-all">{v || '-'}</dd></div>)}
            </dl>
            <Block title="摘要" text={detail.summary} />
            <Block title="描述" text={detail.description} />
            <Block title="处理建议" text={detail.solution} />
            <Block title="标签" text={Object.entries(detail.labels || {}).map(([k, v]) => `${k}=${v}`).join('\n')} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
