/**
 * 权限码字典（功能权限树：菜单级 + 按钮级）。
 * 说明：这是「字典」，用于角色配置页渲染复选框树；
 * 菜单可见性与用户实际权限一律以后端 /auth/me 返回为准，前端不硬编码。
 */
export const PERMISSION_MODULES = [
  { code: 'dashboard', name: '平台概览', menu: 'dashboard:view', buttons: [] },
  {
    code: 'provider', name: '平台管理', menu: 'provider:view',
    buttons: [
      { code: 'provider:create', name: '新增平台' },
      { code: 'provider:update', name: '编辑平台' },
      { code: 'provider:delete', name: '删除平台' },
      { code: 'provider:verify', name: '验证连接' },
      { code: 'provider:sync', name: '立即同步' },
      { code: 'provider:write_switch', name: '切换写操作开关' },
      { code: 'provider:export', name: '导出' },
    ],
  },
  {
    code: 'user', name: '用户管理', menu: 'user:view',
    buttons: [
      { code: 'user:create', name: '新增用户' },
      { code: 'user:update', name: '编辑用户' },
      { code: 'user:toggle', name: '启用/禁用' },
      { code: 'user:unlock', name: '解锁' },
      { code: 'user:delete', name: '删除用户' },
      { code: 'user:reset_password', name: '重置密码' },
      { code: 'user:export', name: '导出' },
    ],
  },
  {
    code: 'role', name: '角色管理', menu: 'role:view',
    buttons: [
      { code: 'role:create', name: '新增角色' },
      { code: 'role:update', name: '编辑角色' },
      { code: 'role:delete', name: '删除角色' },
    ],
  },
  {
    code: 'audit', name: '审计日志', menu: 'audit:view',
    buttons: [
      { code: 'audit:export', name: '导出' },
      { code: 'audit:clean', name: '清理日志' },
    ],
  },
  {
    code: 'domain', name: '域名配置', menu: 'domain:view',
    buttons: [
      { code: 'domain:update', name: '保存配置' },
      { code: 'domain:verify', name: '校验' },
    ],
  },
  {
    code: 'settings', name: '系统配置', menu: 'settings:view',
    buttons: [{ code: 'settings:update', name: '保存配置' }],
  },
  { code: 'resource', name: '统一资源视图', menu: 'resource:view', buttons: [] },
  { code: 'inspection', name: '自动化巡检', menu: 'inspection:view', buttons: [{ code: 'inspection:run', name: '发起巡检' }, { code: 'inspection:export', name: '导出报告' }, { code: 'inspection:config', name: '巡检设置' }, { code: 'inspection:delete', name: '删除报告' }] },
  { code: 'monitor', name: '监控中心', menu: 'monitor:view', buttons: [{ code: 'monitor:collect', name: '立即采集' }] },
  { code: 'capacity', name: '资产管理', menu: 'capacity:view', buttons: [{ code: 'capacity:collect', name: '立即采集' }] },
  {
    code: 'alert', name: '告警中心', menu: 'alert:view',
    buttons: [
      { code: 'alert:ack', name: '确认告警' },
      { code: 'alert:sync', name: '立即同步' },
      { code: 'alert:export', name: '导出' },
    ],
  },
  { code: 'topology', name: '资源拓扑', menu: 'topology:view', buttons: [] },
  { code: 'analytics', name: '运营分析', menu: 'analytics:view', buttons: [{ code: 'analytics:ignore', name: '忽略建议' }, { code: 'analytics:policy_update', name: '修改优化策略' }, { code: 'analytics:export', name: '导出' }] },
];

export const ALL_PERMISSION_CODES = PERMISSION_MODULES.flatMap((m) => [m.menu, ...m.buttons.map((b) => b.code)]);
