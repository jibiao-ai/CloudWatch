/**
 * 统一 mock 适配器（axios adapter）—— 无后端时使用；VITE_USE_MOCK=false 后整体不参与构建逻辑。
 * TODO(mock)：后端就绪后删除 services/mock 目录与 api.js 里的 USE_MOCK 分支。
 * 数据持久化在 localStorage（cw_mock_db），便于刷新后保持；「重置」清除该 key 即可。
 */
import axios, { AxiosError } from 'axios';
import { seedProviders, seedRoles, seedUsers, seedSettings, genAudit, MOCK_PASSWORDS } from './seed';
import { buildMenus } from './menus';
import { pickPolicy } from '../../utils/validators';
import { dashboardOverview, dashboardTrend } from './dashboard';

const DB_KEY = 'cw_mock_db_v1';
const clone = (o) => JSON.parse(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    providers: clone(seedProviders),
    // 演示环境的凭据仅存在于 mock 内存/localStorage，前端接口永不回显
    providerSecrets: Object.fromEntries(seedProviders.map((p) => [p.id, 'mock-secret'])),
    roles: clone(seedRoles),
    users: clone(seedUsers),
    passwords: { ...MOCK_PASSWORDS },
    settings: clone(seedSettings),
    channelSecrets: { c1: 'mock', c2: 'mock' },
    audits: genAudit(),
    sessions: {},
    tasks: {},
  };
}
let db = loadDb();
const save = () => {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* quota */ }
};
export const resetMock = () => {
  localStorage.removeItem(DB_KEY);
  db = loadDb();
};

/* ---------------- 响应辅助 ---------------- */
class HttpFail extends Error {
  constructor(status, message, data, code) {
    super(message);
    this.status = status;
    this.data = data;
    this.bizCode = code ?? status;
  }
}
const fail = (status, message, data, code) => {
  throw new HttpFail(status, message, data, code);
};

const authFromConfig = (config) => {
  const h = config.headers;
  const v = (h?.get ? h.get('Authorization') : h?.Authorization) || '';
  return v.replace(/^Bearer\s+/i, '');
};

const rolesOf = (user) => db.roles.filter((r) => user.roleIds.includes(r.id));
const permsOf = (user) => {
  const set = new Set();
  rolesOf(user).forEach((r) => r.permissions.forEach((p) => set.add(p)));
  return set.has('*') ? ['*'] : [...set];
};
const isSuper = (user) => rolesOf(user).some((r) => r.permissions.includes('*'));
const publicUser = (u) => {
  const { failCount, ...rest } = u;
  return { ...rest, roleNames: rolesOf(u).map((r) => r.name), failCount };
};
const paginate = (list, q) => {
  const page = Number(q.page) || 1;
  const pageSize = Number(q.pageSize) || 10;
  return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
};
const sortBy = (list, q) => {
  if (!q.sortKey) return list;
  const dir = q.sortOrder === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = a[q.sortKey];
    const y = b[q.sortKey];
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
};

function pushAudit(ctx, module, action, target, { result = 'success', error = '', body, link, targetId } = {}) {
  const u = ctx.user;
  db.audits.unshift({
    id: uid('a'),
    time: new Date().toISOString(),
    operator: u?.username || (body && body.username) || 'anonymous',
    operatorName: u?.name || '',
    ip: '192.168.27.31',
    module, action, target, targetId, targetLink: link,
    result, duration: 20 + Math.floor(Math.random() * 300), error,
    requestParams: { method: ctx.method.toUpperCase(), path: `/api${ctx.path}`, body: body || {} },
  });
}

