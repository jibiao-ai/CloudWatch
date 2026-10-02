import React, { useCallback, useState } from 'react';
import { RefreshCw, Play } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import StatusDot from '../components/StatusDot';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import LoadingButton from '../components/LoadingButton';
import OverviewTab from '../components/capacity/OverviewTab';
import ResourceTab from '../components/capacity/ResourceTab';
import StepsPanel from '../components/capacity/StepsPanel';
import { KINDS } from '../components/capacity/capUtil';
import { capacityApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { formatDateTime, fromNow } from '../utils/format';

/** CapacityPage —— 资产管理（总览 / 物理节点 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 集群存储 / 采集明细）：聚合全部已对接云平台，数据来自第 6 章 Nova / Cinder / Neutron 接口 */
export default function CapacityPage() {
  const toast = useToast();
  const canCollect = useCan('capacity:collect');
  const ov = useAsync(() => capacityApi.getOverview(), []);
  const [tab, setTab] = useState('overview');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const d = ov.data;
  const reload = useCallback(() => { ov.reload(); setTick((x) => x + 1); }, [ov]);

  const collect = async () => {
    setBusy(true);
    try {
      const res = await capacityApi.collect();
      const bad = res.filter((r) => r.fail || (r.error && !r.ok));
      if (bad.length) toast.error('部分平台采集失败', bad.map((b) => b.fail || b.error).join('；').slice(0, 200));
      else toast.success('采集完成', `已采集 ${res.length} 个云平台的资产数据`);
      reload();
    } catch (e) { toast.error('采集失败', e.message); } finally { setBusy(false); }
  };

  const total = d ? d.platforms.length : 0;
  const okN = d ? d.platforms.filter((p) => p.collectedAt && p.ok).length : 0;
  const last = d ? d.platforms.map((p) => p.collectedAt).filter(Boolean).sort().pop() : null;
  const tabs = [{ key: 'overview', label: '总览' }, ...KINDS.map((k) => ({ key: k.key, label: k.label, count: d ? d.totals[k.count] : undefined })), { key: 'steps', label: '采集明细' }];

  return (
    <div className="bg-bg">
      <PageHeader title="资产管理" description="汇聚全部已对接云平台的物理节点、计算节点、虚拟机、云硬盘、虚拟网卡与集群存储；对接 Coaster / Nova / Cinder / Neutron 接口，后台周期采集并落库"
        actions={<>
          <LoadingButton icon={RefreshCw} loading={ov.refreshing} onClick={reload}>刷新</LoadingButton>
          {canCollect && <LoadingButton variant="primary" icon={Play} loading={busy} onClick={collect}>立即采集</LoadingButton>}
        </>} />
      {ov.loading ? <Skeleton.Cards count={4} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div> : d && (
        <>
          <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <StatusDot status={!total || !last ? 'unknown' : okN === total ? 'online' : 'warning'} label={!total ? '暂无云平台' : !last ? '尚未采集' : okN === total ? '采集正常' : `${total - okN} 个平台采集异常`} />
            <span className="text-fg-muted">已对接云平台 {total} 个</span>
            <span className="text-fg-muted">最近采集：{last ? `${formatDateTime(last)}（${fromNow(last)}）` : '—'}</span>
          </div>
          <Tabs items={tabs} value={tab} onChange={setTab} className="mb-4" idPrefix="cap" />
          <div id="cap-panel" role="tabpanel" aria-labelledby={`cap-${tab}`}>
            {tab === 'overview' ? <OverviewTab ov={d} onJump={setTab} /> : tab === 'steps' ? <StepsPanel platforms={d.platforms} /> : <ResourceTab key={tab} kind={tab} platforms={d.platforms} refreshKey={tick} />}
          </div>
        </>
      )}
    </div>
  );
}
