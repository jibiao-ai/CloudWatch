import { isDomain, isIPv4, isUrl } from '../../utils/validators';
import { OPENSTACK_COMPONENTS } from '../../data/dict';

export const STEPS = [
  { key: 'basic', title: '基本信息' },
  { key: 'endpoints', title: '五端点配置' },
  { key: 'auth', title: '认证信息' },
  { key: 'conventions', title: '资源类型约定' },
  { key: 'advanced', title: '高级' },
];

export const emptyForm = () => ({
  name: '', envType: 'dev', consoleIp: '', rootDomain: '', arch: 'X86（Intel）', nodeCount: 6,
  endpoints: { keystone: '', nova: '', neutron: '', cinder: '', glance: '' },
  endpointProtocol: 'http',
  auth: { username: 'admin', password: '', projectName: 'admin', userDomain: 'default', projectDomain: 'default' },
  conventions: { defaultVolumeType: 'hdd', defaultDomainId: 'default', bootFromVolume: true, deleteOnTermination: true },
  advanced: { timeoutSec: 30, verifySsl: false, syncIntervalMin: 10, prometheusUrl: '', excludePoolIds: '', enableEmla: true, novaDashboardVip: '', remark: '' },
});

/** 详情 → 表单（密码永不回显：passwordSet 仅用于提示，password 恒为空） */
export const toForm = (p) => ({
  ...emptyForm(), ...p,
  endpoints: { ...emptyForm().endpoints, ...p.endpoints },
  auth: { ...emptyForm().auth, ...p.auth, password: '' },
  conventions: { ...emptyForm().conventions, ...p.conventions },
  advanced: { ...emptyForm().advanced, ...p.advanced },
});

/** 按根域名生成五端点（文档：<组件>.<根域名>，如 keystone.openstack.svc.cluster.local） */
export const buildEndpoints = (root, proto = 'http') =>
  Object.fromEntries(OPENSTACK_COMPONENTS.map((c) => [c.key, root ? `${proto}://${c.key}.${root.trim()}` : '']));

/** 返回 { [field]: message }，按步骤校验 */
export function validateStep(step, f, { editing, passwordSet }) {
  const e = {};
  if (step === 0) {
    if (!f.name.trim()) e.name = '请输入云管标识（如：生产环境高性能云ES1）';
    else if (f.name.length > 40) e.name = '不超过 40 个字符';
    if (!f.consoleIp.trim()) e.consoleIp = '请输入控制台 IP';
    else if (!isIPv4(f.consoleIp.trim())) e.consoleIp = 'IP 格式不正确';
    if (!f.rootDomain.trim()) e.rootDomain = '请输入根域名（如 secs.cheryfs.cn）';
    else if (!isDomain(f.rootDomain.trim())) e.rootDomain = '根域名格式不正确（不能包含逗号或空格）';
    if (!(Number(f.nodeCount) >= 0)) e.nodeCount = '请输入有效的节点数';
  }
  if (step === 1) {
    OPENSTACK_COMPONENTS.forEach((c) => {
      const v = (f.endpoints[c.key] || '').trim();
      if (!v) e[`ep_${c.key}`] = `请填写 ${c.key} 端点`;
      else if (!isUrl(v)) e[`ep_${c.key}`] = '需以 http:// 或 https:// 开头的有效地址';
    });
  }
  if (step === 2) {
    if (!f.auth.username.trim()) e.username = '请输入用户名';
    if (!f.auth.projectName.trim()) e.projectName = '请输入项目名称（对应云平台 project）';
    if (!f.auth.userDomain.trim()) e.userDomain = '请输入用户域';
    if (!f.auth.projectDomain.trim()) e.projectDomain = '请输入项目域';
    if (!editing && !f.auth.password) e.password = '请输入密码';
    if (editing && !passwordSet && !f.auth.password) e.password = '请输入密码';
  }
  if (step === 3) {
    if (!f.conventions.defaultVolumeType.trim()) e.defaultVolumeType = '请输入默认云硬盘类型（如 hdd / ssd）';
    if (!f.conventions.defaultDomainId.trim()) e.defaultDomainId = '请输入默认域 ID';
  }
  if (step === 4) {
    const t = Number(f.advanced.timeoutSec);
    if (!(t >= 3 && t <= 300)) e.timeoutSec = '超时需在 3~300 秒之间';
    const s = Number(f.advanced.syncIntervalMin);
    if (!(s >= 1 && s <= 1440)) e.syncIntervalMin = '同步间隔需在 1~1440 分钟之间';
    if (f.advanced.prometheusUrl && !isUrl(f.advanced.prometheusUrl)) e.prometheusUrl = 'Prometheus 地址格式不正确';
    if (f.advanced.excludePoolIds && !/^\d+(\s*,\s*\d+)*$/.test(f.advanced.excludePoolIds.trim())) e.excludePoolIds = '请填写以英文逗号分隔的存储池 ID，如 8,9';
    if (f.advanced.novaDashboardVip && !isIPv4(f.advanced.novaDashboardVip)) e.novaDashboardVip = 'VIP 需为 IPv4 地址';
  }
  return e;
}
/** 提交给后端的载荷（密码为空 = 沿用已保存密码） */
export const toPayload = (f) => {
  const { endpointProtocol, ...rest } = f;
  return {
    ...rest,
    name: f.name.trim(), consoleIp: f.consoleIp.trim(), rootDomain: f.rootDomain.trim().toLowerCase(),
    nodeCount: Number(f.nodeCount),
    advanced: { ...f.advanced, timeoutSec: Number(f.advanced.timeoutSec), syncIntervalMin: Number(f.advanced.syncIntervalMin) },
    auth: { ...f.auth, password: f.auth.password || undefined },
  };
};