/* ---------------- 验证连接（纯 mock 模式的演示实现；混合 / 真实模式走后端真实探测） ---------------- */
const MOCK_COMPS = [['keystone', 'Keystone（认证）'], ['neutron', 'Neutron（网络）'], ['nova', 'Nova（计算）'], ['cinder', 'Cinder（块存储）'], ['glance', 'Glance（镜像）'], ['gnocchi', 'Gnocchi（时序指标）'], ['coaster', 'Coaster（物理节点）'], ['emla', 'EMLA（监控）']];
function verifyDraft(d, hasSavedSecret) {
  const t0 = 40 + Math.floor(Math.random() * 80);
  const unreachable = /^10\.140\./.test(d.consoleIp || '') || /fail|down/.test(d.rootDomain || '');
  const pw = d.auth?.password;
  const tokenOk = !unreachable && !!d.auth?.username && (pw ? pw.length >= 4 : hasSavedSecret);
  const items = [{
    key: 'token', label: 'Keystone 认证 Token', host: `keystone.${d.rootDomain}`, ok: tokenOk, latencyMs: t0 + 40,
    message: tokenOk ? '已获取 Token' : '',
    error: tokenOk ? '' : unreachable ? 'Keystone 域名不可达，无法获取 Token' : 'Keystone 返回 HTTP 401：The request you have made requires authentication.',
  }];
  MOCK_COMPS.forEach(([key, label], i) => {
    const ok = !unreachable;
    items.push({ key, label, host: `${key}.${d.rootDomain}`, ok, latencyMs: ok ? t0 + i * 13 : 0, message: ok ? 'HTTP 可达，HTTP 200' : '', error: ok ? '' : `HTTP 连接失败：dial tcp ${d.consoleIp}:80: i/o timeout` });
  });
  const status = !tokenOk ? 'error' : items.every((x) => x.ok) ? 'online' : 'warning';
  return {
    ok: status === 'online', status, at: new Date().toISOString(), items,
    token: tokenOk ? { user: d.auth?.username, expiresAt: new Date(Date.now() + 6 * 3600e3).toISOString(), roles: ['admin'], project: d.auth?.projectName || 'admin' } : null,
  };
}

const sanitizeProvider = (p) => ({ ...p, auth: { ...p.auth, password: undefined, passwordSet: !!db.providerSecrets[p.id] } });

/* ---------------- 路由表 ---------------- */
const routes = [];
const on = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, ...opts });

