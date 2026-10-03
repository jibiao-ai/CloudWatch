import React, { useEffect, useRef, useState } from 'react';
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
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime, fromNow } from '../utils/format';
import { RANGES } from '../utils/monitorUtil';

/** PerformancePage —— 监控中心（总览 / 服务状态 / 物理节点 / 计算节点 / 磁盘状态 / 虚拟机 / 集群存储 / 采集明细）：数据来自各平台 EMLA（/apis/monitoring/v1/ecms/*），后台按平台同步间隔采集并落库 */
export default function PerformancePage() {
  const toast = useToast();
  const canCollect = useCan('monitor:collect');
  const plats = useAsync(() => monitorApi.getOverview(), []);
  const [sp] = useSearchParams();
  const [pid, setPid] = useState(sp.get('pid') || '');
  const [tab, setTab] = useState(['overview', 'services', 'nodes', 'hosts', 'disks', 'vms', 'pools', 'steps'].includes(sp.get('tab')) ? sp.get('tab') : 'overview'); // ?tab= 供运营分析跳转到指定页签
  const [range, setRange] = useState('6h');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [jump, setJump] = useState({ n: 0, kw: sp.get('kw') || '' }); // 总览全局搜索跳转：带入目标页签的关键字
  const spKey = sp.toString();
  const firstSp = useRef(true);
  useEffect(() => { // 全局搜索 / 概览在本页内再次跳转：同步平台、页签与关键字
    if (firstSp.current) { firstSp.current = false; return; }
    if (sp.get('pid')) setPid(sp.get('pid'));
    const t = sp.get('tab');
    if (['overview', 'services', 'nodes', 'hosts', 'disks', 'vms', 'pools', 'steps'].includes(t)) setTab(t);
    setJump((j) => ({ n: j.n + 1, kw: sp.get('kw') || '' }));
  }, [spKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pid && plats.data?.length) setPid(plats.data[0].id); }, [plats.data, pid]);
  const snap = useAsync(() => (pid ? monitorApi.getSnapshot(pid) : Promise.resolve(null)), [pid, tick]);
  const hosts = useAsync(() => (pid ? monitorApi.getHosts(pid) : Promise.resolve(null)), [pid, tick]); // 计算节点 / 集群存储：页签角标与列表共用同一份数据
  const pools = useAsync(() => (pid ? monitorApi.getPools(pid) : Promise.resolve(null)), [pid, tick]);
  const d = snap.data;
  const platform = (plats.data || []).find((p) => p.id === pid);
  const goto = (t, kw) => { setJump((j) => ({ n: j.n + 1, kw })); setTab(t); };

  const collect = async () => {
    setBusy(true);
    try {
      const r = await monitorApi.collect(pid);
      snap.setData(r);
      setTick((x) => x + 1);
      r.ok ? toast.success('采集完成', `耗时 ${r.durationMs} ms，告警中 ${r.alertFiring} 条`) : toast.error('采集失败', r.error);
    } catch (e) { toast.error('采集失败', e.message); } finally { setBusy(false); }
  };
  const tabs = [{ key: 'overview', label: '总览' }, { key: 'services', label: '服务状态', count: d?.services.length }, { key: 'nodes', label: '物理节点', count: d?.nodes.length }, { key: 'hosts', label: '计算节点', count: hosts.data?.list.length }, { key: 'disks', label: '磁盘状态', count: d?.disks.length }, { key: 'vms', label: '虚拟机', count: d?.vms.length }, { key: 'pools', label: '集群存储', count: pools.data?.list.length }, { key: 'steps', label: '采集明细' }];
  const common = { snap: d, platform, providerId: pid, refreshKey: tick, initialKeyword: jump.kw };

  return (
    <div className="bg-bg">
      <PageHeader title="监控中心" description="对接平台 EMLA / Nova / Gnocchi 接口：总览、服务状态、物理节点、计算节点、磁盘状态、虚拟机、集群存储、采集明细；后台周期采集，趋势来自已落库的历史样本"
        actions={<>
          <div className="w-[240px]"><CustomSelect aria-label="选择平台" placeholder="选择平台" value={pid} onChange={setPid} options={(plats.data || []).map((p) => ({ value: p.id, label: p.name }))} /></div>
          <div className="w-[140px]"><CustomSelect aria-label="趋势范围" value={range} onChange={setRange} options={RANGES} /></div>
          <LoadingButton icon={RefreshCw} loading={snap.refreshing} onClick={() => { plats.reload(); setTick((x) => x + 1); }}>刷新</LoadingButton>
          {canCollect && <LoadingButton variant="primary" icon={Play} loading={busy} disabled={!pid} onClick={collect}>立即采集</LoadingButton>}
        </>} />
      {plats.loading || snap.loading ? <Skeleton.Cards count={4} /> : plats.error ? <div className="card"><ErrorState error={plats.error} onRetry={plats.reload} /></div>
        : !plats.data?.length ? <div className="card"><EmptyState title="暂无纳管平台" description="请先在「平台管理」中新增并验证平台" /></div>
        : snap.error ? <div className="card"><ErrorState error={snap.error} onRetry={snap.reload} /></div> : d && (
          <>
            <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              <StatusDot status={d.collectedAt ? (d.ok ? 'online' : 'warning') : 'unknown'} label={d.collectedAt ? (d.ok ? '采集正常' : '最近一次采集失败') : '尚未采集'} />
              <span className="text-fg-muted">最近成功采集：{d.collectedAt ? `${formatDateTime(d.collectedAt)}（${fromNow(d.collectedAt)}）` : '—'}</span>
              <span className="text-fg-muted">耗时 {d.durationMs} ms</span>
              <span className="text-fg-muted">告警中 {d.alertFiring} 条</span>
              {!d.ok && d.error && <span className="text-danger break-all">{d.error}</span>}
            </div>
            <Tabs items={tabs} value={tab} onChange={(t) => { setJump((j) => ({ n: j.n + 1, kw: '' })); setTab(t); }} className="mb-4" idPrefix="mon" />
            <div id="mon-panel" role="tabpanel" aria-labelledby={`mon-${tab}`}>
              {tab === 'steps' ? <StepsTab key={jump.n} {...common} />
                : !d.summary ? <div className="card"><EmptyState title="暂无监控数据" description={canCollect ? '点击右上角「立即采集」，或等待后台按同步间隔自动采集' : '等待后台按同步间隔自动采集'} /></div>
                  : tab === 'overview' ? <OverviewTab snap={d} platform={platform} providerId={pid} range={range} refreshKey={tick} onJump={goto} />
                    : tab === 'nodes' ? <NodesTab key={jump.n} {...common} />
                      : tab === 'hosts' ? <HostsTab key={jump.n} {...common} q={hosts} />
                        : tab === 'disks' ? <DisksTab key={jump.n} {...common} />
                          : tab === 'vms' ? <VMsTab key={jump.n} {...common} />
                            : tab === 'pools' ? <PoolsTab key={jump.n} {...common} q={pools} /> : <ServicesTab key={jump.n} {...common} />}
            </div>
          </>
        )}
    </div>
  );
}
