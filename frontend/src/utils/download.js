import { formatTimestamp } from './format';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 文件名 = 标题 + 筛选条件摘要 + 时间戳（导出类接口统一使用） */
export function buildExportName(title, filters = {}) {
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}-${Array.isArray(v) ? v.join('+') : v}`)
    .join('_')
    .replace(/[\\/:*?"<>|\s]+/g, '');
  return `${title}${parts ? '_' + parts.slice(0, 60) : ''}_${formatTimestamp()}.xlsx`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
