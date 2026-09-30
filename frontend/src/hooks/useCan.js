import { useStore } from '../store/useStore';

/**
 * useCan(code) —— 权限判定（页面内唯一入口，禁止 role === 'admin' 硬编码）
 * useWriteGuard() —— 写操作全站联动：生产平台「写操作开关」关闭时，创建/删除类按钮置灰并给出原因
 *   返回 { blocked, reason, title }，title 直接放到按钮的 title 属性
 */
export function useCan(code) {
  const permissions = useStore((s) => s.permissions);
  return !code || permissions.includes('*') || permissions.includes(code);
}

export function useWriteGuard() {
  const providers = useStore((s) => s.providers);
  const off = providers.filter((p) => p.envType === 'prod' && !p.writeEnabled);
  const reason = off.length ? `生产平台「${off.map((p) => p.name).join('、')}」的写操作开关已关闭，创建/删除类云资源操作暂不可用（可在「平台管理」中开启）` : '';
  return { blocked: !!reason, reason, title: reason || undefined };
}
