import React, { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../PageHeader';
import Tabs from '../Tabs';
import StatusDot from '../StatusDot';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import LoadingButton from '../LoadingButton';
import { analyticsApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime, fromNow } from '../../utils/format';

/**
 * AnalyticsShell —— 运营分析各页面的统一外壳，结构与「资产管理」页一致：
 * 页头（标题 / 说明 / 刷新）→ 状态条（采集状态 · 已对接云平台 · 最近采集）→ 页签 → 页签面板。
 * 属性：title / description / tabs[{key,label,count|countKey}] 或 (总览数据) => tabs[] / tab / onTab / idPrefix / actions(页头附加按钮) /
 *       onRefresh(页面自身数据的刷新) / children(ov, tick, reloadOv) —— ov 为总览数据，tick 每次点击刷新自增（子图表据此重新加载），reloadOv 重新拉取总览（忽略建议后刷新页签计数）
 */
export default function AnalyticsShell({ title, description, tabs, tab, onTab, idPrefix, actions, onRefresh, children }) {
  const ov = useAsync(() => analyticsApi.getOverview(), []);
  const [tick, setTick] = useState(0);
  const d = ov.data;
  const reload = useCallback(() => { ov.reload(); onRefresh?.(); setTick((x) => x + 1); }, [ov, onRefresh]);

  const total = d ? d.platforms.length : 0;
  const okN = d ? d.platforms.filter((p) => p.collectedAt && p.ok).length : 0;
  const last = d ? d.platforms.map((p) => p.collectedAt).filter(Boolean).sort().pop() : null;
  const list = typeof tabs === 'function' ? (d ? tabs(d) : []) : tabs;
  const items = list?.map((t) => (t.countKey ? { ...t, count: d ? d.totals[t.countKey] ?? 0 : undefined } : t));

  return (
    <div className="bg-bg">
      <PageHeader title={title} description={description}
        actions={<>
          {actions}
          <LoadingButton icon={RefreshCw} loading={ov.refreshing} onClick={reload}>刷新</LoadingButton>
        </>} />
      {ov.loading ? <Skeleton.Cards count={4} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div> : d && (
        <>
          <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <StatusDot status={!total || !last ? 'unknown' : okN === total ? 'online' : 'warning'} label={!total ? '暂无云平台' : !last ? '尚未采集' : okN === total ? '采集正常' : `${total - okN} 个平台采集异常`} />
            <span className="text-fg-muted">已对接云平台 {total} 个</span>
            <span className="text-fg-muted">最近采集：{last ? `${formatDateTime(last)}（${fromNow(last)}）` : '—'}</span>
            <span className="text-fg-subtle">数据来源：资产管理与监控中心的采集快照</span>
          </div>
          {items && <Tabs items={items} value={tab} onChange={onTab} className="mb-4" idPrefix={idPrefix} />}
          <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={items ? `${idPrefix}-${tab}` : undefined} className="space-y-4">
            {children(d, tick, ov.reload)}
          </div>
        </>
      )}
    </div>
  );
}
