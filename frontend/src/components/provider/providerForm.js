import { isDomain, isIPv4 } from '../../utils/validators';
import { OPENSTACK_COMPONENTS } from '../../data/dict';

export const STEPS = [
  { key: 'basic', title: '基本信息' },
  { key: 'auth', title: '认证信息' },
  { key: 'advanced', title: '高级' },
];

/** 后端字段 → 所在步骤（保存失败时跳转到出错的那一步） */
export const FIELD_STEP = {
  name: 0, envType: 0, consoleIp: 0, rootDomain: 0, arch: 0, nodeCount: 0,
  username: 1, password: 1, projectName: 1, userDomain: 1, projectDomain: 1,
  timeoutSec: 2, syncIntervalMin: 2, alertIntervalSec: 2, remark: 2,
};

export const emptyForm = () => ({
  name: '', envType: 'dev', consoleIp: '', rootDomain: '', arch: 'X86（Intel）', nodeCount: 6,
  auth: { username: 'admin', password: '', projectName: 'admin', userDomain: 'default', projectDomain: 'default' },
  advanced: { timeoutSec: 30, syncIntervalMin: 10, alertIntervalSec: 60, remark: '' },
});

/** 详情 → 表单（密码永不回显：passwordSet 仅用于提示，password 恒为空） */
export const toForm = (p) => {
  const base = emptyForm();
  return {
    ...base, name: p.name, envType: p.envType, consoleIp: p.consoleIp, rootDomain: p.rootDomain, arch: p.arch || base.arch, nodeCount: p.nodeCount,
    auth: { ...base.auth, ...p.auth, password: '' },
    advanced: { ...base.advanced, ...p.advanced },
  };
};

/** 由根域名自动派生六个组件域名：<组件>.<根域名>（例：keystone.openstack.svc.cluster.local） */
export const componentHosts = (root) =>
  OPENSTACK_COMPONENTS.map((c) => ({ ...c, host: root && root.trim() ? `${c.key}.${root.trim().toLowerCase()}` : '' }));

/** 返回 { [field]: message }，按步骤校验 */
export function validateStep(step, f, { editing, passwordSet }) {
  const e = {};
  if (step === 0) {
    if (!f.name.trim()) e.name = '请输入云管标识（如：生产环境高性能云ES1）';
    else if (f.name.trim().length > 40) e.name = '不超过 40 个字符';
    if (!f.consoleIp.trim()) e.consoleIp = '请输入控制台 IP';
    else if (!isIPv4(f.consoleIp.trim())) e.consoleIp = 'IP 格式不正确';
    if (!f.rootDomain.trim()) e.rootDomain = '请输入根域名（如 openstack.svc.cluster.local）';
    else if (!isDomain(f.rootDomain.trim())) e.rootDomain = '根域名格式不正确（不能包含逗号或空格）';
    if (!(Number(f.nodeCount) >= 0)) e.nodeCount = '请输入有效的节点数';
  }
  if (step === 1) {
    if (!f.auth.username.trim()) e.username = '请输入用户名';
    if (!f.auth.projectName.trim()) e.projectName = '请输入项目名称（对应云平台 project）';
    if (!f.auth.userDomain.trim()) e.userDomain = '请输入用户域';
    if (!f.auth.projectDomain.trim()) e.projectDomain = '请输入项目域';
    if (!f.auth.password && !(editing && passwordSet)) e.password = '请输入密码';
  }
  if (step === 2) {
    const t = Number(f.advanced.timeoutSec);
    if (!(t >= 3 && t <= 300)) e.timeoutSec = '请求超时需在 3~300 秒之间';
    const s = Number(f.advanced.syncIntervalMin);
    if (!(s >= 1 && s <= 1440)) e.syncIntervalMin = '同步间隔需在 1~1440 分钟之间';
    const a = Number(f.advanced.alertIntervalSec);
    if (!(a >= 10 && a <= 3600)) e.alertIntervalSec = '告警同步间隔需在 10~3600 秒之间';
    if ((f.advanced.remark || '').length > 255) e.remark = '备注不超过 255 个字符';
  }
  return e;
}

/** 「基本信息 + 认证信息」是否已全部填写完整（决定验证连接按钮是否可用，不产生提示） */
export const accessReady = (f, ctx) => [0, 1].every((k) => Object.keys(validateStep(k, f, ctx)).length === 0);

/** 提交给后端的载荷（密码为空 = 沿用已保存密码） */
export const toPayload = (f) => ({
  name: f.name.trim(), envType: f.envType, consoleIp: f.consoleIp.trim(), rootDomain: f.rootDomain.trim().toLowerCase(),
  arch: f.arch, nodeCount: Number(f.nodeCount),
  auth: {
    username: f.auth.username.trim(), projectName: f.auth.projectName.trim(),
    userDomain: f.auth.userDomain.trim(), projectDomain: f.auth.projectDomain.trim(),
    password: f.auth.password || undefined,
  },
  advanced: { timeoutSec: Number(f.advanced.timeoutSec), syncIntervalMin: Number(f.advanced.syncIntervalMin), alertIntervalSec: Number(f.advanced.alertIntervalSec), remark: (f.advanced.remark || '').trim() },
});
