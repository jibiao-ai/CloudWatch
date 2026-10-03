import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

/**
 * useListQuery(key, fetcher, initial, override) —— 列表页统一查询
 *  - 筛选/分页/排序存入 store（按 key），返回列表页时保持一致
 *  - 首次加载 loading（骨架），之后 refreshing（行内 loading）
 *  - override：来自 URL 的预填（如全局搜索跳转的 keyword / providerId）；非空值覆盖已保存的筛选并回到第 1 页，URL 变化时再次生效
 *  - 返回 { query, setQuery(patch, {resetPage}), rows, total, loading, refreshing, error, reload }
 */
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ''));

export function useListQuery(key, fetcher, initial, override) {
  const saved = useStore((s) => s.listState[key]);
  const setSaved = useStore((s) => s.setListState);
  const ov = clean(override);
  const ovSig = JSON.stringify(ov);
  const [query, setQ] = useState(() => ({ ...initial, ...(saved || {}), ...(ovSig !== '{}' ? { ...ov, page: 1 } : {}) }));
  const [state, setState] = useState({ rows: [], total: 0, loading: true, refreshing: false, error: null, loaded: false });
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const setQuery = useCallback((patch, { resetPage = true } = {}) => {
    setQ((q) => {
      const next = { ...q, ...patch };
      if (resetPage && !('page' in patch)) next.page = 1;
      return next;
    });
  }, []);

  const firstOv = useRef(true);
  useEffect(() => {
    if (firstOv.current) { firstOv.current = false; return; }
    if (ovSig !== '{}') setQ((q) => ({ ...q, ...JSON.parse(ovSig), page: 1 }));
  }, [ovSig]);

  useEffect(() => {
    setSaved(key, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: !s.loaded, refreshing: s.loaded, error: null }));
    try {
      const res = await fetchRef.current(query);
      if (id !== seq.current) return;
      setState({ rows: res.list || [], total: res.total ?? 0, loading: false, refreshing: false, error: null, loaded: true });
    } catch (e) {
      if (id !== seq.current) return;
      setState((s) => ({ ...s, loading: false, refreshing: false, error: e }));
    }
  }, [query]);

  useEffect(() => {
    load();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  return useMemo(() => ({ query, setQuery, ...state, reload: load }), [query, setQuery, state, load]);
}
