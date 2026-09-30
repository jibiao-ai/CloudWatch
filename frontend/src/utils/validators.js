export const isIPv4 = (v) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v || '');
export const isDomain = (v) => /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(v || '') || /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.local$/.test(v || '');
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
export const isPhone = (v) => /^1[3-9]\d{9}$/.test(v || '');
export const isUrl = (v) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v || '');
export const isPort = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 65535;

/** 从安全策略里取出密码规则（公开接口与设置保存结果共用） */
export const pickPolicy = (s = {}) => ({ minLength: s.minLength, requireUpper: s.requireUpper, requireLower: s.requireLower, requireDigit: s.requireDigit, requireSpecial: s.requireSpecial });

/** 密码强度：返回 0-4 与缺失项 */
export function checkPassword(pw, policy = {}) {
  const { minLength = 8, requireUpper = true, requireLower = true, requireDigit = true, requireSpecial = true } = policy;
  const miss = [];
  if ((pw || '').length < minLength) miss.push(`至少 ${minLength} 位`);
  if (requireUpper && !/[A-Z]/.test(pw)) miss.push('大写字母');
  if (requireLower && !/[a-z]/.test(pw)) miss.push('小写字母');
  if (requireDigit && !/\d/.test(pw)) miss.push('数字');
  if (requireSpecial && !/[^A-Za-z0-9]/.test(pw)) miss.push('特殊字符');
  let score = 0;
  if ((pw || '').length >= minLength) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return { score, missing: miss, ok: miss.length === 0 };
}

/** 密码规则的人话描述 */
export function policyText(p = {}) {
  const need = [p.requireUpper !== false && '大写字母', p.requireLower !== false && '小写字母', p.requireDigit !== false && '数字', p.requireSpecial !== false && '特殊字符'].filter(Boolean);
  return `至少 ${p.minLength || 8} 位${need.length ? `，包含${need.join('、')}` : ''}`;
}

/** 读取图片尺寸（用于 Logo 校验） */
export function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片'));
    };
    img.src = url;
  });
}
export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
