const SENSITIVE = /(pass(word)?|pwd|token|secret|credential|authorization|api[-_]?key|private[-_]?key)/i;
/** 请求参数脱敏：password / token / secret 等敏感字段一律显示 ***（递归） */
export function maskSensitive(v) {
  if (Array.isArray(v)) return v.map(maskSensitive);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, SENSITIVE.test(k) ? '***' : maskSensitive(val)]));
  return v;
}
