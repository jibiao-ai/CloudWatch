/**
 * 深拷贝（仅限可 JSON 序列化的数据）。
 * 不使用 structuredClone：Chrome 98 之前（含部分内网/国产浏览器内核）没有该函数，会导致页面白屏。
 */
export function deepClone(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}
