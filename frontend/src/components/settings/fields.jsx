import React from 'react';
import FormField from '../FormField';

/** 系统配置各分组共用的输入封装：文本框 / 数字框（仅数字）。errors 以 `${group}.${key}` 为键 */
export function TextField({ group, name, label, value, onChange, errors, disabled, required, hint, ...rest }) {
  return (
    <FormField label={label} required={required} hint={hint} error={errors[`${group}.${name}`]}>
      <input className="field" value={value ?? ''} disabled={disabled} onChange={(e) => onChange({ [name]: e.target.value })} {...rest} />
    </FormField>
  );
}

export function NumField({ group, name, label, value, onChange, errors, disabled, hint }) {
  return (
    <FormField label={label} hint={hint} error={errors[`${group}.${name}`]}>
      <input className="field" inputMode="numeric" value={value ?? ''} disabled={disabled}
        onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); onChange({ [name]: d === '' ? '' : Number(d) }); }} />
    </FormField>
  );
}
