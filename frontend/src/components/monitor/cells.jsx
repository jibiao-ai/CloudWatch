import React from 'react';
import { ConsoleIconLink } from '../ConsoleLink';
import CapacityBar from '../CapacityBar';

/** 所属云平台：平台名称 + 链接按钮同一行，控制台 IP 为下方普通文字 */
export function PlatformCell({ platform }) {
  if (!platform) return <span className="text-fg-subtle">—</span>;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-medium truncate max-w-[140px]" title={platform.name}>{platform.name}</span>
        <ConsoleIconLink ip={platform.consoleIp} />
      </div>
      {platform.consoleIp && <div className="text-[13px] font-mono text-fg-muted">{platform.consoleIp}</div>}
    </div>
  );
}

/** 使用率条（与内存使用率同款）；无数据显示「—」 */
export const PctCell = ({ value, label }) => (value != null ? <div className="w-[150px]"><CapacityBar compact used={value} total={100} label={label} /></div> : <span className="text-fg-subtle">—</span>);

export const num = (v, f) => (v == null ? '—' : f ? f(v) : v);
