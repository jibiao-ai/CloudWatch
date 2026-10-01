import React from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import Checkbox from './Checkbox';
import Pagination from './Pagination';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';

/**
 * DataTable —— 统一表格（列定义 / 排序 / 分页 / 行选择 / 工具栏插槽 / 导出插槽 / 空态与骨架 / 横向滚动表头吸附）
 * 服务端分页与排序（受控）：
 *  columns[{ key, title, width, align, sortable, sticky:'right', render(row,index) }]
 *  rows / rowKey('id') / loading(首屏骨架) / refreshing(行内 loading 条) / error / onRetry
 *  page / pageSize / total / onPageChange({page,pageSize})
 *  sort {key, order:'asc'|'desc'} / onSortChange(sort)
 *  selectable / selected(keys[]) / onSelectedChange(keys[]) / isRowSelectable(row)
 *  toolbar(左侧节点) / extra(右侧节点，如导出按钮) / empty({icon,title,description,action}) / maxHeight / onRowClick
 */
export default function DataTable({
  columns, rows = [], rowKey = 'id', loading, refreshing, error, onRetry,
  page, pageSize, total = 0, onPageChange, pageSizeOptions,
  sort, onSortChange, selectable, selected = [], onSelectedChange, isRowSelectable = () => true,
  toolbar, extra, empty, maxHeight, onRowClick, selectionBar,
}) {
  const selectableRows = rows.filter(isRowSelectable);
  const allChecked = selectableRows.length > 0 && selectableRows.every((r) => selected.includes(r[rowKey]));
  const someChecked = selectableRows.some((r) => selected.includes(r[rowKey]));
  const toggleAll = (v) => {
    const ids = selectableRows.map((r) => r[rowKey]);
    onSelectedChange(v ? Array.from(new Set([...selected, ...ids])) : selected.filter((k) => !ids.includes(k)));
  };
  const toggleOne = (r, v) => {
    const k = r[rowKey];
    onSelectedChange(v ? [...selected, k] : selected.filter((x) => x !== k));
  };
  const clickSort = (c) => {
    if (!c.sortable || !onSortChange) return;
    if (sort?.key !== c.key) onSortChange({ key: c.key, order: 'asc' });
    else if (sort.order === 'asc') onSortChange({ key: c.key, order: 'desc' });
    else onSortChange(null);
  };
  const minWidth = columns.reduce((s, c) => s + (parseInt(c.width, 10) || 120), selectable ? 44 : 0);

  return (
    <div className="card overflow-hidden">
      {(toolbar || extra) && (
        <div data-dt-toolbar className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 border-b border-line">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">{toolbar}</div>
          <div className="flex flex-wrap items-center gap-2">{extra}</div>
        </div>
      )}
      {selectable && selected.length > 0 && selectionBar && (
        <div className="flex items-center gap-3 px-3 py-2 bg-primary-soft border-b border-line text-[13px]">
          <span className="text-primary-text font-medium">已选 {selected.length} 项</span>
          {selectionBar}
          <button type="button" className="ml-auto text-fg-muted hover:text-fg" onClick={() => onSelectedChange([])}>取消选择</button>
        </div>
      )}
      <div className="relative">
        {refreshing && <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-[2]"><div className="h-full w-1/3 bg-primary animate-[shimmer_1s_infinite]" /></div>}
        {loading ? (
          <Skeleton.Table rows={Math.min(pageSize || 6, 8)} cols={Math.min(columns.length, 7)} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : rows.length === 0 ? (
          <EmptyState {...empty} />
        ) : (
          <div className="overflow-auto sticky-head" style={{ maxHeight }}>
            <table className="w-full border-collapse" style={{ minWidth }}>
              <thead>
                <tr>
                  {selectable && (
                    <th className="th w-11" style={{ width: 44 }}>
                      <Checkbox aria-label="全选当前页" checked={allChecked} indeterminate={!allChecked && someChecked} onChange={toggleAll} />
                    </th>
                  )}
                  {columns.map((c) => {
                    const on = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        style={{ width: c.width, textAlign: c.align }}
                        aria-sort={on ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={`th ${c.sticky === 'right' ? 'sticky right-0 z-[3] shadow-[-6px_0_8px_-6px_rgb(0_0_0/0.15)]' : ''}`}
                      >
                        {c.sortable ? (
                          <button type="button" onClick={() => clickSort(c)} className="inline-flex items-center gap-1 hover:text-fg transition">
                            {c.title}
                            {on ? (sort.order === 'asc' ? <ArrowUp size={12} className="text-primary-text" /> : <ArrowDown size={12} className="text-primary-text" />) : <ChevronsUpDown size={12} className="opacity-50" />}
                          </button>
                        ) : (
                          c.title
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const k = r[rowKey];
                  const sel = selected.includes(k);
                  return (
                    <tr
                      key={k}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                      className={`group transition-colors ${i % 2 ? 'bg-muted/40' : ''} ${sel ? '!bg-primary-soft' : 'hover:bg-hover/70'} ${onRowClick ? 'cursor-pointer' : ''}`}
                    >
                      {selectable && (
                        <td className="td" onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`选择第 ${i + 1} 行`} checked={sel} disabled={!isRowSelectable(r)} onChange={(v) => toggleOne(r, v)} />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} style={{ textAlign: c.align }} className={`td ${c.className || ''} ${c.sticky === 'right' ? `sticky right-0 z-[1] shadow-[-6px_0_8px_-6px_rgb(0_0_0/0.15)] ${sel ? 'bg-card' : 'bg-card'}` : ''}`} onClick={c.sticky === 'right' ? (e) => e.stopPropagation() : undefined}>
                          {c.render ? c.render(r, i) : (r[c.key] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!loading && !error && total > 0 && page != null && <Pagination page={page} pageSize={pageSize} total={total} onChange={onPageChange} pageSizeOptions={pageSizeOptions} />}
    </div>
  );
}
