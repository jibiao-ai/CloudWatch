import React, { useMemo } from 'react';
import DataTable from '../DataTable';
import SearchInput from '../SearchInput';
import CustomSelect from '../CustomSelect';
import { useClientTable } from '../../hooks/useClientTable';

/**
 * MonTable —— 监控中心统一列表：关键字搜索 + 所属云平台筛选 + 列排序 + 分页（10 条/页，页大小选项与告警中心一致）
 * 属性：columns / rows / keyFn(row,i) / placeholder / searchText(row) / filters(额外筛选控件) / filterFn / initialSort / emptyTitle / extra
 *  plat { options, value, onChange }：所属云平台筛选（与资产管理一致，可清除，默认「全部云平台」）；allTotal：全部云平台合计条数（用于「共 N 项（全部 M）」）
 */
export default function MonTable({ columns, rows, keyFn, placeholder = '搜索', searchText, filters, filterFn, initialSort, emptyTitle = '暂无数据', extra, onRowClick, initialKeyword, plat, allTotal }) {
  const keyed = useMemo(() => rows.map((r, i) => ({ ...r, _k: keyFn ? keyFn(r, i) : String(i) })), [rows, keyFn]);
  const t = useClientTable({ rows: keyed, columns, searchText, filter: filterFn, initialSort, initialKeyword });
  const all = allTotal ?? t.all;
  const noMatch = all > 0 && t.total === 0;
  return (
    <DataTable
      columns={columns} rows={t.pageRows} rowKey="_k" page={t.page} pageSize={t.pageSize} total={t.total}
      onPageChange={t.setPage} pageSizeOptions={[10, 20, 50, 100]} sort={t.sort} onSortChange={t.setSort} onRowClick={onRowClick}
      toolbar={<>
        <SearchInput value={t.keyword} onChange={t.setKeyword} placeholder={placeholder} width={340} />
        {plat && <div className="w-[200px]"><CustomSelect size="sm" clearable placeholder="全部云平台" aria-label="所属云平台" value={plat.value} onChange={plat.onChange} options={plat.options} /></div>}
        {filters && filters(t)}
      </>}
      extra={<>{extra}<span className="text-[13px] text-fg-muted">共 {t.total} 项{t.total !== all ? `（全部 ${all}）` : ''}</span></>}
      empty={noMatch ? { title: '没有匹配的结果', description: '请调整搜索关键字或筛选条件' } : { title: emptyTitle, description: '该接口本次未返回数据，可在「采集明细」查看原因' }}
    />
  );
}
