import React, { useState } from 'react';
import { PlatCell } from '../capacity/capUtil';

/** 所属云平台列：平台名 + 控制台 IP + 控制台链接（与配置中心一致） */
export const platCol = () => ({ key: 'platform', title: '所属云平台', width: 170, sortable: true, render: (r) => <PlatCell platform={{ name: r.platform, consoleIp: r.consoleIp }} /> });

/** IpCell —— IP 地址：多个时显示第 1 个 + 「更多」展开 */
export function IpCell({ list = [] }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return <span className="text-fg-subtle">-</span>;
  if (list.length === 1) return <span className="tabular-nums">{list[0]}</span>;
  return (
    <div className="text-[13px]">
      <span className="tabular-nums">{list[0]}</span>
      {open && list.slice(1).map((ip) => <div key={ip} className="tabular-nums">{ip}</div>)}
      <button type="button" className="ml-1.5 text-primary-text hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? '收起' : `更多(${list.length - 1})`}</button>
    </div>
  );
}
