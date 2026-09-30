import { useMemo } from 'react';
import { useStore } from '../store/useStore';

/** 全局消息：toast.success('标题', '描述') / toast.error(...) / warning / info */
export function useToast() {
  const push = useStore((s) => s.pushToast);
  return useMemo(() => {
    const make = (type) => (title, description, opts) => push({ type, title, description, ...opts });
    return { success: make('success'), error: make('error'), warning: make('warning'), info: make('info') };
  }, [push]);
}
