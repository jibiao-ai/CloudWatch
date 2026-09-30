export const pad = (n) => String(n).padStart(2, '0');

export function formatDateTime(v, withSeconds = true) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return '-';
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${s}:${pad(d.getSeconds())}` : s;
}
export function formatDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? '-' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function formatTimestamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
export function fromNow(v) {
  if (!v) return '-';
  const diff = Date.now() - new Date(v).getTime();
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  if (diff < 30 * 86400e3) return `${Math.floor(diff / 86400e3)} 天前`;
  return formatDate(v);
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
export function formatBytes(n, digits = 1) {
  if (n == null || isNaN(n)) return '-';
  let i = 0;
  let v = Number(n);
  while (Math.abs(v) >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${BYTE_UNITS[i]}`;
}
export const formatNumber = (n) => (n == null || isNaN(n) ? '-' : Number(n).toLocaleString('zh-CN'));
export const formatPercent = (v, digits = 1) => (v == null || isNaN(v) ? '-' : `${Number(v).toFixed(digits)}%`);

export function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}
