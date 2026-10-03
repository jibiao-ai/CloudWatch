/** 巡检：状态展示、触发方式等公共常量 */
export const STATUS = {
  ok: { label: '正常', tag: 'tag-success' },
  warn: { label: '预警', tag: 'tag-warning' },
  bad: { label: '异常', tag: 'tag-danger' },
  na: { label: '未采集', tag: 'tag-default' },
};
export const OVERALL_OPTIONS = [{ value: 'ok', label: '正常' }, { value: 'warn', label: '预警' }, { value: 'bad', label: '异常' }];
export const TRIGGER = { manual: '手动发起', schedule: '定时巡检' };
export const TRIGGER_OPTIONS = [{ value: 'manual', label: '手动发起' }, { value: 'schedule', label: '定时巡检' }];
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, i) => ({ value: i + 1, label }));
