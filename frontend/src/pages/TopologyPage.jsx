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

/** TopologyPage —— 资源拓扑：全局总览（跨平台热力图）→ 平台拓扑（宿主机热力 → 虚拟机关系）→ 节点详情 → 资产详情。
 *  聚合 平台管理（平台与验证状态）、配置中心（资源与关系）、监控中心（CPU / 内存使用率，仅展示数值）。 */
export default function TopologyPage() {
  const ov = useAsync(() => topologyApi.getOverview(), []);
  const [pid, setPid] = useState(null);
  const [host, setHost] = useState(null);
  const platforms = (ov.data || []).map((i) => i.platform);
  const open = useCallback((id, hostId) => { setHost(hostId || null); setPid(id); }, []);
  return (
    <div className="bg-bg">
      <PageHeader title="资源拓扑" description="结合平台管理、配置中心与监控中心，以宿主机热力图呈现资源状态分布，异常优先；可下钻到宿主机与虚拟机，按选中对象反向高亮其存储 / 网络关系，并治理未挂载云硬盘"
        actions={!pid && <LoadingButton icon={RefreshCw} loading={ov.refreshing} onClick={ov.reload}>刷新</LoadingButton>} />
      {ov.loading ? <Skeleton.Cards count={4} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div>
        : pid ? <PlatformView key={pid} providerId={pid} initialHost={host} platforms={platforms} onSwitch={(id) => open(id)} onBack={() => { setPid(null); setHost(null); ov.reload(); }} />
          : <Overview items={ov.data || []} onOpen={open} />}
    </div>
  );
}
