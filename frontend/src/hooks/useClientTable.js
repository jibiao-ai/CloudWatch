import { useMemo, useState } from 'react';
import { compareBy } from '../utils/monitorUtil';

/**
 * useClientTable —— 前端整表（快照已全量在内存）的关键字搜索 + 排序 + 分页（默认 10 条/页，与告警中心一致）
 *  rows / columns（sortable 列取 sortBy(row) 或 row[key] 排序）/ searchText(row)→可搜索文本 / filter(row)→额外筛选 / initialSort
 */
export function useClientTable({ rows, columns, searchText, filter, initialSort = null, pageSize: ps = 10, initialKeyword = '' }) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [sort, setSort] = useState(initialSort);
  const [pg, setPg] = useState({ page: 1, pageSize: ps });

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return rows.filter((r) => (!filter || filter(r)) && (!k || searchText(r).toLowerCase().includes(k)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keyword, filter]);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    return [...filtered].sort(compareBy(col.sortBy || ((r) => r[col.key]), sort.order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pg.pageSize));
  const page = Math.min(pg.page, pages);
  const pageRows = sorted.slice((page - 1) * pg.pageSize, page * pg.pageSize);
  return {
    keyword, setKeyword: (v) => { setKeyword(v); setPg((p) => ({ ...p, page: 1 })); },
    sort, setSort: (s) => { setSort(s || initialSort); setPg((p) => ({ ...p, page: 1 })); },
    page, pageSize: pg.pageSize, setPage: ({ page: p, pageSize: s }) => setPg({ page: p, pageSize: s }),
    total: sorted.length, all: rows.length, pageRows,
  };
}
