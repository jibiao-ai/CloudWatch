/**
 * 接口层（唯一出口）—— 页面里禁止直接 fetch / axios。
 * 分组：authApi / publicApi / providerApi / userApi / roleApi / auditApi / domainApi / settingsApi / taskApi / dashboardApi
 * 约定：
 *  - baseURL 读环境变量（相对路径，兼容 IP / 域名访问）；
 *  - 响应统一解包 {code,message,data}，code !== 0 抛 ApiError；
 *  - 401 → 刷新 token 一次（并发合流）后重放；失败清状态跳登录；403 → 提示 + 跳 403；5xx → 可读提示；
 *  - 导出类接口返回 Blob，由 <ExportButton/> 触发下载（文件名含条件与时间戳）；
 *  - 长耗时操作（同步、巡检、创建虚机）返回任务 id，前端用 pollTask 轮询。
 * VITE_USE_MOCK 三态开关：
 *   hybrid（默认）—— 认证 / 系统配置 / 审计日志 / 资源文件 / 告警未读数走真实后端，其余尚未开发的模块（平台、用户、角色、概览）仍用 mock；域名配置已走真实后端；
 *   true          —— 全部 mock（纯前端演示，无需后端）；
 *   false         —— 全部走真实后端。
 * TODO(mock)：其余模块后端就绪后，逐个从 services/mock 的 REAL_PREFIXES 反向迁移，最终删除 mock 目录。
 */
import axios from 'axios';
import { tokenStorage } from '../utils/auth';
import { navigateTo } from '../utils/navigate';
import { useStore } from '../store/useStore';

export class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const BASE = import.meta.env.VITE_API_BASE || '/api';
const MOCK_MODE = String(import.meta.env.VITE_USE_MOCK ?? 'hybrid');
export const USE_MOCK = MOCK_MODE !== 'false';
const HYBRID = MOCK_MODE === 'hybrid';

const http = axios.create({ baseURL: BASE, timeout: 60000, headers: { 'Content-Type': 'application/json' } });

if (USE_MOCK) {
  const ready = import('./mock');
  http.defaults.adapter = async (config) => (await ready).mockAdapter(config, { hybrid: HYBRID, base: BASE });
}

