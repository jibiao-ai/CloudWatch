import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAsync(fn, deps)：统一「加载 / 错误 / 重试」状态。
 * 返回 { data, loading, error, reload }；首次加载 loading=true（用于骨架屏），
 * 后续 reload 为 refreshing（局部行内 loading，不闪骨架）。
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, loading: immediate, refreshing: false, error: null });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, refreshing: s.data != null, loading: s.data == null, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, loading: false, refreshing: false, error: null });
      return data;
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, refreshing: false, error: e }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    return () => {
      seq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}
