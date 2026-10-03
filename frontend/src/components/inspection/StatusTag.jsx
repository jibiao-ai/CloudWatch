import React from 'react';
import { STATUS } from './common';

/** StatusTag —— 巡检结果标签（正常 / 预警 / 异常 / 未采集） */
export default function StatusTag({ value }) {
  const s = STATUS[value] || STATUS.na;
  return <span className={s.tag}>{s.label}</span>;
}
