import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import TabPager from '../components/TabPager';
import LoadingButton from '../components/LoadingButton';
import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import MappingCard from '../components/domain/MappingCard';
import MappingModal from '../components/domain/MappingModal';
import SyncPanel from '../components/domain/SyncPanel';
import ReportPanel from '../components/domain/ReportPanel';
import Pagination from '../components/Pagination';
import { allLines } from '../components/domain/hosts';
import { domainApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { copyText } from '../utils/download';

const TAB_ID = 'domain-tab';
const TABS = ['mappings', 'sync', 'report'];
const PAGE_SIZE = 10; // 映射超过 10 条时分页

/** 报告中有失败通道时给出可读提示 */
const failedText = (rep) => ['local'].filter((k) => rep?.[k]?.status === 'failed').map((k) => `${{ local: '本机 hosts' }[k]}：${rep[k].message}`).join('；');

/** DomainConfigPage —— 域名配置：录入「控制台 IP + 根域名」自动生成 hosts 记录，并同步到本机 hosts */
export default function DomainConfigPage() {
  const toast = useToast();
  const canUpdate = useCan('domain:update');
  const canVerify = useCan('domain:verify');
  const { data, loading, error, reload } = useAsync(() => domainApi.getDomainConfig(), []);
  const [state, setState] = useState(null);
  const [modal, setModal] = useState({ open: false, item: null });
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncSaving, setSyncSaving] = useState(false);
  const [, setSyncErrs] = useState({});
  const [applying, setApplying] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [del, setDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [syncDirty, setSyncDirty] = useState(false);
  const [pg, setPg] = useState({ page: 1, pageSize: PAGE_SIZE });
  const [tab, setTab] = useState(() => { const h = window.location.hash.slice(1); return TABS.includes(h) ? h : 'mappings'; });
  const onSyncDirty = useCallback((v) => setSyncDirty(v), []);
  useEffect(() => { window.history.replaceState(null, '', `#${tab}`); }, [tab]);
  useEffect(() => { if (data) setState(data); }, [data]);

  const total = state?.mappings.length || 0;
  const lastPage = Math.max(1, Math.ceil(total / pg.pageSize));
  const page = Math.min(pg.page, lastPage); // 删除后页码越界时回退
  const pageItems = state ? state.mappings.slice((page - 1) * pg.pageSize, page * pg.pageSize) : [];
  const patch = (p) => setState((s) => ({ ...s, ...p }));
  /** 同步结果提示：有失败通道用警告，否则成功 */
  const notify = (title, rep) => {
    const bad = failedText(rep);
    if (bad) toast.warning(`${title}，但同步未完全成功`, bad); else toast.success(title, rep ? `已同步 ${rep.lines} 条记录` : undefined);
  };

  const submit = async (form) => {
    setSaving(true); setErrs({});
    try {
      const it = modal.item;
      const res = it ? await domainApi.updateMapping(it.id, { ...form, enabled: it.enabled }) : await domainApi.createMapping(form);
      setState((s) => ({ ...s, mappings: it ? s.mappings.map((m) => (m.id === it.id ? res.mapping : m)) : [...s.mappings, res.mapping], report: res.report }));
      setModal({ open: false, item: null });
      notify(it ? '映射已更新' : '映射已创建', res.report);
    } catch (e) {
      if (e.data?.fields) setErrs(e.data.fields); else toast.error('保存失败', e.message);
    } finally { setSaving(false); }
  };
  const toggle = async (m, enabled) => {
    setToggling(m.id);
    try {
      const res = await domainApi.updateMapping(m.id, { name: m.name, consoleIp: m.consoleIp, rootDomain: m.rootDomain, components: m.components, probePort: m.probePort, remark: m.remark, enabled });
      setState((s) => ({ ...s, mappings: s.mappings.map((x) => (x.id === m.id ? res.mapping : x)), report: res.report }));
      notify(enabled ? '映射已启用' : '映射已停用', res.report);
    } catch (e) { toast.error('操作失败', e.message); } finally { setToggling(null); }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      const res = await domainApi.deleteMapping(del.id);
      setState((s) => ({ ...s, mappings: s.mappings.filter((m) => m.id !== del.id), report: res.report }));
      notify('映射已删除', res.report); setDel(null);
    } catch (e) { toast.error('删除失败', e.message); } finally { setDeleting(false); }
  };
  const saveSync = async (payload) => {
    setSyncSaving(true); setSyncErrs({});
    try {
      const res = await domainApi.saveSync(payload);
      patch({ sync: res.sync, report: res.report, dnsAddr: res.dnsAddr });
      notify('同步方式已保存', res.report);
    } catch (e) {
      if (e.data?.fields) { setSyncErrs(e.data.fields); toast.error('保存失败', Object.values(e.data.fields)[0]); } else toast.error('保存失败', e.message);
    } finally { setSyncSaving(false); }
  };
  const apply = async () => {
    setApplying(true);
    try { const res = await domainApi.applyDomain(); patch({ report: res.report, dnsAddr: res.dnsAddr }); notify('已重新同步', res.report); } catch (e) { toast.error('同步失败', e.message); } finally { setApplying(false); }
  };
  const copyAll = async () => {
    const lines = allLines(state.mappings);
    if (!lines.length) return toast.warning('暂无已启用的映射');
    return (await copyText(lines.join('\n'))) ? toast.success('已复制全部 hosts 记录', `${lines.length} 条`) : toast.error('复制失败');
  };

  const items = [
    { key: 'mappings', label: '域名配置', count: state?.mappings.length },
    { key: 'sync', label: '同步方式', dot: syncDirty },
    { key: 'report', label: '最近一次同步' },
  ];

  return (
    <div>
      <PageHeader title="域名配置" description="录入云平台控制台 IP 与根域名，自动生成 keystone / nova / neutron / cinder / glance / gnocchi 等组件的 hosts 记录，并同步到本机 /etc/hosts"
        actions={<>
          {state && tab === 'mappings' && <button type="button" className="btn-default" onClick={copyAll}><Copy size={15} /> 复制全部 hosts</button>}
          {canUpdate && <LoadingButton icon={RefreshCw} loading={applying} onClick={apply}>立即同步</LoadingButton>}
          {canUpdate && tab === 'mappings' && <button type="button" className="btn-primary" onClick={() => { setErrs({}); setModal({ open: true, item: null }); }}><Plus size={15} /> 新增映射</button>}
        </>} />
      {loading && !state ? <Skeleton.Chart height={300} /> : error && !state ? <div className="card"><ErrorState error={error} onRetry={reload} /></div> : state && (
        <div className="space-y-4">
          <Tabs idPrefix={TAB_ID} items={items} value={tab} onChange={setTab} />
          <div id={`${TAB_ID}-panel`} role="tabpanel" aria-labelledby={`${TAB_ID}-${tab}`}>
            <div hidden={tab !== 'mappings'} className="space-y-4">
              {state.mappings.length === 0 ? (
                <div className="card"><EmptyState title="还没有域名映射" description="点击「新增映射」，填写控制台 IP 与根域名，例如 192.168.27.150 与 openstack.svc.cluster.local" /></div>
              ) : pageItems.map((m) => (
                <MappingCard key={m.id} m={m} canUpdate={canUpdate} canVerify={canVerify} toggling={toggling === m.id}
                  onToggle={(v) => toggle(m, v)} onEdit={() => { setErrs({}); setModal({ open: true, item: m }); }} onDelete={() => setDel(m)} />
              ))}
              {total > PAGE_SIZE && <div className="card"><Pagination page={page} pageSize={pg.pageSize} total={total} pageSizeOptions={[10, 20, 50]} onChange={setPg} /></div>}
            </div>
            <div hidden={tab !== 'sync'}><SyncPanel sync={state.sync} canUpdate={canUpdate} saving={syncSaving} onSave={saveSync} onDirty={onSyncDirty} /></div>
            <div hidden={tab !== 'report'}><ReportPanel report={state.report} /></div>
          </div>
          <TabPager items={items} value={tab} onChange={setTab} />
        </div>
      )}
      <MappingModal open={modal.open} initial={modal.item} errors={errs} saving={saving} onSubmit={submit} onClose={() => setModal({ open: false, item: null })} />
      <ConfirmModal open={!!del} danger title="删除该域名映射？" targets={[del ? `${del.name}（${del.rootDomain}）` : '']} impactList={['对应的 hosts 记录会从本机 hosts 中移除', '依赖这些域名访问云平台的服务将无法解析']} confirmText="确认删除" loading={deleting} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}
