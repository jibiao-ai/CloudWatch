import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../PageHeader';
import Tabs from '../Tabs';
import StatusDot from '../StatusDot';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import LoadingButton from '../LoadingButton';
import SearchInput from '../SearchInput';
import { analyticsApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime, fromNow } from '../../utils/format';

/**
 * AnalyticsShell —— 运营中心各页面的统一外壳，结构与「配置中心」页一致：
 * 页头（标题 / 说明 / 刷新）→ 状态条（采集状态 · 已对接云平台 · 最近采集）→ 页签 → 页签面板。
 * 属性：title / description / tabs[{key,label,count|countKey}] 或 (总览数据) => tabs[] / tab / onTab / idPrefix / actions(页头附加按钮) /
 *       onRefresh(页面自身数据的刷新) / children(ov, tick, reloadOv, keyword, clearKeyword) —— ov 为总览数据，tick 每次点击刷新自增（子图表据此重新加载），reloadOv 重新拉取总览（忽略建议后刷新页签计数），
 *       keyword 为刷新按钮右侧「全局搜索」框的关键字（切换页签自动清空，各页签按自身数据解释）
 *       searchPlaceholder 全局搜索框的占位文字（随页签变化；传空则不显示页头搜索框，如「总览」页自带全局搜索卡片）
 */
export default function AnalyticsShell({ title, description, tabs, tab, onTab, idPrefix, actions, onRefresh, searchPlaceholder = '搜索', children }) {
  const ov = useAsync(() => analyticsApi.getOverview(), []);
  const [tick, setTick] = useState(0);
  const [kw, setKw] = useState('');
  useEffect(() => { setKw(''); }, [tab]);
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
          {searchPlaceholder && <SearchInput value={kw} onChange={setKw} placeholder={searchPlaceholder} width={260} aria-label="全局搜索" />}
        </>} />
      {ov.loading ? <Skeleton.Cards count={4} /> : ov.error ? <div className="card"><ErrorState error={ov.error} onRetry={ov.reload} /></div> : d && (
        <>
          <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <StatusDot status={!total || !last ? 'unknown' : okN === total ? 'online' : 'warning'} label={!total ? '暂无云平台' : !last ? '尚未采集' : okN === total ? '采集正常' : `${total - okN} 个平台采集异常`} />
            <span className="text-fg-muted">已对接云平台 {total} 个</span>
            <span className="text-fg-muted">最近采集：{last ? `${formatDateTime(last)}（${fromNow(last)}）` : '—'}</span>
            <span className="text-fg-subtle">数据来源：配置中心与监控中心的采集快照</span>
          </div>
          {items && <Tabs items={items} value={tab} onChange={onTab} className="mb-4" idPrefix={idPrefix} />}
          <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={items ? `${idPrefix}-${tab}` : undefined} className="space-y-4">
            {children(d, tick, ov.reload, kw.trim(), () => setKw(''))}
          </div>
        </>
      )}
    </div>
  );
}
