import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { getChartPalette } from '../utils/theme';

/** 图表色板：随主题 / 主色变化重新计算 */
export function useChartPalette() {
  const theme = useStore((s) => s.theme);
  const primary = useStore((s) => s.brand.primaryColor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getChartPalette(theme === 'dark'), [theme, primary]);
}
