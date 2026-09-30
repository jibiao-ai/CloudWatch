import { useStore } from '../store/useStore';
/** 当前是否暗色（统一从 store 取，禁止在组件里读 DOM 判断） */
export const useIsDark = () => useStore((s) => s.theme === 'dark');