/* -- 认证 -- */
const captchas = {};
const loginFails = {}; // username -> count
on('get', '/auth/captcha', () => {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const id = uid('cap');
  captchas[id] = code;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="36"><rect width="110" height="36" fill="#eee"/><text x="14" y="26" font-size="22" font-family="monospace" font-weight="700" letter-spacing="6" fill="#444">${code}</text><path d="M0 12 Q30 30 60 14 T110 22" stroke="#999" fill="none"/></svg>`;
  return { id, image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}, { public: true });

on('post', '/auth/login', ({ body, ctx }) => {
  const { username = '', password = '', captcha, captchaId } = body;
  const fails = loginFails[username] || 0;
  const sec = db.settings.security;
  const needCaptcha = !!sec.captchaEnabled;
  if (needCaptcha && (!captcha || captchas[captchaId] !== String(captcha))) {
    fail(401, captcha ? '验证码错误' : '请输入验证码', { captchaRequired: true }, 40101);
  }
  const user = db.users.find((u) => u.username === username);
  if (user?.status === 'disabled') fail(403, '账号已被禁用，请联系管理员');
  if (user && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
    fail(423, `账号已被锁定，请 ${mins} 分钟后重试`, { remainMinutes: mins });
  }
  if (!user || db.passwords[username] !== password) {
    loginFails[username] = fails + 1;
    if (user) {
      user.failCount = (user.failCount || 0) + 1;
      if (user.failCount >= sec.lockThreshold) {
        user.status = 'locked';
        user.lockedUntil = new Date(Date.now() + sec.lockMinutes * 60000).toISOString();
      }
    }
    if ((loginFails[username] || 0) >= 20) fail(429, '尝试过于频繁，请稍后再试');
    pushAudit({ ...ctx, user: null }, 'auth', 'login', username, { result: 'failure', error: '账号或密码错误', body: { username, password, captcha } });
    save();
    fail(401, '账号或密码错误', { captchaRequired: !!sec.captchaEnabled }, 40100);
  }
  loginFails[username] = 0;
  user.failCount = 0;
  user.lockedUntil = null;
  if (user.status === 'locked') user.status = 'active';
  user.lastLoginAt = new Date().toISOString();
  const access = `mock.${user.id}.${Date.now()}`;
  const refresh = `mockr.${user.id}.${Date.now()}`;
  db.sessions[access] = user.id;
  db.sessions[refresh] = user.id;
  pushAudit({ ...ctx, user }, 'auth', 'login', username, { body: { username, password } });
  save();
  return { accessToken: access, refreshToken: refresh, mustChangePassword: !!user.mustChangePassword };
}, { public: true });

on('post', '/auth/refresh', ({ body }) => {
  const uidv = db.sessions[body.refreshToken];
  if (!uidv) fail(401, '登录已过期');
  const access = `mock.${uidv}.${Date.now()}`;
  db.sessions[access] = uidv;
  return { accessToken: access, refreshToken: body.refreshToken };
}, { public: true });

on('post', '/auth/logout', ({ ctx }) => {
  if (ctx.user) pushAudit(ctx, 'auth', 'logout', ctx.user.username);
  save();
  return null;
});

on('get', '/auth/me', ({ ctx }) => {
  const u = ctx.user;
  const permissions = permsOf(u);
  return {
    user: publicUser(u),
    permissions,
    dataScopes: rolesOf(u).flatMap((r) => r.dataScopes),
    menus: buildMenus(permissions),
  };
});

on('post', '/auth/change-password', ({ body, ctx }) => {
  const u = ctx.user;
  if (db.passwords[u.username] !== body.oldPassword) fail(400, '原密码不正确');
  if (body.oldPassword === body.newPassword) fail(400, '新密码不能与原密码相同');
  db.passwords[u.username] = body.newPassword;
  u.mustChangePassword = false;
  pushAudit(ctx, 'auth', 'update', `${u.username}（修改密码）`, { body: { oldPassword: body.oldPassword, newPassword: body.newPassword } });
  save();
  return null;
});

on('get', '/public/portal-info', () => ({
  platformName: db.settings.basic.platformName,
  subtitle: db.settings.basic.subtitle,
  providerCount: db.providers.length,
  hostCount: db.providers.reduce((s, p) => s + p.nodeCount, 0),
  vmCount: 1268,
  clusterCount: 6,
}), { public: true });

/* -- 平台 -- */
const PV = { need: 'provider:view' };
on('get', '/providers', ({ query }) => {
  let list = db.providers.map(sanitizeProvider);
  if (query.keyword) {
    const k = query.keyword.toLowerCase();
    list = list.filter((p) => `${p.name}${p.consoleIp}${p.rootDomain}`.toLowerCase().includes(k));
  }
  if (query.envType) list = list.filter((p) => p.envType === query.envType);
  if (query.status) list = list.filter((p) => p.status === query.status);
  return paginate(sortBy(list, query), query);
}, PV);
on('get', '/providers/export', ({ query }) => ({ __xlsx: true, name: '平台', rows: db.providers.filter((p) => (!query.envType || p.envType === query.envType) && (!query.keyword || `${p.name}${p.consoleIp}`.includes(query.keyword))).map((p) => ({ 云贯标: p.name, 环境类型: p.envType, 控制台IP: p.consoleIp, 根域名: p.rootDomain, 状态: p.status, 写操作: p.writeEnabled ? '开启' : '关闭', 最后同步: p.lastSyncAt })) }));
on('get', '/providers/:id', ({ params }) => {
  const p = db.providers.find((x) => x.id === params.id);
  if (!p) fail(404, '平台不存在');
  return sanitizeProvider(p);
}, PV);
on('get', '/providers/:id/impact', ({ params }) => {
  const p = db.providers.find((x) => x.id === params.id);
  if (!p) fail(404, '平台不存在');
  return { vmCount: 210 + p.nodeCount * 17, volumeCount: 340, networkCount: 28, inspectionCount: 96, alertCount: 12 };
});
const dupCheck = (d, id) => {
  if (db.providers.some((p) => p.id !== id && p.name === d.name)) fail(400, `云贯标「${d.name}」已存在`);
  if (db.providers.some((p) => p.id !== id && p.consoleIp === d.consoleIp && d.consoleIp)) fail(400, `控制台 IP ${d.consoleIp} 已被其他平台使用`);
};
on('post', '/providers', ({ body, ctx }) => {
  dupCheck(body);
  const id = uid('p');
  const { password, ...auth } = body.auth || {};
  const p = { ...body, id, type: 'openstack', auth: { ...auth, passwordSet: !!password }, status: 'unknown', lastSyncAt: null, createdAt: new Date().toISOString(), writeEnabled: false, nodeCount: body.nodeCount || 0 };
  db.providers.push(p);
  db.providerSecrets[id] = password;
  pushAudit(ctx, 'provider', 'create', p.name, { body, link: '/system/providers', targetId: id });
  save();
  return sanitizeProvider(p);
}, { need: 'provider:create' });
on('put', '/providers/:id/write-switch', ({ params, body, ctx }) => {
  const p = db.providers.find((x) => x.id === params.id);
  if (!p) fail(404, '平台不存在');
  p.writeEnabled = !!body.enabled;
  pushAudit(ctx, 'provider', 'update', `${p.name}（写操作${body.enabled ? '开启' : '关闭'}）`, { body, link: '/system/providers', targetId: p.id });
  save();
  return sanitizeProvider(p);
}, { need: 'provider:write_switch' });
on('put', '/providers/:id', ({ params, body, ctx }) => {
  const p = db.providers.find((x) => x.id === params.id);
  if (!p) fail(404, '平台不存在');
  dupCheck(body, p.id);
  const { password, ...auth } = body.auth || {};
  Object.assign(p, body, { id: p.id, auth: { ...p.auth, ...auth, passwordSet: !!(password || db.providerSecrets[p.id]) }, writeEnabled: p.writeEnabled });
  if (password) db.providerSecrets[p.id] = password;
  pushAudit(ctx, 'provider', 'update', p.name, { body, link: '/system/providers', targetId: p.id });
  save();
  return sanitizeProvider(p);
}, { need: 'provider:update' });
on('delete', '/providers/:id', ({ params, ctx }) => {
  const i = db.providers.findIndex((x) => x.id === params.id);
  if (i < 0) fail(404, '平台不存在');
  const [p] = db.providers.splice(i, 1);
  delete db.providerSecrets[p.id];
  pushAudit(ctx, 'provider', 'delete', p.name, { targetId: p.id });
  save();
  return null;
}, { need: 'provider:delete' });
on('post', '/providers/verify', async ({ body, ctx }) => {
  await sleep(900);
  let draft = body.draft;
  let saved = false;
  if (body.id) {
    const p = db.providers.find((x) => x.id === body.id);
    if (!p) fail(404, '平台不存在');
    saved = !!db.providerSecrets[p.id];
    draft = draft ? { ...p, ...draft, auth: { ...p.auth, ...draft.auth } } : p;
  }
  const res = verifyDraft(draft, saved);
  if (body.id) {
    const p = db.providers.find((x) => x.id === body.id);
    if (p) p.status = res.status;
  }
  pushAudit(ctx, 'provider', 'verify', draft.name || '未命名平台', { result: res.ok ? 'success' : 'failure', error: res.ok ? '' : res.items.find((i) => !i.ok)?.error, body: { name: draft.name } });
  save();
  return res;
}, { need: 'provider:verify' });
on('post', '/providers/:id/sync', ({ params }) => {
  const p = db.providers.find((x) => x.id === params.id);
  if (!p) fail(404, '平台不存在');
  const id = uid('t');
  db.tasks[id] = { id, startedAt: Date.now(), duration: 3000, providerId: p.id };
  save();
  return { taskId: id };
}, { need: 'provider:sync' });
on('get', '/tasks/:id', ({ params }) => {
  const t = db.tasks[params.id];
  if (!t) fail(404, '任务不存在');
  const pct = Math.min(100, Math.round(((Date.now() - t.startedAt) / t.duration) * 100));
  if (pct >= 100) {
    const p = db.providers.find((x) => x.id === t.providerId);
    if (p) p.lastSyncAt = new Date().toISOString();
    save();
  }
  return { id: t.id, status: pct >= 100 ? 'success' : 'running', progress: pct, message: pct >= 100 ? '同步完成' : '同步中' };
});

/* -- 用户 -- */
const filterUsers = (q) => {
  let list = db.users;
  if (q.keyword) {
    const k = q.keyword.toLowerCase();
    list = list.filter((u) => `${u.username}${u.name}${u.email}${u.department}`.toLowerCase().includes(k));
  }
  if (q.status) list = list.filter((u) => u.status === q.status);
  if (q.roleId) list = list.filter((u) => u.roleIds.includes(q.roleId));
  return list;
};
on('get', '/users', ({ query }) => paginate(sortBy(filterUsers(query).map(publicUser), query), query), { need: 'user:view' });
on('get', '/users/export', ({ query }) => ({ __xlsx: true, name: '用户', rows: filterUsers(query).map((u) => ({ 用户名: u.username, 姓名: u.name, 邮箱: u.email, 部门: u.department, 来源: u.source, 角色: rolesOf(u).map((r) => r.name).join('、'), 状态: u.status, 最后登录: u.lastLoginAt })) }), { need: 'user:export' });
const userDup = (b, id) => {
  if (db.users.some((u) => u.id !== id && u.username === b.username)) fail(400, `用户名「${b.username}」已存在`);
  if (b.email && db.users.some((u) => u.id !== id && u.email === b.email)) fail(400, `邮箱「${b.email}」已被使用`);
};
on('post', '/users', ({ body, ctx }) => {
  userDup(body);
  const u = { id: uid('u'), source: 'local', status: 'active', failCount: 0, lockedUntil: null, mustChangePassword: true, createdAt: new Date().toISOString(), lastLoginAt: null, phone: '', ...body };
  const initial = `Cw@${Math.random().toString(36).slice(2, 8)}9!`;
  db.users.push(u);
  db.passwords[u.username] = initial;
  pushAudit(ctx, 'user', 'create', u.username, { body, link: '/system/users' });
  save();
  return { ...publicUser(u), initialPassword: initial };
}, { need: 'user:create' });
const guardLastSuper = (targets, nextRoleIds) => {
  const supers = db.users.filter((u) => u.status === 'active' && isSuper(u));
  const remain = supers.filter((u) => !targets.includes(u.id) || (nextRoleIds && db.roles.filter((r) => nextRoleIds.includes(r.id)).some((r) => r.permissions.includes('*'))));
  if (targets.some((id) => supers.find((s) => s.id === id)) && remain.length === 0) fail(400, '不能禁用/降权最后一个超级管理员');
};
on('put', '/users/status', ({ body, ctx }) => {
  const { ids, status } = body;
  if (status === 'disabled') {
    if (ids.includes(ctx.user.id)) fail(400, '不能禁用自己');
    guardLastSuper(ids);
  }
  db.users.filter((u) => ids.includes(u.id)).forEach((u) => {
    u.status = status;
    if (status === 'active') { u.failCount = 0; u.lockedUntil = null; }
  });
  pushAudit(ctx, 'user', 'update', `${ids.length} 个用户（${status === 'active' ? '启用' : '禁用'}）`, { body, link: '/system/users' });
  save();
  return null;
}, { need: 'user:toggle' });
/** 删除用户：不能删自己、不能删光超级管理员；同时清理其登录凭据与会话（审计记录保留） */
const removeUsers = (ids, ctx) => {
  const targets = db.users.filter((u) => ids.includes(u.id));
  if (!targets.length) fail(404, '用户不存在');
  if (targets.some((u) => u.id === ctx.user.id)) fail(400, '不能删除自己');
  const supers = db.users.filter((u) => u.status === 'active' && isSuper(u));
  if (supers.length && supers.every((s) => ids.includes(s.id))) fail(400, '不能删除最后一个超级管理员');
  targets.forEach((u) => {
    delete db.passwords[u.username];
    Object.keys(db.sessions).forEach((k) => { if (db.sessions[k] === u.id) delete db.sessions[k]; });
  });
  db.users = db.users.filter((u) => !ids.includes(u.id));
  pushAudit(ctx, 'user', 'delete', targets.length === 1 ? targets[0].username : `${targets.length} 个用户（${targets.map((u) => u.username).join('、')}）`, { body: { ids }, link: '/system/users' });
  save();
  return { removed: targets.length };
};
on('post', '/users/batch-delete', ({ body, ctx }) => removeUsers(Array.isArray(body.ids) ? body.ids : [], ctx), { need: 'user:delete' });
on('delete', '/users/:id', ({ params, ctx }) => removeUsers([params.id], ctx), { need: 'user:delete' });
on('put', '/users/:id', ({ params, body, ctx }) => {
  const u = db.users.find((x) => x.id === params.id);
  if (!u) fail(404, '用户不存在');
  userDup(body, u.id);
  if (body.roleIds) guardLastSuper([u.id], body.roleIds);
  if (body.status === 'disabled' && u.id === ctx.user.id) fail(400, '不能禁用自己');
  Object.assign(u, body, { id: u.id, username: u.username });
  pushAudit(ctx, 'user', 'update', u.username, { body, link: '/system/users' });
  save();
  return publicUser(u);
}, { need: 'user:update' });
on('post', '/users/:id/unlock', ({ params, ctx }) => {
  const u = db.users.find((x) => x.id === params.id);
  if (!u) fail(404, '用户不存在');
  u.status = 'active'; u.failCount = 0; u.lockedUntil = null;
  pushAudit(ctx, 'user', 'update', `${u.username}（解锁）`, { link: '/system/users' });
  save();
  return null;
}, { need: 'user:unlock' });
on('post', '/users/:id/reset-password', ({ params, ctx }) => {
  const u = db.users.find((x) => x.id === params.id);
  if (!u) fail(404, '用户不存在');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const arr = crypto.getRandomValues(new Uint32Array(14));
  const pw = `${[...arr].map((n) => chars[n % chars.length]).join('')}Aa1!`;
  db.passwords[u.username] = pw;
  u.mustChangePassword = true;
  pushAudit(ctx, 'user', 'reset_password', u.username, { link: '/system/users' });
  save();
  return { password: pw, mustChangePassword: true };
}, { need: 'user:reset_password' });

/* -- 角色 -- */
const roleView = (r) => ({ ...r, userCount: db.users.filter((u) => u.roleIds.includes(r.id)).length });
on('get', '/roles', () => db.roles.map(roleView), { need: 'role:view' });
on('get', '/roles/scope-tree', ({ ctx }) => ({
  providers: ctx.providers.map((p) => ({
    value: p.id, label: p.name,
    clusters: [
      { value: `${p.id}:az-nova`, label: `${p.name.slice(0, 4)}-可用域 nova`, resources: [{ value: `${p.id}:az-nova:vm`, label: '云主机' }, { value: `${p.id}:az-nova:volume`, label: '云硬盘' }, { value: `${p.id}:az-nova:network`, label: '网络' }] },
      { value: `${p.id}:az-ssd`, label: `${p.name.slice(0, 4)}-可用域 ssd`, resources: [{ value: `${p.id}:az-ssd:vm`, label: '云主机' }, { value: `${p.id}:az-ssd:volume`, label: '云硬盘' }] },
    ],
  })),
}), { need: 'role:view' });
on('get', '/roles/:id/users', ({ params }) => db.users.filter((u) => u.roleIds.includes(params.id)).map(publicUser), { need: 'role:view' });
on('get', '/roles/:id', ({ params }) => {
  const r = db.roles.find((x) => x.id === params.id);
  if (!r) fail(404, '角色不存在');
  return roleView(r);
}, { need: 'role:view' });
const roleDup = (b, id) => {
  if (db.roles.some((r) => r.id !== id && r.code === b.code)) fail(400, `角色编码「${b.code}」已存在`);
  if (db.roles.some((r) => r.id !== id && r.name === b.name)) fail(400, `角色名称「${b.name}」已存在`);
};
on('post', '/roles/:id/copy', ({ params, body, ctx }) => {
  const src = db.roles.find((x) => x.id === params.id);
  if (!src) fail(404, '角色不存在');
  const r = { ...clone(src), id: uid('r'), name: body.name, code: body.code, builtin: false };
  roleDup(r);
  db.roles.push(r);
  pushAudit(ctx, 'role', 'create', `${r.name}（复制自 ${src.name}）`, { link: '/system/roles' });
  save();
  return roleView(r);
}, { need: 'role:create' });
on('post', '/roles', ({ body, ctx }) => {
  roleDup(body);
  const r = { id: uid('r'), builtin: false, permissions: [], dataScopes: [], description: '', ...body };
  db.roles.push(r);
  pushAudit(ctx, 'role', 'create', r.name, { body, link: '/system/roles' });
  save();
  return roleView(r);
}, { need: 'role:create' });
on('put', '/roles/:id', ({ params, body, ctx }) => {
  const r = db.roles.find((x) => x.id === params.id);
  if (!r) fail(404, '角色不存在');
  if (r.builtin) fail(400, '内置角色不可修改，请「复制为新角色」后再调整');
  roleDup(body, r.id);
  Object.assign(r, body, { id: r.id, builtin: false });
  pushAudit(ctx, 'role', 'update', r.name, { body, link: '/system/roles' });
  save();
  return roleView(r);
}, { need: 'role:update' });
on('delete', '/roles/:id', ({ params, ctx }) => {
  const r = db.roles.find((x) => x.id === params.id);
  if (!r) fail(404, '角色不存在');
  if (r.builtin) fail(400, '内置角色不可删除');
  if (db.users.some((u) => u.roleIds.includes(r.id))) fail(400, '该角色下仍有用户，请先调整用户角色');
  db.roles = db.roles.filter((x) => x.id !== r.id);
  pushAudit(ctx, 'role', 'delete', r.name, { link: '/system/roles' });
  save();
  return null;
}, { need: 'role:delete' });

/* -- 审计 -- */
const filterAudit = (q) => {
  let list = db.audits;
  if (q.start) list = list.filter((a) => new Date(a.time) >= new Date(Number(q.start) || q.start));
  if (q.end) list = list.filter((a) => new Date(a.time) <= new Date(Number(q.end) || q.end));
  if (q.operator) list = list.filter((a) => a.operator.includes(q.operator));
  if (q.module) list = list.filter((a) => a.module === q.module);
  if (q.action) list = list.filter((a) => a.action === q.action);
  if (q.result) list = list.filter((a) => a.result === q.result);
  if (q.keyword) list = list.filter((a) => `${a.target}${a.error}${a.ip}`.toLowerCase().includes(q.keyword.toLowerCase()));
  return list;
};
on('get', '/audit-logs', ({ query }) => {
  const list = sortBy(filterAudit(query), query.sortKey ? query : { sortKey: 'time', sortOrder: 'desc' });
  return paginate(list, query);
}, { need: 'audit:view' });
on('get', '/audit-logs/export', ({ query }) => ({ __xlsx: true, name: '审计日志', rows: filterAudit(query).map((a) => ({ 时间: a.time, 操作人: a.operator, IP: a.ip, 模块: a.module, 动作: a.action, 目标: a.target, 结果: a.result, 耗时ms: a.duration, 错误信息: a.error })) }), { need: 'audit:export' });
on('get', '/audit-logs/:id', ({ params }) => {
  const a = db.audits.find((x) => x.id === params.id);
  if (!a) fail(404, '日志不存在');
  return a;
}, { need: 'audit:view' });
on('post', '/audit-logs/clean', ({ body, ctx }) => {
  const before = Date.now() - body.beforeDays * 86400e3;
  const n0 = db.audits.length;
  db.audits = db.audits.filter((a) => new Date(a.time).getTime() >= before);
  const removed = n0 - db.audits.length;
  pushAudit(ctx, 'audit', 'clean', `清理 ${body.beforeDays} 天前日志（${removed} 条）`);
  save();
  return { removed };
}, { need: 'audit:clean' });

/* -- 系统配置 -- */
const safeSettings = () => ({
  ...db.settings,
  alertChannels: db.settings.alertChannels.map((c) => ({ ...c, secretSet: !!db.channelSecrets[c.id], secret: undefined })),
});
on('get', '/settings/public', () => ({ ...db.settings.basic, ...db.settings.brand, captchaEnabled: !!db.settings.security.captchaEnabled, ...pickPolicy(db.settings.security) }), { public: true });
on('get', '/settings', () => safeSettings(), { need: 'settings:view' });
on('put', '/settings', ({ body, ctx }) => {
  const next = { ...db.settings };
  ['basic', 'brand', 'security', 'retention'].forEach((g) => { if (body[g]) next[g] = { ...next[g], ...body[g] }; });
  if (body.alertChannels) {
    next.alertChannels = body.alertChannels.map((c) => {
      const id = c.id?.startsWith('new_') ? uid('c') : c.id;
      if (c.secret) db.channelSecrets[id] = c.secret;
      const { secret, secretSet, ...rest } = c;
      return { ...rest, id };
    });
  }
  db.settings = next;
  pushAudit(ctx, 'settings', 'update', `系统配置（${Object.keys(body).join('、')}）`, { body, link: '/system/settings' });
  save();
  return safeSettings();
}, { need: 'settings:update' });
on('post', '/settings/reset', ({ body, ctx }) => {
  const g = body.group;
  if (g === 'alertChannels') db.settings.alertChannels = [];
  else db.settings[g] = clone(seedSettings[g]);
  pushAudit(ctx, 'settings', 'update', `恢复默认（${g}）`, { link: '/system/settings' });
  save();
  return safeSettings();
}, { need: 'settings:update' });
on('post', '/settings/logo', ({ body }) => ({ url: body.dataUrl }), { need: 'settings:update' });
on('post', '/settings/alert-channels/test', async ({ body }) => {
  await sleep(800);
  if (body.type === 'email' && !body.config?.host) fail(400, 'SMTP 服务器未配置');
  if (body.type === 'webhook' && !/^https?:\/\//.test(body.config?.url || '')) fail(400, 'Webhook 地址不合法');
  return { ok: true, message: '测试消息已发送' };
}, { need: 'settings:update' });

/* -- 概览 -- */
on('get', '/dashboard/overview', ({ query, ctx }) => dashboardOverview(ctx.providers, query), { need: 'dashboard:view', providers: true });
on('get', '/dashboard/trend', ({ query }) => dashboardTrend(query), { need: 'dashboard:view' });
on('get', '/alerts/unread-count', () => ({ count: 7 }));

/* ---------------- 导出 xlsx ---------------- */
async function toXlsxBlob(payload) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(payload.rows.length ? payload.rows : [{ 提示: '无数据' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, payload.name);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------------- 混合模式：这些前缀走真实后端，其余仍由本文件 mock ---------------- */
export const REAL_PREFIXES = ['/auth/', '/settings', '/audit-logs', '/assets/', '/public/portal-info', '/alerts', '/monitor', '/capacity', '/topology', '/analytics', '/domain-config', '/providers', '/tasks'];
const isReal = (path) => REAL_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`) || path === p.replace(/\/$/, ''));

