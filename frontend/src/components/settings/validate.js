import { isEmail } from '../../utils/validators';
import { validateChannel } from './AlertChannels';

/** 与后端 settings 包校验区间保持一致；后端为最终裁决，这里只做即时提示。 */
export const SECURITY_RANGES = [['minLength', 6, 64], ['expireDays', 0, 3650], ['sessionTimeoutMin', 5, 1440], ['maxSessions', 1, 20], ['captchaAfterFailures', 1, 10], ['lockThreshold', 3, 20], ['lockMinutes', 1, 1440]];
export const RETENTION_KEYS = ['auditDays', 'metricDays', 'inspectionDays', 'alertDays'];

export function validateGroup(g, v) {
  const e = {};
  if (g === 'basic') {
    if (!v.platformName.trim()) e['basic.platformName'] = '请输入平台名称';
    else if (v.platformName.length > 24) e['basic.platformName'] = '不超过 24 个字符';
    if (v.supportEmail && !isEmail(v.supportEmail)) e['basic.supportEmail'] = '邮箱格式不正确';
  }
  if (g === 'security') SECURITY_RANGES.forEach(([k, a, b]) => { if (!(v[k] >= a && v[k] <= b)) e[`security.${k}`] = `${a}~${b}`; });
  if (g === 'retention') RETENTION_KEYS.forEach((k) => { if (!(v[k] >= 7 && v[k] <= 3650)) e[`retention.${k}`] = '7~3650 天'; });
  if (g === 'alertChannels') v.forEach((c) => { const r = validateChannel(c); Object.entries(r).forEach(([k, m]) => { e[`ch.${c.id}.${k}`] = m; }); });
  return e;
}

/** 把后端返回的 fields（键同上）原样并入；渠道错误按 id 归组给 AlertChannels 使用 */
export const channelErrors = (errs) => {
  const out = {};
  Object.entries(errs).forEach(([k, m]) => {
    if (!k.startsWith('ch.')) return;
    const i = k.lastIndexOf('.');
    const id = k.slice(3, i);
    (out[id] ||= {})[k.slice(i + 1)] = m;
  });
  return out;
};
