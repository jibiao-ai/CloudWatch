/**
 * 全局单 store（zustand）—— 所有跨页状态集中在此。
 * 分区：auth(user/permissions/dataScopes/menus) / theme / brand / layout / toasts / 各模块列表状态缓存
 * 规则：
 *  - 权限判定统一 hasPermission(code)；页面里禁止出现 role === 'admin' 之类硬编码；
 *  - 数据权限 hasDataScope 只用于 UI 呈现，真正拦截由后端负责；
 *  - logout() 会清空所有状态与缓存。
 */
import { create } from 'zustand';
import { tokenStorage } from '../utils/auth';
import { applyTheme, applyBrandColor, setFaviconLogo, DEFAULT_PRIMARY, BRAND_KEY } from '../utils/theme';

const THEME_KEY = 'cw_theme';
const COLLAPSE_KEY = 'cw_sidebar_collapsed';
const GROUP_KEY = 'cw_sidebar_groups';

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* ignore */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
const readJSON = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};

const DEFAULT_BRAND = { platformName: 'CloudWatch', subtitle: '私有云可观测平台', copyright: '© 2026 CloudWatch', primaryColor: DEFAULT_PRIMARY, logoUrl: '', loginBgUrl: '', captchaEnabled: false, pwdPolicy: {} };
// 上次从服务端拿到的品牌配置（公开信息）：刷新时先用它渲染，避免先显示默认名称/红色再跳变
const cachedBrand = () => {
  const b = readJSON(BRAND_KEY, null);
  return b && typeof b === 'object' ? { ...DEFAULT_BRAND, ...b } : DEFAULT_BRAND;
};
let toastSeq = 0;

const initialModuleState = () => ({
  // 列表页筛选/分页缓存：返回列表时保持一致
  listState: {},
});

export const useStore = create((set, get) => ({
  /* ---------------- auth ---------------- */
  user: null,
  permissions: [],
  dataScopes: [],
  menus: [],
  authReady: false,
  setSession: ({ user, permissions, dataScopes, menus }) =>
    set({ user, permissions: permissions || [], dataScopes: dataScopes || [], menus: menus || [], authReady: true }),
  setUser: (user) => set({ user }),
  setAuthReady: (v) => set({ authReady: v }),
  hasPermission: (code) => {
    if (!code) return true;
    const p = get().permissions;
    return p.includes('*') || p.includes(code);
  },
  hasAnyPermission: (codes = []) => codes.some((c) => get().hasPermission(c)),
  /** 数据权限：仅用于 UI 呈现（隐藏入口/禁用按钮）；deny 优先于 allow；无规则默认允许 */
  hasDataScope: (type, value) => {
    const rules = get().dataScopes.filter((r) => r.type === type);
    if (rules.some((r) => r.effect === 'deny' && (r.value === value || r.value === '*'))) return false;
    const allows = rules.filter((r) => r.effect === 'allow');
    if (!allows.length) return true;
    return allows.some((r) => r.value === value || r.value === '*');
  },
  logout: () => {
    tokenStorage.clear();
    set({ user: null, permissions: [], dataScopes: [], menus: [], authReady: true, toasts: [], ...initialModuleState(), providers: [] });
  },

  /* ---------------- theme ---------------- */
  theme: initialTheme(),
  setTheme: (theme) => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    applyTheme(theme);
    applyBrandColor(get().brand.primaryColor, theme === 'dark');
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  /* ---------------- brand（来自 /api/settings，运行时注入） ---------------- */
  brand: cachedBrand(),
  setBrand: (patch) => {
    const brand = { ...get().brand, ...patch };
    if (patch.logoUrl !== undefined) setFaviconLogo(brand.logoUrl);
    applyBrandColor(brand.primaryColor, get().theme === 'dark');
    try { localStorage.setItem(BRAND_KEY, JSON.stringify(brand)); } catch { /* ignore */ }
    set({ brand });
  },
  /** 仅预览主色（不写入 brand，用于设置页取色即时预览） */
  previewPrimary: (hex) => applyBrandColor(hex, get().theme === 'dark'),

  /* ---------------- layout ---------------- */
  sidebarCollapsed: readJSON(COLLAPSE_KEY, false),
  sidebarGroups: readJSON(GROUP_KEY, {}), // { [groupCode]: true=收起 }
  mobileNavOpen: false,
  toggleSidebar: () => {
    const v = !get().sidebarCollapsed;
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(v));
    set({ sidebarCollapsed: v });
  },
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleGroup: (code) => {
    const g = { ...get().sidebarGroups, [code]: !get().sidebarGroups[code] };
    localStorage.setItem(GROUP_KEY, JSON.stringify(g));
    set({ sidebarGroups: g });
  },
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
  breadcrumbExtra: [],
  setBreadcrumbExtra: (items) => set({ breadcrumbExtra: items || [] }),

  /* ---------------- toast ---------------- */
  toasts: [],
  pushToast: (t) => {
    const id = ++toastSeq;
    const toast = { id, type: 'info', duration: 4000, ...t };
    set((s) => ({ toasts: [...s.toasts, toast].slice(-3) })); // 最多同时 3 条
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  /* ---------------- 平台（写操作开关全站联动） ---------------- */
  providers: [],
  setProviders: (providers) => set({ providers }),
  /** 生产环境写操作是否被关闭：任一被选平台关闭时，创建/删除类按钮全站置灰 */
  writeBlockedReason: () => {
    const off = get().providers.filter((p) => p.envType === 'prod' && !p.writeEnabled);
    return off.length ? `生产平台「${off.map((p) => p.name).join('、')}」的写操作开关已关闭` : '';
  },

  /* ---------------- 列表页状态缓存 ---------------- */
  ...initialModuleState(),
  getListState: (key, fallback) => get().listState[key] || fallback,
  setListState: (key, value) => set((s) => ({ listState: { ...s.listState, [key]: value } })),

  /* ---------------- 告警未读 ---------------- */
  unreadAlerts: 0,
  setUnreadAlerts: (n) => set({ unreadAlerts: n }),
}));

export default useStore;
