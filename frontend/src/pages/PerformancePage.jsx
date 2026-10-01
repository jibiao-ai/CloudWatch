import React, { useEffect, useState } from 'react';
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
import { NodesTab, DisksTab, ServicesTab, StepsTab } from '../components/monitor/DetailTabs';
import { monitorApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime, fromNow } from '../utils/format';

const RANGES = [{ value: '1h', label: '近 1 小时' }, { value: '6h', label: '近 6 小时' }, { value: '24h', label: '近 24 小时' }, { value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }];

/** PerformancePage —— 性能监控：数据来自各平台 EMLA（/apis/monitoring/v1/ecms/*），后台按平台同步间隔采集并落库 */
export default function PerformancePage() {
  const toast = useToast();
  const canCollect = useCan('monitor:collect');
  const plats = useAsync(() => monitorApi.getOverview(), []);
  const [pid, setPid] = useState('');
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState('6h');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!pid && plats.data?.length) setPid(plats.data[0].id); }, [plats.data, pid]);
  const snap = useAsync(() => (pid ? monitorApi.getSnapshot(pid) : Promise.resolve(null)), [pid, tick]);
  const d = snap.data;

  const collect = async () => {
    setBusy(true);
    try {
      const r = await monitorApi.collect(pid);
      snap.setData(r);
      setTick((x) => x + 1);
      r.ok ? toast.success('采集完成', `耗时 ${r.durationMs} ms，告警中 ${r.alertFiring} 条`) : toast.error('采集失败', r.error);
    } catch (e) { toast.error('采集失败', e.message); } finally { setBusy(false); }
  };
  const tabs = [{ key: 'overview', label: '总览' }, { key: 'nodes', label: '计算节点', count: d?.nodes.length }, { key: 'disks', label: '磁盘', count: d?.disks.length }, { key: 'services', label: '服务状态' }, { key: 'steps', label: '采集明细' }];

  return (
    <div className="bg-bg">
      <PageHeader title="性能监控" description="对接平台 EMLA 监控接口：存储容量、vCPU / 内存、云主机状态、节点与磁盘、服务健康；后台周期采集，趋势来自已落库的历史样本"
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
            <Tabs items={tabs} value={tab} onChange={setTab} className="mb-4" idPrefix="mon" />
            <div id="mon-panel" role="tabpanel" aria-labelledby={`mon-${tab}`}>
              {tab === 'steps' ? <StepsTab snap={d} />
                : !d.summary ? <div className="card"><EmptyState title="暂无监控数据" description={canCollect ? '点击右上角「立即采集」，或等待后台按同步间隔自动采集' : '等待后台按同步间隔自动采集'} /></div>
                  : tab === 'overview' ? <OverviewTab snap={d} providerId={pid} range={range} refreshKey={tick} />
                    : tab === 'nodes' ? <NodesTab snap={d} providerId={pid} range={range} refreshKey={tick} />
                      : tab === 'disks' ? <DisksTab snap={d} /> : <ServicesTab snap={d} />}
            </div>
          </>
        )}
    </div>
  );
}
