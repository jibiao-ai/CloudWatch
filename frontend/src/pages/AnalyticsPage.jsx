import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnalyticsShell from '../components/analytics/Shell';
import HomeTab from '../components/analytics/tabs/HomeTab';
import BaseTab from '../components/analytics/tabs/BaseTab';
import VMTab from '../components/analytics/tabs/VMTab';
import DiskTab from '../components/analytics/tabs/DiskTab';
import OptimizeTab from '../components/analytics/tabs/OptimizeTab';
import PolicyTab from '../components/analytics/tabs/PolicyTab';
import TabExport from '../components/analytics/TabExport';
import { useCan } from '../hooks/useCan';

const TABS = [
  { key: 'home', label: '总览' },
  { key: 'base', label: '资源分析' },
  { key: 'vm', label: '云主机分析' },
  { key: 'disk', label: '磁盘分析' },
  { key: 'optimize', label: '优化建议' },
  { key: 'policy', label: '优化策略' },
];

/** 页头「全局搜索」在各页签的搜索范围提示 */
const SEARCH = {
  home: '搜索云平台名称 / 控制台 IP',
  base: '搜索云平台 / 计算节点 / 集群存储',
  vm: '搜索云平台 / 计算节点',
  disk: '搜索云平台',
  optimize: '搜索资源名称 / IP / 云平台 / 策略',
  policy: '搜索策略名称 / 条件 / 范围',
};

/**
 * AnalyticsPage —— 运营中心（总览 / 资源分析 / 云主机分析 / 磁盘分析 / 优化建议 / 优化策略）：
 * 与「配置中心」一致，只占一个菜单项，各功能是同一页面内的页签；页签与优化类型同步到地址栏（?tab= &kind=），便于刷新与分享
 */
export default function AnalyticsPage() {
  const [sp, setSp] = useSearchParams();
  const canPolicy = useCan('analytics:policy_update');
  const tab = TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'home';
  const kind = sp.get('kind') || '';
  const side = sp.get('side') || '';
  const go = useCallback((next) => setSp(next, { replace: true }), [setSp]);
  const openPolicy = sp.get('open');

  return (
    <AnalyticsShell title="运营中心" description="汇总全部所属云平台下的云主机、磁盘、计算节点与集群存储：资源分配率 / 使用率、分布与趋势、虚拟机侧与物理侧优化建议及优化策略；明细请到监控中心（虚拟机 / 计算节点 / 集群存储）与配置中心查看，数据来自采集快照，使用率与趋势随时间持续积累"
      tabs={TABS} tab={tab} onTab={(k) => go(k === 'home' ? {} : { tab: k })} idPrefix="an"
      actions={tab === 'home' ? <TabExport kind="home" title="总览" /> : undefined}
      searchPlaceholder={SEARCH[tab]}>
      {(d, tick, reloadOv, kw, clearKw) => {
        switch (tab) {
          case 'base': return <BaseTab tick={tick} keyword={kw} onClearKeyword={clearKw} />;
          case 'vm': return <VMTab tick={tick} keyword={kw} onClearKeyword={clearKw} />;
          case 'disk': return <DiskTab tick={tick} keyword={kw} onClearKeyword={clearKw} />;
          case 'optimize': return <OptimizeTab d={d} tick={tick} reloadOv={reloadOv} kind={kind} side={side} keyword={kw}
            onSelect={(s, k) => go(k ? { tab: 'optimize', kind: k } : { tab: 'optimize', side: s })} onPolicy={canPolicy ? (k) => go({ tab: 'policy', open: k }) : undefined} />;
          case 'policy': return <PolicyTab tick={tick} keyword={kw} openKind={openPolicy} onOpened={() => go({ tab: 'policy' })} onSaved={reloadOv} />;
          default: return <HomeTab d={d} tick={tick} keyword={kw} onOpt={(k) => go({ tab: 'optimize', kind: k })} />;
        }
      }}
    </AnalyticsShell>
  );
}
