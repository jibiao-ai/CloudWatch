import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Play } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import Tabs from '../components/Tabs';
import StatusDot from '../components/StatusDot';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import LoadingButton from '../components/LoadingButton';
import OverviewTab from '../components/monitor/OverviewTab';
import NodesTab from '../components/monitor/NodesTab';
import DisksTab from '../components/monitor/DisksTab';
import VMsTab from '../components/monitor/VMsTab';
import HostsTab from '../components/monitor/HostsTab';
import PoolsTab from '../components/monitor/PoolsTab';
import ServicesTab from '../components/monitor/ServicesTab';
import StepsTab from '../components/monitor/StepsTab';
import { monitorApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { combine, tagRows } from '../utils/monitorAgg';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime, fromNow } from '../utils/format';
import { RANGES } from '../utils/monitorUtil';

/** PerformancePage —— 监控中心（总览 / 服务状态 / 物理节点 / 计算节点 / 磁盘状态 / 虚拟机 / 集群存储 / 采集明细）：默认汇总全部云平台，各列表可按「所属云平台」筛选（与资产管理一致）；数据来自各平台 EMLA（/apis/monitoring/v1/ecms/*），后台按平台同步间隔采集并落库 */
const TAB_KEYS = ['overview', 'services', 'nodes', 'hosts', 'disks', 'vms', 'pools', 'steps'];

