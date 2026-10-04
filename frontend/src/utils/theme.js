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
  const onPrimary = luminance(rgb) > 0.6 ? '20 20 24' : '255 255 255';
  root.setProperty('--c-on-primary', onPrimary);
  // 缓存已派生好的主色变量：下次刷新时由 index.html 内联脚本在首屏绘制前同步写入，避免先闪默认红色
  try {
    localStorage.setItem(BRAND_CSS_KEY, JSON.stringify({
      theme: isDark ? 'dark' : 'light',
      vars: { '--c-primary': trip(rgb), '--c-primary-hover': trip(hover), '--c-primary-text': trip(text), '--c-on-primary': onPrimary },
    }));
  } catch { /* ignore */ }
  applyFavicon(rgb, onPrimary);
}

export const BRAND_CSS_KEY = 'cw_brand_css';
export const BRAND_KEY = 'cw_brand';

/* ---------------- 浏览器标签页图标（跟随主色） ---------------- */
const FAV_KEY = 'cw_fav';
let favLogo = '';

/** 按主色生成与 Logo 同款的 SVG 图标（data URI），底色=主色，线条=按钮上文字色 */
export function buildFaviconDataUri(rgb, onPrimary) {
  const bg = `rgb(${rgb.join(',')})`;
  const ink = `rgb(${String(onPrimary).split(' ').join(',')})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`
    + `<rect width="64" height="64" rx="16" fill="${bg}"/>`
    + `<path d="M6 32C13 20 22 14 32 14s19 6 26 18c-7 12-16 18-26 18S13 44 6 32z" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round"/>`
    + `<circle cx="32" cy="32" r="11.5" fill="none" stroke="${ink}" stroke-width="2.6"/>`
    + `<path d="M32 32V24.5M32 32l5.6 3.2" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>`
    + `<circle cx="32" cy="32" r="2.2" fill="${ink}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function writeFavicon(href, type) {
  if (typeof document === 'undefined') return;
  let link = document.getElementById('app-favicon');
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) {
    // 部分浏览器只在替换节点时才刷新标签页图标
    const next = link.cloneNode();
    next.setAttribute('href', href);
    if (type) next.setAttribute('type', type); else next.removeAttribute('type');
    link.replaceWith(next);
  }
}

/** 同步标签页图标：配置了自定义 Logo 时用 Logo，否则按主色生成 */
export function applyFavicon(rgb, onPrimary) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify({ rgb, onPrimary })); } catch { /* ignore */ }
  if (favLogo) { writeFavicon(favLogo, ''); return; }
  writeFavicon(buildFaviconDataUri(rgb, onPrimary), 'image/svg+xml');
}

/** 自定义 Logo 变化时调用；传空串恢复为主色图标 */
export function setFaviconLogo(url) {
  favLogo = url || '';
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); } catch { /* ignore */ }
  const rgb = cached?.rgb || hexToRgb(DEFAULT_PRIMARY);
  applyFavicon(rgb, cached?.onPrimary || '255 255 255');
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
    inverse: cssRgb('text-inverse'),
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
