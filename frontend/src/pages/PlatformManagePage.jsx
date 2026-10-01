import React, { useState } from 'react';
import { Pencil, PlugZap, Plus, RefreshCw, Trash2, RotateCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import ExportButton from '../components/ExportButton';
import StatusDot from '../components/StatusDot';
import Switch from '../components/Switch';
import ConfirmModal from '../components/ConfirmModal';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import Tooltip from '../components/Tooltip';
import FullscreenButton from '../components/FullscreenButton';
import LoadingButton from '../components/LoadingButton';
import ProviderWizard from '../components/provider/ProviderWizard';
import VerifyResult from '../components/provider/VerifyResult';
import { providerApi, pollTask } from '../services/api';
import { useListQuery } from '../hooks/useListQuery';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store/useStore';
import { ENV_TAG, ENV_TYPES, OPENSTACK_COMPONENTS, PROVIDER_STATUS } from '../data/dict';
import { formatDateTime, fromNow, formatNumber } from '../utils/format';

const STATUS_OPTS = Object.entries(PROVIDER_STATUS).map(([value, v]) => ({ value, label: v.label }));

/**
 * PlatformManagePage —— 平台管理：列表 / 分步向导新增编辑 / 验证连接 / 立即同步 / 删除（影响范围）/ 写操作开关（全站联动）
 */
export default function PlatformManagePage() {
  const toast = useToast();
  const setProviders = useStore((s) => s.setProviders);
  const canCreate = useCan('provider:create');
  const canUpdate = useCan('provider:update');
  const canDelete = useCan('provider:delete');
  const canVerify = useCan('provider:verify');
  const canSync = useCan('provider:sync');
  const canSwitch = useCan('provider:write_switch');
  const canExport = useCan('provider:export');

  const list = useListQuery('providers', providerApi.getProviderList, { page: 1, pageSize: 10, keyword: '', envType: '', status: '', sort: null });
  const { query, setQuery } = list;
  const [wizard, setWizard] = useState({ open: false, provider: null, key: 0 });
  const [del, setDel] = useState({ target: null, impact: null, loading: false, busy: false });
  const [verify, setVerify] = useState({ open: false, provider: null, loading: false, result: null });
  const [sw, setSw] = useState({ target: null, next: false, busy: false });
  const [syncing, setSyncing] = useState({});
  const [detail, setDetail] = useState(null);
  const boxRef = React.useRef(null);

  const refreshStore = async () => {
    try { setProviders((await providerApi.getProviderList({ page: 1, pageSize: 100 })).list); } catch { /* ignore */ }
  };
  const reload = async () => { await list.reload(); refreshStore(); };
  const params = { ...query, sortKey: query.sort?.key, sortOrder: query.sort?.order };

  const openDelete = async (p) => {
    setDel({ target: p, impact: null, loading: true, busy: false });
    try { const impact = await providerApi.getProviderImpact(p.id); setDel((d) => ({ ...d, impact, loading: false })); }
    catch { setDel((d) => ({ ...d, loading: false })); }
  };
  const doDelete = async () => {
    setDel((d) => ({ ...d, busy: true }));
    try {
      await providerApi.deleteProvider(del.target.id);
      toast.success('平台已删除', del.target.name);
      setDel({ target: null, impact: null, loading: false, busy: false });
      if (list.rows.length === 1 && query.page > 1) setQuery({ page: query.page - 1 }, { resetPage: false });
      else reload();
      refreshStore();
    } catch (e) { toast.error('删除失败', e.message); setDel((d) => ({ ...d, busy: false })); }
  };
  const runVerify = async (p) => {
    setVerify({ open: true, provider: p, loading: true, result: null });
    try { const result = await providerApi.verifyProvider(p.id); setVerify((v) => ({ ...v, loading: false, result })); reload(); }
    catch (e) { toast.error('验证失败', e.message); setVerify({ open: false, provider: null, loading: false, result: null }); }
  };
  const doSwitch = async () => {
    setSw((s) => ({ ...s, busy: true }));
    try {
      await providerApi.setProviderWriteSwitch(sw.target.id, sw.next);
      toast.success(`写操作已${sw.next ? '开启' : '关闭'}`, sw.target.name);
      setSw({ target: null, next: false, busy: false });
      reload();
    } catch (e) { toast.error('切换失败', e.message); setSw((s) => ({ ...s, busy: false })); }
  };
  const sync = async (p) => {
    setSyncing((s) => ({ ...s, [p.id]: 0 }));
    try {
      const { taskId } = await providerApi.syncProvider(p.id);
      await pollTask(taskId, { onProgress: (t) => setSyncing((s) => ({ ...s, [p.id]: t.progress })) });
      toast.success('同步完成', p.name);
      reload();
    } catch (e) { toast.error('同步失败', e.message); }
    finally { setSyncing((s) => { const n = { ...s }; delete n[p.id]; return n; }); }
  };

  const columns = [
    { key: 'name', title: '云管标识', width: 210, sortable: true, render: (p) => <button type="button" className="text-left font-medium text-primary-text hover:underline" onClick={() => setDetail(p)}>{p.name}</button> },
    { key: 'envType', title: '环境类型', width: 100, render: (p) => <span className={ENV_TAG[p.envType]}>{ENV_TYPES.find((e) => e.value === p.envType)?.label}</span> },
    { key: 'consoleIp', title: '控制台IP', width: 130, sortable: true, render: (p) => <code className="text-[13px]">{p.consoleIp}</code> },
    { key: 'rootDomain', title: '根域名', width: 220, render: (p) => <code className="text-[13px] text-fg-muted">{p.rootDomain}</code> },
    { key: 'status', title: '状态', width: 90, render: (p) => <StatusDot status={p.status} label /> },
    { key: 'lastSyncAt', title: '最后同步', width: 130, sortable: true, render: (p) => <span title={formatDateTime(p.lastSyncAt)} className="text-fg-muted text-[13px]">{p.lastSyncAt ? fromNow(p.lastSyncAt) : '从未同步'}</span> },
    { key: 'writeEnabled', title: '写操作开关', width: 110, render: (p) => (
      <Tooltip content={!canSwitch ? '缺少权限：provider:write_switch' : p.writeEnabled ? '已开启：允许创建/删除类云资源操作' : '已关闭：创建/删除类操作在全站置灰'}>
        <span><Switch label={`${p.name} 写操作开关`} checked={p.writeEnabled} disabled={!canSwitch} onChange={(v) => setSw({ target: p, next: v, busy: false })} /></span>
      </Tooltip>) },
    { key: 'op', title: '操作', width: 220, sticky: 'right', render: (p) => (
      <div className="flex items-center gap-1">
        {canVerify && <LoadingButton variant="ghost" size="sm" icon={PlugZap} onClick={() => runVerify(p)}>验证</LoadingButton>}
        {canSync && <LoadingButton variant="ghost" size="sm" icon={RotateCw} loading={p.id in syncing} onClick={() => sync(p)}>{p.id in syncing ? `${syncing[p.id]}%` : '同步'}</LoadingButton>}
        {canUpdate && <button type="button" className="btn-icon !w-8 !h-8" aria-label={`编辑 ${p.name}`} title="编辑" onClick={() => setWizard({ open: true, provider: p, key: Date.now() })}><Pencil size={15} /></button>}
        {canDelete && <button type="button" className="btn-icon !w-8 !h-8 hover:!text-danger" aria-label={`删除 ${p.name}`} title="删除" onClick={() => openDelete(p)}><Trash2 size={15} /></button>}
      </div>) },
  ];

  const impact = del.impact;
  return (
    <div ref={boxRef} className="bg-bg">
      <PageHeader title="平台管理" description="纳管多套 OpenStack / 私有云：基本信息 + 认证信息即可接入，自动验证六个组件域名与 Keystone Token，统一控制写操作开关"
        actions={<>
          <button type="button" className="btn-default" onClick={reload} aria-label="刷新列表"><RefreshCw size={15} className={list.refreshing ? 'animate-spin' : ''} /> 刷新</button>
          <FullscreenButton containerRef={boxRef} />
          {canCreate && <button type="button" className="btn-primary" onClick={() => setWizard({ open: true, provider: null, key: Date.now() })}><Plus size={16} /> 新增平台</button>}
        </>} />
      <DataTable
        columns={columns} rows={list.rows} rowKey="id" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })}
        sort={query.sort} onSortChange={(sort) => setQuery({ sort })}
        toolbar={<>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder="搜索名称 / IP / 根域名" width={260} />
          <div className="w-[140px]"><CustomSelect size="sm" clearable placeholder="环境类型" aria-label="环境类型" value={query.envType} onChange={(envType) => setQuery({ envType })} options={ENV_TYPES} /></div>
          <div className="w-[120px]"><CustomSelect size="sm" clearable placeholder="状态" aria-label="状态" value={query.status} onChange={(status) => setQuery({ status })} options={STATUS_OPTS} /></div>
        </>}
        extra={canExport && <ExportButton fn={providerApi.exportProviders} params={params} title="平台列表" filters={{ 关键字: query.keyword, 环境: query.envType, 状态: query.status }} />}
        empty={{ title: query.keyword || query.envType || query.status ? '没有符合条件的平台' : '尚未纳管任何平台', description: '点击「新增平台」，填写基本信息与认证信息并验证连接', action: canCreate && !(query.keyword || query.envType || query.status) ? <button type="button" className="btn-primary" onClick={() => setWizard({ open: true, provider: null, key: Date.now() })}><Plus size={15} /> 新增平台</button> : undefined }}
      />

      {wizard.open && <ProviderWizard key={wizard.key} open provider={wizard.provider} onClose={() => setWizard({ open: false, provider: null, key: 0 })} onSaved={() => { setWizard({ open: false, provider: null, key: 0 }); reload(); }} onVerified={reload} />}

      <Modal open={verify.open} width={560} title={`验证连接：${verify.provider?.name || ''}`} subtitle="验证 Keystone 是否签发 Token，并逐个检测六个组件域名的 HTTP 连通性" onClose={() => setVerify({ open: false, provider: null, loading: false, result: null })}
        footer={<><button type="button" className="btn-default" onClick={() => setVerify({ open: false, provider: null, loading: false, result: null })}>关闭</button><LoadingButton variant="primary" icon={PlugZap} loading={verify.loading} onClick={() => runVerify(verify.provider)}>重新验证</LoadingButton></>}>
        <VerifyResult loading={verify.loading} result={verify.result} hosts={(verify.provider?.components || []).map((c) => ({ ...c, label: OPENSTACK_COMPONENTS.find((o) => o.key === c.key)?.label || c.key }))} />
      </Modal>

      <ConfirmModal open={!!del.target} danger title={`删除平台「${del.target?.name || ''}」？`} description="此操作不可恢复。删除后将停止对该平台的自动同步。" targets={del.target ? [`${del.target.name}（${del.target.consoleIp}）`] : []}
        impactList={impact ? [impact.synced ? `将移除该平台的接入信息与最近一次同步统计（云主机 ${formatNumber(impact.vmCount)} 台、云硬盘 ${formatNumber(impact.volumeCount)} 块、网络 ${formatNumber(impact.networkCount)} 个）` : '将移除该平台的接入信息（尚未同步过资源）', '该平台的同步任务记录将一并删除', '不会对云平台本身的资源产生任何变更'] : del.loading ? ['正在统计影响范围…'] : ['接入信息、同步统计将一并移除']}
        confirmText="确认删除" loading={del.busy} onCancel={() => setDel({ target: null, impact: null, loading: false, busy: false })} onConfirm={doDelete} />

      <ConfirmModal open={!!sw.target} danger={!sw.next ? false : sw.target?.envType === 'prod'} title={`${sw.next ? '开启' : '关闭'}「${sw.target?.name || ''}」的写操作？`}
        description={sw.next ? '开启后，用户可对该平台执行创建 / 删除类云资源操作（云主机、云硬盘等）。' : '关闭后，创建 / 删除类按钮将在全站置灰，并提示原因；只读查询不受影响。'}
        impactList={sw.next ? [sw.target?.envType === 'prod' ? '这是【生产环境】，请确认已获得变更审批' : '仅影响该平台', '所有写操作都会记录到审计日志'] : ['云主机 / 云硬盘的创建、删除、挂载入口将置灰', '正在执行中的任务不受影响']}
        confirmText={sw.next ? '确认开启' : '确认关闭'} loading={sw.busy} onCancel={() => setSw({ target: null, next: false, busy: false })} onConfirm={doSwitch} />

      <Drawer open={!!detail} title={detail?.name} subtitle={`${detail?.consoleIp}　·　${detail?.rootDomain}`} width={520} onClose={() => setDetail(null)}
        footer={canUpdate && <button type="button" className="btn-primary" onClick={() => { setWizard({ open: true, provider: detail, key: Date.now() }); setDetail(null); }}><Pencil size={15} /> 编辑</button>}>
        {detail && (
          <div className="space-y-5">
            <section><h3 className="text-[13px] font-semibold text-fg mb-2">组件域名</h3>
              <ul className="rounded-lg border border-line divide-y divide-line">{detail.components.map((c) => <li key={c.key} className="px-3 py-2 flex gap-3 text-[13px]"><span className="w-16 text-fg-muted shrink-0">{c.key}</span><code className="break-all">{c.host}</code></li>)}</ul></section>
            <section><h3 className="text-[13px] font-semibold text-fg mb-2">认证信息</h3>
              <dl className="rounded-lg border border-line divide-y divide-line text-[13px]">
                {[['用户名', detail.auth.username], ['密码', '******'], ['项目', detail.auth.projectName], ['用户域 / 项目域', `${detail.auth.userDomain} / ${detail.auth.projectDomain}`]].map(([k, v]) => <div key={k} className="px-3 py-2 flex gap-3"><dt className="w-28 text-fg-muted shrink-0">{k}</dt><dd>{v}</dd></div>)}
              </dl></section>
            <section><h3 className="text-[13px] font-semibold text-fg mb-2">高级</h3>
              <dl className="rounded-lg border border-line divide-y divide-line text-[13px]">
                {[['请求超时', `${detail.advanced.timeoutSec} 秒`], ['同步间隔', `${detail.advanced.syncIntervalMin} 分钟`], ['备注', detail.advanced.remark || '-']].map(([k, v]) => <div key={k} className="px-3 py-2 flex gap-3"><dt className="w-28 text-fg-muted shrink-0">{k}</dt><dd className="break-all">{v}</dd></div>)}
              </dl></section>
            <section><h3 className="text-[13px] font-semibold text-fg mb-2">最近一次同步</h3>
              <dl className="rounded-lg border border-line divide-y divide-line text-[13px]">
                {[['同步时间', detail.lastSyncAt ? formatDateTime(detail.lastSyncAt) : '从未同步'], ['云主机 / 云硬盘 / 网络', detail.lastSyncAt ? `${formatNumber(detail.stats.vmCount)} / ${formatNumber(detail.stats.volumeCount)} / ${formatNumber(detail.stats.networkCount)}` : '-'], ['可用域', detail.zones?.length ? detail.zones.join('、') : '-'], ['失败原因', detail.lastSyncError || '-']].map(([k, v]) => <div key={k} className="px-3 py-2 flex gap-3"><dt className="w-36 text-fg-muted shrink-0">{k}</dt><dd className="break-all">{v}</dd></div>)}
              </dl></section>
            {detail.lastVerify && <section><h3 className="text-[13px] font-semibold text-fg mb-2">最近一次验证连接</h3><VerifyResult result={detail.lastVerify} hosts={detail.components.map((c) => ({ ...c, label: OPENSTACK_COMPONENTS.find((o) => o.key === c.key)?.label || c.key }))} /></section>}
          </div>
        )}
      </Drawer>
    </div>
  );
}
