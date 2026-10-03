import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import CustomSelect from '../components/CustomSelect';
import FullscreenButton from '../components/FullscreenButton';
import LoadingButton from '../components/LoadingButton';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { KpiRow, CapacityRow } from '../components/dashboard/KpiCapacity';
import TrendCard from '../components/dashboard/TrendCard';
import PlatformTable from '../components/dashboard/PlatformTable';
import { TopNodes, RecentAlerts, Suggestions } from '../components/dashboard/SidePanels';
import { dashboardApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useStore } from '../store/useStore';

/** DashboardPage —— 平台概览：平台 → 节点 → 虚拟机 → 存储的健康与容量一览；各区块按权限展示，点击均可跳转到对应功能 */
export default function DashboardPage() {
  const boxRef = useRef(null);
  const providers = useStore((s) => s.providers);
  const [pid, setPid] = useState('');
  const [range, setRange] = useState('24h');
  const ov = useAsync(() => dashboardApi.getOverview(), []);
  const canTrend = ov.data ? ov.data.perms.monitor : true;
  const tr = useAsync(() => (canTrend ? dashboardApi.getTrend({ range, providerId: pid || undefined }) : Promise.resolve({ points: [] })), [range, pid, canTrend]);
  const d = ov.data;
  const rows = (d?.platforms || []).filter((p) => !pid || p.id === pid);

  return (
    <div ref={boxRef} className="bg-bg space-y-5">
      <PageHeader
        title="平台概览"
        description="纳管云平台的整体健康、资源容量、实际负载与告警一览；点击任意指标可进入对应功能"
        actions={<>
          <div className="w-[220px]"><CustomSelect clearable placeholder="全部平台" aria-label="筛选平台" value={pid} onChange={setPid} options={providers.map((p) => ({ value: p.id, label: p.name }))} /></div>
          <LoadingButton icon={RefreshCw} loading={ov.refreshing || tr.refreshing} onClick={() => { ov.reload(); tr.reload(); }}>刷新</LoadingButton>
          <FullscreenButton containerRef={boxRef} />
        </>}
      />
      {ov.loading ? <Skeleton.Cards count={5} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div> : (
        <>
          <KpiRow data={d} />
          {d.perms.capacity && <CapacityRow totals={d.totals} />}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
            <div className="xl:col-span-2 min-w-0">{d.perms.monitor && <TrendCard state={tr} range={range} onRange={setRange} />}</div>
            <div className="min-w-0">{d.perms.monitor && <TopNodes rows={(d.topNodes || []).filter((n) => !pid || n.providerId === pid)} />}</div>
          </div>
          <PlatformTable rows={rows} perms={d.perms} />
          {(d.perms.alert || d.perms.analytics) && (
            <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
              {d.perms.alert && <RecentAlerts rows={(d.recentAlerts || []).filter((a) => !pid || a.providerId === pid)} />}
              {d.perms.analytics && <Suggestions rows={d.suggestions} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
