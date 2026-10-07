/**
 * 菜单权限树（模拟后端 /auth/me 返回）。
 * 前端 Sidebar 只渲染此处返回的菜单，并再用 hasPermission 过滤；planned=true 表示模块尚在规划，页面为占位。
 */
const TREE = [
  { code: 'overview', name: '平台概览', icon: 'LayoutDashboard', children: [{ code: 'dashboard', name: '平台概览', path: '/dashboard', permission: 'dashboard:view', icon: 'Gauge' }] },
  // 「统一资源管理 / 统一资源视图」暂时隐藏（尚无真实功能），恢复时取消注释：
  //   { code: 'resource-mgmt', name: '统一资源管理', icon: 'Boxes', children: [{ code: 'resource-mgmt-home', name: '资源纳管', path: '/planned/resource-mgmt', permission: 'resource:view', icon: 'Boxes', planned: true }] },
  //   { code: 'resource-view', name: '统一资源视图', icon: 'LayoutList', children: [{ code: 'resource-view-home', name: '资源总览', path: '/planned/resource-view', permission: 'resource:view', icon: 'LayoutList', planned: true }] },
  { code: 'monitor', name: '监控中心', icon: 'Activity', children: [{ code: 'monitor-home', name: '监控总览', path: '/monitor', permission: 'monitor:view', icon: 'Activity' }] },
  { code: 'capacity', name: '配置中心', icon: 'Database', children: [{ code: 'capacity-home', name: '配置总览', path: '/capacity', permission: 'capacity:view', icon: 'Database' }] },
  { code: 'topology', name: '资源拓扑', icon: 'Network', children: [{ code: 'topology-home', name: '全链路拓扑', path: '/topology', permission: 'topology:view', icon: 'Network' }] },
  { code: 'analytics', name: '运营中心', icon: 'ChartPie', children: [{ code: 'analytics-home', name: '运营总览', path: '/analytics', permission: 'analytics:view', icon: 'ChartPie' }] },
  { code: 'alert', name: '告警中心', icon: 'BellRing', children: [{ code: 'alert-home', name: '告警列表', path: '/alerts', permission: 'alert:view', icon: 'BellRing' }] },
  { code: 'inspection', name: '自动巡检', icon: 'ClipboardCheck', children: [{ code: 'inspection-home', name: '巡检报告', path: '/inspection', permission: 'inspection:view', icon: 'ClipboardCheck' }] },
  { code: 'provider', name: '平台管理', icon: 'Server', children: [{ code: 'provider-home', name: '平台管理', path: '/system/providers', permission: 'provider:view', icon: 'Server' }] },
  { code: 'user', name: '用户管理', icon: 'Users', children: [{ code: 'user-home', name: '用户管理', path: '/system/users', permission: 'user:view', icon: 'Users' }] },
  { code: 'role', name: '角色管理', icon: 'ShieldCheck', children: [{ code: 'role-home', name: '角色管理', path: '/system/roles', permission: 'role:view', icon: 'ShieldCheck' }] },
  { code: 'audit', name: '审计日志', icon: 'ScrollText', children: [{ code: 'audit-home', name: '审计日志', path: '/system/audit', permission: 'audit:view', icon: 'ScrollText' }] },
  { code: 'domain', name: '域名配置', icon: 'Globe', children: [{ code: 'domain-home', name: '域名配置', path: '/system/domain', permission: 'domain:view', icon: 'Globe' }] },
  { code: 'settings', name: '系统配置', icon: 'SlidersHorizontal', children: [{ code: 'settings-home', name: '系统配置', path: '/system/settings', permission: 'settings:view', icon: 'SlidersHorizontal' }] },
];

export function buildMenus(perms) {
  const can = (c) => perms.includes('*') || perms.includes(c);
  return TREE.map((g) => ({ ...g, children: g.children.filter((i) => can(i.permission)) })).filter((g) => g.children.length);
}
