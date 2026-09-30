// 供 axios 拦截器等非组件代码跳转（由 App 注入 router 的 navigate）
let nav = null;
export const setNavigator = (fn) => {
  nav = fn;
};
export function navigateTo(path, opts) {
  if (nav) nav(path, opts);
  else window.location.assign(path);
}
