import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import AnalyticsShell from '../components/analytics/Shell';
import HomeTab from '../components/analytics/tabs/HomeTab';
import BaseTab from '../components/analytics/tabs/BaseTab';
import VMTab from '../components/analytics/tabs/VMTab';
import DiskTab from '../components/analytics/tabs/DiskTab';
import OptimizeTab from '../components/analytics/tabs/OptimizeTab';
import PolicyTab from '../components/analytics/tabs/PolicyTab';
import { useCan } from '../hooks/useCan';

const TABS = [
  { key: 'home', label: '总览' },
  { key: 'base', label: '资源分析' },
  { key: 'vm', label: '云主机分析' },
  { key: 'disk', label: '磁盘分析' },
  { key: 'optimize', label: '云主机优化' },
  { key: 'policy', label: '优化策略' },
];
const KINDS = ['zombie', 'excess', 'shortage', 'longoff'];

/**
 * AnalyticsPage —— 运营分析（总览 / 资源分析 / 云主机分析 / 磁盘分析 / 云主机优化 / 优化策略）：
 * 与「资产管理」一致，只占一个菜单项，各功能是同一页面内的页签；页签与优化类型同步到地址栏（?tab= &kind=），便于刷新与分享
 */
export default function AnalyticsPage() {
  const [sp, setSp] = useSearchParams();
  const canPolicy = useCan('analytics:policy_update');
  const tab = TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'home';
  const kind = KINDS.includes(sp.get('kind')) ? sp.get('kind') : 'zombie';
  const go = useCallback((next) => setSp(next, { replace: true }), [setSp]);
  const openPolicy = sp.get('open');

  return (
    <AnalyticsShell title="运营分析" description="汇总全部所属云平台下的云主机、磁盘、宿主机与存储器：资源分配率 / 使用率、分布与趋势、云主机优化建议与优化策略；数据来自资产管理与监控中心的采集快照，使用率与趋势随时间持续积累"
      tabs={TABS} tab={tab} onTab={(k) => go(k === 'home' ? {} : k === 'optimize' ? { tab: k, kind } : { tab: k })} idPrefix="an"
      actions={tab === 'optimize' && canPolicy && <button type="button" className="btn-default" onClick={() => go({ tab: 'policy', open: kind })}><Settings size={15} /> 优化策略</button>}>
      {(d, tick, reloadOv) => {
        switch (tab) {
          case 'base': return <BaseTab d={d} tick={tick} />;
          case 'vm': return <VMTab d={d} tick={tick} />;
          case 'disk': return <DiskTab d={d} tick={tick} />;
          case 'optimize': return <OptimizeTab d={d} tick={tick} reloadOv={reloadOv} kind={kind} onKind={(k) => go({ tab: 'optimize', kind: k })} />;
          case 'policy': return <PolicyTab tick={tick} openKind={openPolicy} onOpened={() => go({ tab: 'policy' })} onSaved={reloadOv} />;
          default: return <HomeTab d={d} tick={tick} onOpt={(k) => go({ tab: 'optimize', kind: k })} />;
        }
      }}
    </AnalyticsShell>
  );
}
