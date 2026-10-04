import React, { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import LoadingButton from '../components/LoadingButton';
import Overview from '../components/topology/Overview';
import PlatformView from '../components/topology/PlatformView';
import { topologyApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';

/** TopologyPage —— 资源拓扑：全局总览（各云平台） → 平台拓扑（物理 / 计算 / 实例 / 挂载 / 后端分层）→ 节点详情 → 资产详情。
 *  聚合 平台管理（平台与验证状态）、配置中心（资源与关系）、监控中心（CPU / 内存使用率）、告警中心（未恢复告警）。 */
export default function TopologyPage() {
  const ov = useAsync(() => topologyApi.getOverview(), []);
  const [pid, setPid] = useState(null);
  const platforms = (ov.data || []).map((i) => i.platform);
  const open = useCallback((id) => setPid(id), []);
  return (
    <div className="bg-bg">
      <PageHeader title="资源拓扑" description="结合平台管理、配置中心、监控中心与告警中心，分层展示云平台 → 物理节点 → 计算节点 → 虚拟机 → 云硬盘 / 虚拟网卡 → 存储 / 网络的资源关系与健康状态"
        actions={!pid && <LoadingButton icon={RefreshCw} loading={ov.refreshing} onClick={ov.reload}>刷新</LoadingButton>} />
      {ov.loading ? <Skeleton.Cards count={4} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div>
        : pid ? <PlatformView key={pid} providerId={pid} platforms={platforms} onSwitch={setPid} onBack={() => { setPid(null); ov.reload(); }} />
          : <Overview items={ov.data || []} onOpen={open} />}
    </div>
  );
}
