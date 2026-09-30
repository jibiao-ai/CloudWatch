import React from 'react';

/**
 * StatusDot —— 状态灯（在线 / 告警 / 故障 / 未知），颜色走主题变量，带 tooltip(title)
 * 属性：status('online'|'warning'|'error'|'unknown') / label(显示文字，true 则用默认文案) / pulse(在线时呼吸) / size
 */
const MAP = {
  online: { cls: 'bg-success', text: '在线' },
  warning: { cls: 'bg-warning', text: '告警' },
  error: { cls: 'bg-danger', text: '故障' },
  unknown: { cls: 'bg-fg-subtle', text: '未知' },
};
export default function StatusDot({ status = 'unknown', label, pulse = true, size = 8, title }) {
  const m = MAP[status] || MAP.unknown;
  const text = label === true ? m.text : label;
  return (
    <span className="inline-flex items-center gap-1.5" title={title || m.text}>
      <span className="relative inline-flex" style={{ width: size, height: size }}>
        {pulse && status !== 'unknown' && <span className={`absolute inset-0 rounded-full ${m.cls} opacity-50 animate-ping`} />}
        <span className={`relative rounded-full ${m.cls}`} style={{ width: size, height: size }} />
      </span>
      {text && <span className="text-[13px] text-fg">{text}</span>}
    </span>
  );
}
