import React from 'react';

/** HealthTag —— EMLA 健康值：0 健康、非 0 不健康、null 未采集到 */
export default function HealthTag({ value, okText = '健康', badText = '不健康' }) {
  if (value == null) return <span className="tag-default">未采集</span>;
  return value === 0 ? <span className="tag-success">{okText}</span> : <span className="tag-danger">{badText}</span>;
}
