import React from 'react';
import { TextField } from './fields';

/** 基础信息：平台名称 / 副标题 / 版权 / 支持邮箱 */
export default function BasicSection({ value, onChange, errors, disabled }) {
  const p = { group: 'basic', onChange, errors, disabled };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <TextField {...p} name="platformName" label="平台名称" required value={value.platformName} maxLength={24} />
      <TextField {...p} name="subtitle" label="副标题" value={value.subtitle} maxLength={64} />
      <TextField {...p} name="copyright" label="版权信息" value={value.copyright} maxLength={128} />
      <TextField {...p} name="supportEmail" label="支持邮箱" value={value.supportEmail} />
    </div>
  );
}
