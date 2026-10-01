import React, { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '../DataTable';
import SearchInput from '../SearchInput';
import CustomSelect from '../CustomSelect';
import { capacityApi } from '../../services/api';
import { useListQuery } from '../../hooks/useListQuery';
import { COLUMNS, PLACEHOLDER, TITLE } from './columns';
import DetailDrawer from './DetailDrawer';

const DEFAULT_SORT = { nodes: 'name', vms: 'name', volumes: 'name', ports: 'name', pools: 'poolName' };

/**
 * ResourceTab —— 容量管理单类资源列表：全部平台聚合；服务端搜索 / 状态与平台筛选 / 排序 / 分页（默认 10 条/页，与告警中心一致）
 * 点击行打开详情抽屉（全部字段 + 接口原始 JSON）
 */
export default function ResourceTab({ kind, platforms, refreshKey, onCounted }) {
  const [facets, setFacets] = useState([]);
  const [all, setAll] = useState(0);
  const initSort = { key: DEFAULT_SORT[kind], order: 'asc' };
  const list = useListQuery(`capacity-${kind}`, async (q) => {
    const res = await capacityApi.list(kind, { keyword: q.keyword, providerId: q.providerId, status: q.status, sortKey: q.sort?.key, sortOrder: q.sort?.order, page: q.page, pageSize: q.pageSize });
    setFacets(res.facets || []);
    setAll(res.all || 0);
    onCounted?.(kind, res.all || 0);
    return res;
  }, { page: 1, pageSize: 10, keyword: '', providerId: '', status: '', sort: initSort });
  const { query, setQuery } = list;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  const [detail, setDetail] = useState(null);
  const tableRef = useRef(null);
  const anchor = useCallback(() => {
    const root = tableRef.current;
    const t = root?.querySelector('[data-dt-toolbar]');
    const pg = root?.querySelector('[data-dt-pagination]');
    return { top: t ? t.getBoundingClientRect().top : 0, bottom: pg ? pg.getBoundingClientRect().top : window.innerHeight };
  }, []);
  const filtered = !!(query.keyword || query.providerId || query.status);
  return (
    <div ref={tableRef}>
      <DataTable columns={COLUMNS[kind]} rows={list.rows} rowKey="id" loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
        page={query.page} pageSize={query.pageSize} total={list.total} onPageChange={(p) => setQuery(p, { resetPage: false })} pageSizeOptions={[10, 20, 50, 100]}
        sort={query.sort} onSortChange={(sort) => setQuery({ sort: sort || initSort })} onRowClick={(r) => setDetail({ ...r })}
        toolbar={<>
          <SearchInput value={query.keyword} onChange={(keyword) => setQuery({ keyword })} placeholder={PLACEHOLDER[kind]} width={340} />
          <div className="w-[200px]"><CustomSelect size="sm" clearable placeholder="全部云平台" aria-label="所属云平台" value={query.providerId} onChange={(providerId) => setQuery({ providerId, status: '' })} options={platforms.map((p) => ({ value: p.id, label: p.name }))} /></div>
          <div className="w-[170px]"><CustomSelect size="sm" clearable placeholder="全部状态" aria-label="状态" value={query.status} onChange={(status) => setQuery({ status })} options={facets.map((f) => ({ value: f.value, label: `${f.label}（${f.count}）` }))} /></div>
        </>}
        extra={<span className="text-[13px] text-fg-muted">共 {list.total} 项{list.total !== all ? `（全部 ${all}）` : ''}</span>}
        empty={filtered ? { title: '没有匹配的结果', description: '请调整搜索关键字或筛选条件' } : { title: `暂无${TITLE[kind]}数据`, description: '请点击右上角「立即采集」，或等待后台自动采集；若采集失败请在「总览」查看采集明细' }} />
      <DetailDrawer kind={kind} title={TITLE[kind]} row={detail} anchor={anchor} onClose={() => setDetail(null)} />
    </div>
  );
}