let realHttp;
function forward(config, base) {
  realHttp ||= axios.create({ baseURL: base, timeout: 60000 });
  return realHttp.request({ ...config, adapter: undefined, baseURL: base });
}
/** 混合模式：角色数据范围树 / 概览依赖的「平台列表」取自真实后端（已落库），保证与平台管理页一致 */
async function realProviders(config, base) {
  realHttp ||= axios.create({ baseURL: base, timeout: 60000 });
  try {
    const r = await realHttp.get('/providers', { params: { page: 1, pageSize: 200 }, headers: { Authorization: `Bearer ${authFromConfig(config)}` } });
    return r.data.data.list;
  } catch { return []; }
}
/** 混合模式下，mock 路由的鉴权/权限以真实后端的 /auth/me 为准（短缓存），并把真实用户映射到 mock 用户表 */
const meCache = { token: '', at: 0, me: null };
async function realMe(config, base) {
  const token = authFromConfig(config);
  if (!token) throw new HttpFail(401, '未登录或登录已过期');
  if (meCache.token === token && Date.now() - meCache.at < 10000) return meCache.me;
  realHttp ||= axios.create({ baseURL: base, timeout: 60000 });
  try {
    const r = await realHttp.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    meCache.token = token; meCache.at = Date.now(); meCache.me = r.data.data;
    return meCache.me;
  } catch (e) {
    throw new HttpFail(e.response?.status === 403 ? 403 : 401, e.response?.data?.message || '未登录或登录已过期');
  }
}

