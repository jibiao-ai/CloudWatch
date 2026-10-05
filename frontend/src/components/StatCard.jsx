import React from 'react';

/** StatCard —— KPI 卡片（实色卡片）。属性：icon / label / value / hint / tone('primary'|'success'|'warning'|'danger'|'info') / onClick */
const TONE = { primary: 'bg-primary-soft text-primary-text', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info' };
export default function StatCard({ icon: Icon, label, value, hint, tone = 'primary' }) {
  return (
    <div className="card p-4 flex items-start gap-3.5 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${TONE[tone]}`}>{Icon && <Icon size={20} />}</div>
      <div className="min-w-0">
        <div className="text-xs text-fg-muted">{label}</div>
        <div className="text-2xl font-semibold text-fg tabular-nums mt-0.5 leading-tight">{value}</div>
        {hint && <div className="text-xs text-fg-subtle mt-1 leading-snug break-words">{hint}</div>}
      </div>
    </div>
  );
}
