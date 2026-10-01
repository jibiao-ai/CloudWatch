// 字典与集中文案（后续接入 i18n 时以此为入口）
export const ENV_TYPES = [
  { value: 'dev', label: '开发测试' },
  { value: 'prod', label: '生产' },
  { value: 'dr', label: '灾备' },
];
export const ENV_TAG = { dev: 'tag-info', prod: 'tag-danger', dr: 'tag-warning' };

export const PROVIDER_STATUS = {
  online: { label: '在线', tone: 'success' },
  warning: { label: '告警', tone: 'warning' },
  error: { label: '故障', tone: 'danger' },
  unknown: { label: '未知', tone: 'muted' },
};

export const USER_STATUS = {
  active: { label: '正常', tag: 'tag-success' },
  disabled: { label: '已禁用', tag: 'tag-default' },
  locked: { label: '已锁定', tag: 'tag-danger' },
};
export const USER_SOURCES = [
  { value: 'local', label: '本地' },
  { value: 'ldap', label: 'LDAP' },
  { value: 'sso', label: '统一认证' },
];

export const AUDIT_MODULES = [
  { value: 'auth', label: '认证' },
  { value: 'provider', label: '平台管理' },
  { value: 'user', label: '用户管理' },
  { value: 'role', label: '角色管理' },
  { value: 'domain', label: '域名配置' },
  { value: 'settings', label: '系统配置' },
  { value: 'audit', label: '审计日志' },
];
export const AUDIT_ACTIONS = [
  { value: 'login', label: '登录' },
  { value: 'logout', label: '退出' },
  { value: 'create', label: '新增' },
  { value: 'update', label: '修改' },
  { value: 'delete', label: '删除' },
  { value: 'verify', label: '验证' },
  { value: 'sync', label: '同步' },
  { value: 'reset_password', label: '重置密码' },
  { value: 'export', label: '导出' },
  { value: 'clean', label: '清理' },
];
export const AUDIT_RESULTS = [
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
];

/** 平台接入需验证的七个组件；域名固定为 <key>.<根域名>（与后端 provider.Components 一致） */
export const OPENSTACK_COMPONENTS = [
  { key: 'keystone', label: 'Keystone（认证）' },
  { key: 'neutron', label: 'Neutron（网络）' },
  { key: 'nova', label: 'Nova（计算）' },
  { key: 'cinder', label: 'Cinder（块存储）' },
  { key: 'glance', label: 'Glance（镜像）' },
  { key: 'gnocchi', label: 'Gnocchi（时序指标）' },
  { key: 'emla', label: 'EMLA（监控）' },
];
