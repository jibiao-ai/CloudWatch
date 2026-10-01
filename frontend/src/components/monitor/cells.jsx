import React from 'react';
import ConsoleLink from '../ConsoleLink';
import CapacityBar from '../CapacityBar';

/** 所属云平台：平台名称 + 控制台 IP 超链接（新标签页打开云平台控制台） */
export function PlatformCell({ platform }) {
  if (!platform) return <span className="text-fg-subtle">—</span>;
  return (
    <div className="min-w-0">
      <div className="font-medium truncate max-w-[150px]" title={platform.name}>{platform.name}</div>
      <ConsoleLink ip={platform.consoleIp} />
    </div>
  );
}

/** 使用率条（与内存使用率同款）；无数据显示「—」 */
export const PctCell = ({ value, label }) => (value != null ? <div className="w-[150px]"><CapacityBar compact used={value} total={100} label={label} /></div> : <span className="text-fg-subtle">—</span>);

export const num = (v, f) => (v == null ? '—' : f ? f(v) : v);
