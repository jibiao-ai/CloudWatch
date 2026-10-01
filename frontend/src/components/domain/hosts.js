/** 域名配置：hosts 行生成与展示辅助（与后端 internal/hosts 的生成规则一致：<IP> <组件>.<根域名>） */
export const DEFAULT_COMPONENTS = ['keystone', 'neutron', 'nova', 'cinder', 'glance', 'gnocchi', 'coaster'];
export const EXTRA_COMPONENTS = ['emla'];

export const normDomain = (v) => (v || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');

/** 由录入值生成 hosts 行；IP 或根域名为空时返回空数组（用于弹窗内实时预览） */
export function buildLines({ consoleIp, rootDomain, components }) {
  const root = normDomain(rootDomain);
  if (!consoleIp?.trim() || !root) return [];
  return (components || []).map((c) => `${consoleIp.trim()} ${c}.${root}`);
}

export const linesOf = (m) => (m.hosts || []).map((h) => `${h.ip} ${h.host}`);

/** 所有已启用映射的 hosts 文本（供「复制全部」粘贴到其它机器的 hosts 文件） */
export const allLines = (mappings) => mappings.filter((m) => m.enabled).flatMap(linesOf);

export const STATUS_TAG = {
  ok: { cls: 'tag-success', text: '正常' },
  failed: { cls: 'tag-danger', text: '失败' },
  disabled: { cls: 'tag-default', text: '未启用' },
};
export const TRIGGER_TEXT = { startup: '服务启动', create: '新增映射', update: '修改映射', delete: '删除映射', manual: '手动同步', 'sync-config': '修改同步方式' };
