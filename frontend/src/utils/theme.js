/**
 * 主题工具（FE-3）
 * ------------------------------------------------------------
 * 硬性规则（写进代码注释，评审时按此检查）：
 *  1. 组件内禁止出现 #fff / #000 / bg-white / text-black / text-gray-900 / gray-100 等硬编码颜色；
 *  2. 禁止用 Tailwind 的 dark: 前缀替代变量 —— 统一走 CSS Variables，保证主色可配置；
 *  3. 图表 stroke/fill/网格/轴 必须来自 getChartPalette()，主题/主色变化后同步刷新；
 *  4. 主色不写死在 tailwind 配置里，运行时通过 applyBrandColor() 写入 :root。
 *  5. 【铁律】禁止毛玻璃：不得使用 glass / backdrop-blur / backdrop-filter / 半透明浮层底色，
 *     弹窗、下拉、菜单、Toast、Tooltip、卡片一律实色 bg-card + border + shadow（.surface / .card-pop）。
 *  6. 【铁律】输入类控件（input / textarea / 自定义下拉触发器 / 搜索框 / 密码框 / 分页跳转框 / Checkbox）
 *     聚焦时禁止彩色高亮（focus:ring、彩色边框、outline），只允许中性色边框变化；所有页面统一走 .field。
 *     （无障碍折中：键盘焦点环仅保留给按钮、链接等非输入控件。）
 */

export const DEFAULT_PRIMARY = '#C6242A';

export const PRESET_COLORS = [
  { name: '云观红', value: '#C6242A' },
  { name: '深海蓝', value: '#1D4ED8' },
  { name: '青碧', value: '#0E8F83' },
  { name: '靛紫', value: '#5B47D6' },
  { name: '琥珀', value: '#C2620A' },
  { name: '石墨', value: '#334155' },
];

export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const isValidHex = (hex) => hexToRgb(hex) !== null;
/** 在任意色块上取可读的前景色（黑/白），用于色板对勾等 */
export const contrastOn = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  return L > 0.5 ? '#000000' : '#FFFFFF';
};

const mix = (rgb, target, t) => rgb.map((v, i) => Math.round(v + (target[i] - v) * t));
const trip = (rgb) => rgb.join(' ');
const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** 将主色写入 :root（浅色/暗色分别派生 hover / 文字色 / 按钮上文字色） */
export function applyBrandColor(hex, isDark) {
  const rgb = hexToRgb(hex) || hexToRgb(DEFAULT_PRIMARY);
  const root = document.documentElement.style;
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];
  // 暗色下的强调文字需要提亮以保证对比度
  const text = isDark ? mix(rgb, WHITE, 0.38) : mix(rgb, BLACK, 0.06);
  const hover = isDark ? mix(rgb, WHITE, 0.14) : mix(rgb, BLACK, 0.14);
  root.setProperty('--c-primary', trip(rgb));
  root.setProperty('--c-primary-hover', trip(hover));
  root.setProperty('--c-primary-text', trip(text));
  root.setProperty('--c-on-primary', luminance(rgb) > 0.6 ? '20 20 24' : '255 255 255');
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

const cssRgb = (name, alpha) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().replace(/\s+/g, ' ');
  return alpha == null ? `rgb(${v})` : `rgb(${v} / ${alpha})`;
};

/** Recharts 色板：读取当前生效的 CSS 变量，主题/主色变化后需重新调用 */
export function getChartPalette(isDark) {
  const primary = cssRgb('primary');
  return {
    isDark,
    grid: cssRgb('border', isDark ? 0.9 : 1),
    axis: cssRgb('text-muted'),
    text: cssRgb('text'),
    tooltipBg: cssRgb('card'),
    tooltipBorder: cssRgb('border-strong'),
    primary,
    series: [primary, cssRgb('info'), cssRgb('success'), cssRgb('warning'), cssRgb('text-subtle'), cssRgb('danger')],
    areaGradient: [cssRgb('primary', 0.35), cssRgb('primary', 0)],
    ok: cssRgb('success'),
    warn: cssRgb('warning'),
    bad: cssRgb('danger'),
  };
}
