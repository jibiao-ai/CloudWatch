import { pad } from '../../utils/format';

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 默认日期范围：近 7 天（含今天） */
export const defaultDates = () => {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 86400e3);
  return { from: ymd(from), to: ymd(to) };
};
export const RANGE_ITEMS = [{ value: '7d', label: '近7天' }, { value: '30d', label: '近30天' }, { value: '180d', label: '近半年' }, { value: '365d', label: '近一年' }];
export const SPAN = { '7d': 7, '30d': 30, '180d': 180, '365d': 365 };
/** 把后端 Opt2 列表按所属云平台过滤并转为 CustomSelect 选项 */
export const optsOf = (list = [], pid, cluster) => list.filter((o) => (!pid || o.providerId === pid) && (!cluster || o.cluster === cluster)).map((o) => ({ value: o.value, label: o.label }));
export const pctText = (v) => (v == null ? '-' : `${v}%`);
/** 运行状态环形图配色：运行中 = 成功色，已停止 = 弱化色，异常 = 危险色，其他 = 警告色 */
export const stateColor = (d, pal) => ({ 运行中: pal.ok, 已停止: pal.series[4], 异常: pal.bad }[d.label] || pal.warn);
/** 挂载状态配色：已挂载 = 主色，空闲 = 成功色，其他 = 弱化色 */
export const mountColor = (d, pal) => ({ 已挂载: pal.primary, 空闲: pal.ok }[d.label] || pal.series[4]);
/** 优化建议分组：虚拟机侧 / 物理侧 */
export const RES_GROUPS = [
  { key: 'vm', label: '虚拟机侧', types: ['vm'] },
  { key: 'phys', label: '物理侧', types: ['host', 'pool', 'disk'] },
];
/** 各资源类型的名称 / 计量单位 */
export const RES_LABEL = { vm: '虚拟机', host: '物理机', pool: '集群存储', disk: '云硬盘' };
export const RES_UNIT = { vm: '台', host: '台', pool: '个', disk: '块' };
