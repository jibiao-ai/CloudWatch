/**
 * Mock 种子数据（TODO(mock)：对接真实后端后整体删除本目录，并把 VITE_USE_MOCK 设为 false）
 * 环境信息来自《奇瑞汽金ES云平台相关接口文档》。出于安全，文档中的管理员账号/密码不写入代码库；
 * 文档里 brces.cheryfs,cn 的逗号为笔误，这里按 brces.cheryfs.cn 处理。
 */
import { ALL_PERMISSION_CODES } from '../../data/permissions';

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const provider = (o) => ({
  type: 'openstack',
  arch: 'X86（Intel）',
  nodeCount: 6,
  auth: { username: 'admin', projectName: 'admin', userDomain: 'default', projectDomain: 'default', passwordSet: true },
  advanced: { timeoutSec: 30, syncIntervalMin: 10, remark: '' },
  stats: { vmCount: 0, volumeCount: 0, networkCount: 0 },
  writeEnabled: false,
  status: 'online',
  lastSyncAt: ago(6),
  createdAt: ago(60 * 24 * 300),
  ...o,
});

export const seedProviders = [
  provider({ id: 'p1', name: '开发测试高性能云ES1', envType: 'dev', consoleIp: '192.168.27.150', rootDomain: 'openstack.svc.cluster.local', writeEnabled: true, advanced: { timeoutSec: 30, syncIntervalMin: 10, remark: '' } }),
  provider({ id: 'p2', name: '生产环境高性能云ES1', envType: 'prod', consoleIp: '192.168.47.3', rootDomain: 'secs.cheryfs.cn', writeEnabled: false, status: 'warning', lastSyncAt: ago(3), advanced: { timeoutSec: 30, syncIntervalMin: 5, remark: '生产核心业务集群，默认关闭写操作' } }),
  provider({ id: 'p3', name: '开发测试高性能云ES2', envType: 'dev', consoleIp: '192.168.27.160', rootDomain: 'hdeves.cheryfs.cn', writeEnabled: true, lastSyncAt: ago(9), advanced: { timeoutSec: 30, syncIntervalMin: 10, remark: '' } }),
  provider({ id: 'p4', name: '贵阳灾备集群ES1', envType: 'dr', consoleIp: '10.140.64.3', rootDomain: 'brces.cheryfs.cn', writeEnabled: false, status: 'error', lastSyncAt: ago(185), advanced: { timeoutSec: 30, syncIntervalMin: 15, remark: '' } }),
];

const ALL = ALL_PERMISSION_CODES;
const viewOnly = ALL.filter((c) => c.endsWith(':view') && !['role:view', 'user:view', 'settings:view', 'domain:view'].includes(c));
export const seedRoles = [
  { id: 'r1', name: '超级管理员', code: 'super_admin', description: '拥有全部功能权限与数据权限，内置不可修改', builtin: true, permissions: ['*'], dataScopes: [] },
  { id: 'r2', name: '云平台运维', code: 'cloud_ops', description: '平台管理、资源、巡检、监控、告警的日常运维', builtin: true, permissions: ALL.filter((c) => !c.startsWith('role:') && !c.startsWith('user:') && !c.startsWith('settings:') && c !== 'audit:clean'), dataScopes: [] },
  { id: 'r3', name: '只读观察员', code: 'viewer', description: '只读查看资源与监控数据', builtin: true, permissions: viewOnly, dataScopes: [] },
  { id: 'r4', name: '安全审计员', code: 'auditor', description: '审计日志查看与导出', builtin: true, permissions: ['dashboard:view', 'audit:view', 'audit:export'], dataScopes: [] },
];

const u = (o) => ({ source: 'local', status: 'active', phone: '', failCount: 0, lockedUntil: null, mustChangePassword: false, createdAt: ago(60 * 24 * 200), ...o });
export const seedUsers = [
  u({ id: 'u1', username: 'admin', name: '系统管理员', email: 'admin@cloudwatch.local', department: '云平台部', roleIds: ['r1'], lastLoginAt: ago(20) }),
];
// 演示账号密码（仅 mock 使用，非真实环境凭据）
export const MOCK_PASSWORDS = { admin: 'CloudWatch@2026' };

export const seedSettings = {
  basic: { platformName: 'CloudWatch', subtitle: '私有云可观测平台', copyright: '© 2026 CloudWatch', supportEmail: 'ops@cloudwatch.local' },
  brand: { logoUrl: '', loginBgUrl: '', primaryColor: '#C6242A' },
  security: { minLength: 8, requireUpper: true, requireLower: true, requireDigit: true, requireSpecial: true, expireDays: 90, sessionTimeoutMin: 60, maxSessions: 3, captchaEnabled: false, lockThreshold: 5, lockMinutes: 15 },
  retention: { auditDays: 180, metricDays: 90, inspectionDays: 365, alertDays: 180 },
  alertChannels: [
    { id: 'c1', type: 'email', name: '运维值班邮箱', enabled: true, config: { host: 'smtp.cheryfs.cn', port: 465, username: 'alert@cheryfs.cn', to: 'ops-oncall@cheryfs.cn' }, secretSet: true },
    { id: 'c2', type: 'webhook', name: '企业微信机器人', enabled: false, config: { url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send' }, secretSet: true },
  ],
};

/** 审计日志（确定性生成） */
export function genAudit() {
  const users = seedUsers.slice(0, 1);
  const combos = [
    ['auth', 'login', '用户登录'], ['auth', 'logout', '用户退出'], ['provider', 'verify', '验证连接'], ['provider', 'update', '修改平台'], ['provider', 'create', '新增平台'],
    ['user', 'create', '新增用户'], ['user', 'reset_password', '重置密码'], ['role', 'update', '修改角色权限'], ['domain', 'update', '保存域名配置'], ['settings', 'update', '修改系统配置'], ['audit', 'export', '导出审计日志'], ['provider', 'delete', '删除平台'],
  ];
  const ips = ['192.168.27.31', '192.168.27.45', '10.20.3.18', '192.168.47.9'];
  const out = [];
  for (let i = 0; i < 168; i += 1) {
    const [module, action, label] = combos[(i * 7 + 3) % combos.length];
    const user = users[(i * 3) % users.length];
    const failure = i % 11 === 4;
    out.push({
      id: `a${1000 - i}`,
      time: new Date(Date.now() - i * 47 * 60000 - (i % 5) * 13000).toISOString(),
      operator: user.username,
      operatorName: user.name,
      ip: ips[i % ips.length],
      module,
      action,
      target: module === 'provider' ? seedProviders[i % 4].name : module === 'user' ? seedUsers[0].username : label,
      targetId: module === 'provider' ? seedProviders[i % 4].id : undefined,
      targetLink: module === 'provider' ? '/system/providers' : module === 'user' ? '/system/users' : undefined,
      result: failure ? 'failure' : 'success',
      duration: 30 + ((i * 97) % 1900),
      error: failure ? (action === 'verify' ? 'Keystone 返回 401：The request you have made requires authentication.' : '操作被拒绝：权限不足') : '',
      requestParams: { method: action === 'login' ? 'POST' : 'PUT', path: `/api/${module}`, body: action === 'login' ? { username: user.username, password: 'Sup3r-Secret', captcha: '' } : module === 'provider' ? { name: seedProviders[i % 4].name, auth: { username: 'admin', password: 'Admin-Fake-Pass', projectName: 'admin' }, token: 'gAAAAABkEydBtWTjynG0b5EgGe', secret: 'x-y-z' } : { remark: label } },
    });
  }
  return out;
}