export default function PerformancePage() {
  const toast = useToast();
  const canCollect = useCan('monitor:collect');
  const plats = useAsync(() => monitorApi.getOverview(), []);
  const [sp] = useSearchParams();
  const [pid, setPid] = useState(sp.get('pid') || ''); // 空 = 全部云平台（默认）
  const [tab, setTab] = useState(TAB_KEYS.includes(sp.get('tab')) ? sp.get('tab') : 'overview'); // ?tab= 供运营分析跳转到指定页签
  const [range, setRange] = useState('6h');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [jump, setJump] = useState({ n: 0, kw: sp.get('kw') || '' }); // 总览全局搜索跳转：带入目标页签的关键字
  const spKey = sp.toString();
  const firstSp = useRef(true);
  useEffect(() => { // 全局搜索 / 概览在本页内再次跳转：同步平台、页签与关键字
    if (firstSp.current) { firstSp.current = false; return; }
    setPid(sp.get('pid') || '');
    const t = sp.get('tab');
    if (TAB_KEYS.includes(t)) setTab(t);
    setJump((j) => ({ n: j.n + 1, kw: sp.get('kw') || '' }));
  }, [spKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = plats.data || [];
  // 全部平台的快照 / 计算节点 / 集群存储一次取齐（平台数量有限），按「所属云平台」筛选在前端完成
  const ids = all.map((p) => p.id).join();
  const loadAll = useAsync(async () => {
    const one = (fn, p) => fn(p.id).catch(() => null);
    const [snaps, hosts, pools] = await Promise.all([
      Promise.all(all.map((p) => one(monitorApi.getSnapshot, p))),
      Promise.all(all.map((p) => one(monitorApi.getHosts, p))),
      Promise.all(all.map((p) => one(monitorApi.getPools, p))),
    ]);
    return { snaps, hosts, pools };
  }, [ids, tick]);
  const d = loadAll.data;
  const scope = all.filter((p) => !pid || p.id === pid);
  const items = scope.map((p) => ({ platform: p, snap: d?.snaps[all.indexOf(p)] || null }));
  const rows = useMemo(() => combine(items), [d, pid, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const listOf = (src) => ({ list: scope.flatMap((p) => tagRows(d?.[src][all.indexOf(p)]?.list, p)) });
  const hostsQ = { loading: loadAll.loading, error: loadAll.error, reload: loadAll.reload, data: d ? listOf('hosts') : null };
  const poolsQ = { loading: loadAll.loading, error: loadAll.error, reload: loadAll.reload, data: d ? listOf('pools') : null };
  const total = (get) => (d ? all.reduce((a, p, i) => a + (get(i) || 0), 0) : 0);
  const allTotals = { nodes: total((i) => d.snaps[i]?.nodes.length), services: total((i) => d.snaps[i]?.services.length), disks: total((i) => d.snaps[i]?.disks.length), vms: total((i) => d.snaps[i]?.vms.length), hosts: total((i) => d.hosts[i]?.list.length), pools: total((i) => d.pools[i]?.list.length), steps: total((i) => d.snaps[i]?.steps.length) };
  const plat = { value: pid, onChange: setPid, options: all.map((p) => ({ value: p.id, label: p.name })) };
  const goto = (t, kw) => { setJump((j) => ({ n: j.n + 1, kw })); setTab(t); };

  const collect = async () => {
    setBusy(true);
    try {
      const rs = await Promise.allSettled(scope.map((p) => monitorApi.collect(p.id)));
      const okN = rs.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
      const bad = rs.filter((r) => r.status === 'rejected');
      setTick((x) => x + 1);
      if (!bad.length) toast.success('采集完成', `${scope.length} 个云平台采集成功`);
      else toast.error(`${bad.length} 个云平台采集失败`, `${okN} 个成功；${bad[0].reason?.message || ''}`);
    } finally { setBusy(false); }
  };
  const cnt = (_k, n) => (d ? n : undefined);
  const tabs = [{ key: 'overview', label: '总览' }, { key: 'services', label: '服务状态', count: cnt('s', rows.services.length) }, { key: 'nodes', label: '物理节点', count: cnt('n', rows.nodes.length) }, { key: 'hosts', label: '计算节点', count: cnt('h', hostsQ.data?.list.length) }, { key: 'disks', label: '磁盘状态', count: cnt('d', rows.disks.length) }, { key: 'vms', label: '虚拟机', count: cnt('v', rows.vms.length) }, { key: 'pools', label: '集群存储', count: cnt('p', poolsQ.data?.list.length) }, { key: 'steps', label: '采集明细' }];
  const common = { plat, refreshKey: tick, initialKeyword: jump.kw };
  const okN = items.filter((it) => it.snap?.collectedAt && it.snap.ok).length;
  const last = items.reduce((m, it) => (it.snap?.collectedAt && it.snap.collectedAt > m ? it.snap.collectedAt : m), '');
  const alerts = items.reduce((a, it) => a + (it.snap?.alertFiring || 0), 0);
  const one = pid && items.length === 1 ? items[0].snap : null; // 选了某个平台时显示该平台的采集详情
  const hasData = items.some((it) => it.snap?.summary);

  return (
    <div className="bg-bg">
      <PageHeader title="监控中心" description="汇聚全部已对接云平台的 EMLA / Nova / Gnocchi 监控数据：总览、服务状态、物理节点、计算节点、磁盘状态、虚拟机、集群存储、采集明细；后台周期采集，趋势来自已落库的历史样本"
        actions={<>
          <div className="w-[140px]"><CustomSelect aria-label="趋势范围" value={range} onChange={setRange} options={RANGES} /></div>
          <LoadingButton icon={RefreshCw} loading={loadAll.refreshing} onClick={() => { plats.reload(); setTick((x) => x + 1); }}>刷新</LoadingButton>
          {canCollect && <LoadingButton variant="primary" icon={Play} loading={busy} disabled={!scope.length} onClick={collect}>立即采集</LoadingButton>}
        </>} />
      {plats.loading || (all.length > 0 && loadAll.loading) ? <Skeleton.Cards count={4} /> : plats.error ? <div className="card"><ErrorState error={plats.error} onRetry={plats.reload} /></div>
        : !all.length ? <div className="card"><EmptyState title="暂无纳管平台" description="请先在「平台管理」中新增并验证平台" /></div>
        : loadAll.error ? <div className="card"><ErrorState error={loadAll.error} onRetry={loadAll.reload} /></div> : d && (
          <>
            <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              {one ? (
                <>
                  <StatusDot status={one.collectedAt ? (one.ok ? 'online' : 'warning') : 'unknown'} label={one.collectedAt ? (one.ok ? '采集正常' : '最近一次采集失败') : '尚未采集'} />
                  <span className="text-fg-muted">最近成功采集：{one.collectedAt ? `${formatDateTime(one.collectedAt)}（${fromNow(one.collectedAt)}）` : '—'}</span>
                  <span className="text-fg-muted">耗时 {one.durationMs} ms</span>
                  <span className="text-fg-muted">告警中 {one.alertFiring} 条</span>
                  {!one.ok && one.error && <span className="text-danger break-all">{one.error}</span>}
                </>
              ) : (
                <>
                  <StatusDot status={!last ? 'unknown' : okN === items.length ? 'online' : 'warning'} label={!last ? '尚未采集' : okN === items.length ? '采集正常' : `${items.length - okN} 个平台采集异常`} />
                  <span className="text-fg-muted">已对接云平台 {items.length} 个</span>
                  <span className="text-fg-muted">最近采集：{last ? `${formatDateTime(last)}（${fromNow(last)}）` : '—'}</span>
                  <span className="text-fg-muted">告警中 {alerts} 条</span>
                </>
              )}
            </div>
            <Tabs items={tabs} value={tab} onChange={(t) => { setJump((j) => ({ n: j.n + 1, kw: '' })); setTab(t); }} className="mb-4" idPrefix="mon" />
            <div id="mon-panel" role="tabpanel" aria-labelledby={`mon-${tab}`}>
              {tab === 'steps' ? <StepsTab key={jump.n} {...common} rows={rows.steps} allTotal={allTotals.steps} />
                : !hasData ? <div className="card"><EmptyState title="暂无监控数据" description={canCollect ? '点击右上角「立即采集」，或等待后台按同步间隔自动采集' : '等待后台按同步间隔自动采集'} /></div>
                  : tab === 'overview' ? <OverviewTab items={items} rows={rows} hosts={hostsQ.data?.list || []} plat={plat} range={range} refreshKey={tick} onJump={goto} />
                    : tab === 'nodes' ? <NodesTab key={jump.n} {...common} rows={rows.nodes} allTotal={allTotals.nodes} />
                      : tab === 'hosts' ? <HostsTab key={jump.n} {...common} q={hostsQ} allTotal={allTotals.hosts} />
                        : tab === 'disks' ? <DisksTab key={jump.n} {...common} rows={rows.disks} allTotal={allTotals.disks} />
                          : tab === 'vms' ? <VMsTab key={jump.n} {...common} rows={rows.vms} platforms={scope} allTotal={allTotals.vms} />
                            : tab === 'pools' ? <PoolsTab key={jump.n} {...common} q={poolsQ} allTotal={allTotals.pools} /> : <ServicesTab key={jump.n} {...common} rows={rows.services} allTotal={allTotals.services} />}
            </div>
          </>
        )}
    </div>
  );
}
