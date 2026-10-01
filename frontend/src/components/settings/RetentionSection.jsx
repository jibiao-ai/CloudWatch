import React from 'react';
import { NumField } from './fields';

const ITEMS = [['auditDays', '审计日志（天）'], ['metricDays', '监控指标（天）'], ['inspectionDays', '巡检结果（天）'], ['alertDays', '告警记录（天）']];

/** 数据保留：后端每小时按此天数清理过期数据（启动时也会执行一次） */
export default function RetentionSection({ value, onChange, errors, disabled }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {ITEMS.map(([k, l]) => <NumField key={k} group="retention" name={k} label={l} value={value[k]} onChange={onChange} errors={errors} disabled={disabled} hint="可设 7~3650 天" />)}
    </div>
  );
}