http.interceptors.request.use((config) => {
  const t = tokenStorage.getAccess();
  if (t && !config.skipAuth) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/* ---------- 401：单飞刷新 ---------- */
let refreshing = null;
function refreshToken() {
  if (!refreshing) {
    const rt = tokenStorage.getRefresh();
    refreshing = http
      .post('/auth/refresh', { refreshToken: rt }, { skipAuth: true, skipErrorToast: true, skipAuthRedirect: true })
      .then((res) => {
        tokenStorage.set(res.accessToken, res.refreshToken);
        return res.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
function forceLogout() {
  const { pathname, search } = window.location;
  useStore.getState().logout();
  if (!pathname.startsWith('/login')) navigateTo(`/login?redirect=${encodeURIComponent(pathname + search)}`, { replace: true });
}

const toApiError = (error) => {
  if (error instanceof ApiError) return error;
  const res = error.response;
  if (!res) {
    const msg = error.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '无法连接服务器，请检查网络或服务状态';
    return new ApiError(msg, { status: 0, code: 'NETWORK' });
  }
  const body = res.data || {};
  let message = body.message;
  if (!message) message = res.status >= 500 ? '服务暂时不可用，请稍后重试' : `请求失败（${res.status}）`;
  return new ApiError(message, { status: res.status, code: body.code, data: body.data });
};

http.interceptors.response.use(
  (res) => {
    if (res.config.responseType === 'blob') return res.data;
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) throw new ApiError(body.message || '操作失败', { status: res.status, code: body.code, data: body.data });
      return body.data;
    }
    return body;
  },
  async (error) => {
    const cfg = error.config || {};
    const res = error.response;
    if (res?.status === 401 && !cfg.skipAuthRedirect && !cfg._retry && tokenStorage.getRefresh()) {
      try {
        cfg._retry = true;
        const at = await refreshToken();
        cfg.headers.Authorization = `Bearer ${at}`;
        return http(cfg);
      } catch {
        forceLogout();
        throw new ApiError('登录已过期，请重新登录', { status: 401 });
      }
    }
    if (res?.status === 401 && !cfg.skipAuthRedirect) {
      forceLogout();
      throw new ApiError('登录已过期，请重新登录', { status: 401 });
    }
    const err = toApiError(error);
    if (err.status === 403 && !cfg.skipAuthRedirect && !cfg.silent403) {
      useStore.getState().pushToast({ type: 'warning', title: '无权限执行该操作', description: err.message });
    } else if (err.status >= 500 && !cfg.skipErrorToast) {
      useStore.getState().pushToast({ type: 'error', title: '服务异常', description: err.message });
    }
    throw err;
  },
);

const get = (url, params, cfg) => http.get(url, { params, ...cfg });
const post = (url, data, cfg) => http.post(url, data, cfg);
const put = (url, data, cfg) => http.put(url, data, cfg);
const del = (url, cfg) => http.delete(url, cfg);
const blob = (url, params, { onProgress } = {}) =>
  http.get(url, {
    params,
    responseType: 'blob',
    onDownloadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
  });

/* ============================ 认证 ============================ */
export const authApi = {
  login: (data) => post('/auth/login', data, { skipAuth: true, skipAuthRedirect: true, skipErrorToast: true }),
  logout: () => post('/auth/logout', {}, { skipAuthRedirect: true, skipErrorToast: true }),
  getMe: () => get('/auth/me'),
  getCaptcha: () => get('/auth/captcha', { t: Date.now() }, { skipAuth: true, skipAuthRedirect: true }),
  changePassword: (data) => post('/auth/change-password', data, { skipAuthRedirect: false }),
};
export const publicApi = {
  /** 登录页品牌区数据：不含环境 IP / 账号 */
  getPortalInfo: () => get('/public/portal-info', undefined, { skipAuth: true, skipAuthRedirect: true, skipErrorToast: true }),
};

/* ============================ 系统管理：平台 ============================ */
export const providerApi = {
  getProviderList: (params) => get('/providers', params),
  getProvider: (id) => get(`/providers/${id}`),
  createProvider: (data) => post('/providers', data),
  updateProvider: (id, data) => put(`/providers/${id}`, data),
  deleteProvider: (id) => del(`/providers/${id}`),
  getProviderImpact: (id) => get(`/providers/${id}/impact`),
  /** 验证连接：已保存平台传 id；向导内未保存传 draft（密码为空表示沿用已保存密码） */
  verifyProvider: (id, draft) => post('/providers/verify', { id, draft }),
  setProviderWriteSwitch: (id, enabled) => put(`/providers/${id}/write-switch`, { enabled }),
  syncProvider: (id) => post(`/providers/${id}/sync`, {}),
  exportProviders: (params, opt) => blob('/providers/export', params, opt),
};

/* ============================ 系统管理：用户 / 角色 ============================ */
export const userApi = {
  getUserList: (params) => get('/users', params),
  createUser: (data) => post('/users', data),
  updateUser: (id, data) => put(`/users/${id}`, data),
  setUserStatus: (ids, status) => put('/users/status', { ids, status }),
  deleteUser: (id) => del(`/users/${id}`),
  deleteUsers: (ids) => post('/users/batch-delete', { ids }),
  unlockUser: (id) => post(`/users/${id}/unlock`, {}),
  resetUserPassword: (id) => post(`/users/${id}/reset-password`, {}),
  exportUsers: (params, opt) => blob('/users/export', params, opt),
};
export const roleApi = {
  getRoleList: () => get('/roles'),
  getRole: (id) => get(`/roles/${id}`),
  createRole: (data) => post('/roles', data),
  updateRole: (id, data) => put(`/roles/${id}`, data),
  deleteRole: (id) => del(`/roles/${id}`),
  copyRole: (id, data) => post(`/roles/${id}/copy`, data),
  getRoleUsers: (id) => get(`/roles/${id}/users`),
  getScopeTree: () => get('/roles/scope-tree'),
};

/* ============================ 系统管理：审计 / 域名 / 配置 ============================ */
export const auditApi = {
  getAuditList: (params) => get('/audit-logs', params),
  getAudit: (id) => get(`/audit-logs/${id}`),
  exportAudits: (params, opt) => blob('/audit-logs/export', params, opt),
  cleanAudits: (data) => post('/audit-logs/clean', data),
};
export const domainApi = {
  getDomainConfig: () => get('/domain-config'),
  createMapping: (data) => post('/domain-config/mappings', data),
  updateMapping: (id, data) => put(`/domain-config/mappings/${id}`, data),
  deleteMapping: (id) => del(`/domain-config/mappings/${id}`),
  verifyMapping: (id) => post(`/domain-config/mappings/${id}/verify`, {}),
  saveSync: (data) => put('/domain-config/sync', data),
  applyDomain: () => post('/domain-config/apply', {}),
};
export const settingsApi = {
  /** 公开读取（登录页也需要主色/Logo） */
  getPublicSettings: () => get('/settings/public', undefined, { skipAuth: true, skipAuthRedirect: true, skipErrorToast: true }),
  getSettings: () => get('/settings'),
  updateSettings: (data) => put('/settings', data),
  resetSettings: (group) => post('/settings/reset', { group }),
  uploadLogo: (payload) => post('/settings/logo', payload),
  testAlertChannel: (channel) => post('/settings/alert-channels/test', channel),
};

/* ============================ 任务 / 概览 ============================ */
export const taskApi = {
  getTask: (id) => get(`/tasks/${id}`),
};
/** 轮询任务直到完成；onProgress(task) 回调 */
export async function pollTask(id, { interval = 800, timeout = 120000, onProgress } = {}) {
  const t0 = Date.now();
  for (;;) {
    const task = await taskApi.getTask(id);
    onProgress?.(task);
    if (task.status === 'success') return task;
    if (task.status === 'failed') throw new ApiError(task.message || '任务执行失败');
    if (Date.now() - t0 > timeout) throw new ApiError('任务超时');
    await new Promise((r) => setTimeout(r, interval));
  }
}
/* ============================ 监控中心 / 告警中心 ============================ */
export const monitorApi = {
  getOverview: () => get('/monitor/overview'),
  getSnapshot: (id) => get(`/monitor/${id}`),
  /** 立即采集：后端同步执行（连接 + 多个 EMLA 接口），放宽超时 */
  collect: (id) => post(`/monitor/${id}/collect`, {}, { timeout: 120000 }),
  getTrend: (id, params) => get(`/monitor/${id}/trend`, params, { skipErrorToast: true }),
  /** 云主机监控详情：后端实时向 Gnocchi 取 CPU / 内存 / 磁盘读写速率曲线 */
  getVMMetrics: (id, vmId, range) => get(`/monitor/${id}/vms/${vmId}/metrics`, { range }, { skipErrorToast: true, timeout: 60000 }),
};
/* ============================ 资产管理（第6章：Nova / Cinder / Neutron） ============================ */
export const capacityApi = {
  getOverview: () => get('/capacity/overview'),
  /** kind: nodes | vms | volumes | ports | pools；全部平台聚合，服务端搜索 / 排序 / 分页 */
  list: (kind, params) => get(`/capacity/${kind}`, params),
  getDetail: (kind, providerId, id) => get(`/capacity/${kind}/${encodeURIComponent(providerId)}/${encodeURIComponent(id)}`, undefined, { skipErrorToast: true }),
  /** 立即采集：不传 providerId 则依次采集全部平台，耗时较长 */
  collect: (providerId) => post(`/capacity/collect${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`, {}, { timeout: 300000 }),
};

export const alertApi = {
  getAlertList: (params) => get('/alerts', params),
  getAlertStats: (params) => get('/alerts/stats', params),
  getAlert: (id) => get(`/alerts/${id}`),
  ackAlerts: (ids) => post('/alerts/ack', { ids }),
  syncAlerts: (providerId) => post('/alerts/sync', providerId ? { providerId } : {}, { timeout: 120000 }),
  exportAlerts: (params, opt) => blob('/alerts/export', params, opt),
};

export const dashboardApi = {
  getOverview: (params) => get('/dashboard/overview', params),
  getTrend: (params) => get('/dashboard/trend', params),
  getUnreadAlerts: () => get('/alerts/unread-count', undefined, { skipErrorToast: true }),
};

export default http;
