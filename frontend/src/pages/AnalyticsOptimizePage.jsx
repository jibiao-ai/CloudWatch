import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import AnalyticsShell from '../components/analytics/Shell';
import OptimizeTable from '../components/analytics/OptimizeTable';
import { useCan } from '../hooks/useCan';

const KINDS = ['downgrade', 'upgrade', 'recycle'];

/** AnalyticsOptimizePage —— 运营分析 · 云主机优化：布局同资产管理，升配 / 降配 / 回收各一个页签（带建议数量），可忽略 / 取消忽略 */
export default function AnalyticsOptimizePage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const canPolicy = useCan('analytics:policy_update');
  const kind = KINDS.includes(sp.get('kind')) ? sp.get('kind') : 'downgrade';
  return (
    <AnalyticsShell title="运营分析 · 云主机优化" description="按优化策略对云主机的 CPU / 内存使用率与运行状态分析后给出的优化建议；使用率类策略需积累满统计周期的数据，策略可在「优化策略」中调整"
      tab={kind} onTab={(k) => setSp({ kind: k }, { replace: true })} idPrefix="an-opt"
      actions={canPolicy && <button type="button" className="btn-default" onClick={() => nav(`/analytics/policy?kind=${kind}`)}><Settings size={15} /> 优化策略</button>}
      tabs={(d) => (d.suggestions || []).map((s) => ({ key: s.kind, label: `${s.name}${s.enabled ? '' : '（已停用）'}`, count: s.count }))}>
      {(d, tick, reloadOv) => {
        const cur = (d.suggestions || []).find((s) => s.kind === kind);
        return <OptimizeTable key={kind} kind={kind} kindName={cur?.name} platforms={d.platforms} refreshKey={tick} onChanged={reloadOv} />;
      }}
    </AnalyticsShell>
  );
}
