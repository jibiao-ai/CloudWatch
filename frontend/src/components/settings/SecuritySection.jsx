import React from 'react';
import Switch from '../Switch';
import { NumField } from './fields';

const TOGGLES = [['requireUpper', '要求大写字母'], ['requireLower', '要求小写字母'], ['requireDigit', '要求数字'], ['requireSpecial', '要求特殊字符'], ['captchaEnabled', '启用登录验证码']];

/** 安全策略：保存后由后端登录 / 会话 / 改密逻辑真实执行 */
export default function SecuritySection({ value, onChange, errors, disabled }) {
  const p = { group: 'security', onChange, errors, disabled };
  return (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        <NumField {...p} name="minLength" label="密码最小长度" value={value.minLength} />
        <NumField {...p} name="expireDays" label="密码有效期（天，0 = 永不过期）" value={value.expireDays} />
        <NumField {...p} name="sessionTimeoutMin" label="会话超时（分钟）" value={value.sessionTimeoutMin} />
        <NumField {...p} name="maxSessions" label="同账号最大会话数" value={value.maxSessions} />
        <NumField {...p} name="captchaAfterFailures" label="失败几次后出现验证码" value={value.captchaAfterFailures} />
        <NumField {...p} name="lockThreshold" label="失败几次后锁定账号" value={value.lockThreshold} />
        <NumField {...p} name="lockMinutes" label="锁定时长（分钟）" value={value.lockMinutes} />
      </div>
      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOGGLES.map(([k, l]) => (
          <div key={k} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <span className="text-sm text-fg">{l}</span>
            <Switch label={l} checked={!!value[k]} disabled={disabled} onChange={(v) => onChange({ [k]: v })} />
          </div>
        ))}
      </div>
    </>
  );
}