/* ---------------- adapter ---------------- */
export async function mockAdapter(config, { hybrid = false, base = '/api' } = {}) {
  const rawPath = (config.url || '').replace(/\?.*$/, '');
  if (hybrid && isReal(rawPath)) return forward(config, base);
  await sleep(140 + Math.random() * 220);
  const method = (config.method || 'get').toLowerCase();
  const path = (config.url || '').replace(/\?.*$/, '');
  const query = config.params || {};
  let body = config.data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep */ }
  }
  body = body ?? {};

  const respond = (status, data, code = 0, message = 'ok') => {
    const response = { data: { code, message, data }, status, statusText: String(status), headers: {}, config, request: {} };
    if (status >= 400) throw new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response);
    return response;
  };

  try {
    const route = routes.find((r) => r.method === method && r.re.test(path));
    if (!route) throw new HttpFail(404, `接口不存在：${method.toUpperCase()} ${path}`);
    const params = route.re.exec(path).groups || {};
    const ctx = { method, path, user: null, providers: db.providers };
    if (!route.public && hybrid) {
      const me = await realMe(config, base);
      const mu = db.users.find((u) => u.username === me.user.username) || { id: me.user.id, username: me.user.username, name: me.user.name, roleIds: [], status: 'active' };
      ctx.user = mu;
      if (route.providers) ctx.providers = await realProviders(config, base);
      if (route.need && !me.permissions.includes('*') && !me.permissions.includes(route.need)) throw new HttpFail(403, `缺少权限：${route.need}`);
    } else if (!route.public) {
      const uidv = db.sessions[authFromConfig(config)];
      const user = uidv && db.users.find((u) => u.id === uidv);
      if (!user) throw new HttpFail(401, '未登录或登录已过期');
      if (user.status === 'disabled') throw new HttpFail(401, '账号已被禁用');
      ctx.user = user;
      if (route.need) {
        const perms = permsOf(user);
        if (!perms.includes('*') && !perms.includes(route.need)) throw new HttpFail(403, `缺少权限：${route.need}`);
      }
    }
    const result = await route.handler({ params, query, body, ctx });
    if (result && result.__xlsx) {
      return { data: await toXlsxBlob(result), status: 200, statusText: 'OK', headers: {}, config, request: {} };
    }
    return respond(200, result === undefined ? null : result);
  } catch (e) {
    if (e instanceof AxiosError) throw e;
    if (e instanceof HttpFail) {
      const response = { data: { code: e.bizCode, message: e.message, data: e.data ?? null }, status: e.status, statusText: String(e.status), headers: {}, config, request: {} };
      throw new AxiosError(e.message, 'ERR_BAD_REQUEST', config, null, response);
    }
    console.error('[mock] 未处理异常', e);
    const response = { data: { code: 500, message: '模拟服务内部错误', data: null }, status: 500, statusText: '500', headers: {}, config, request: {} };
    throw new AxiosError('模拟服务内部错误', 'ERR_BAD_RESPONSE', config, null, response);
  }
}
