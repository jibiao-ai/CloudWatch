import React, { useState } from 'react';
import { Mail, Plus, Send, Trash2, Webhook } from 'lucide-react';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import Switch from '../Switch';
import SecretInput from '../SecretInput';
import LoadingButton from '../LoadingButton';
import EmptyState from '../EmptyState';
import { settingsApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { isEmail, isUrl } from '../../utils/validators';

const TYPES = [{ value: 'email', label: '邮件（SMTP）' }, { value: 'webhook', label: 'Webhook（企业微信 / 钉钉 / 自定义）' }];
let n = 0;
export const newChannel = () => ({ id: `new_${Date.now()}_${n++}`, type: 'email', name: '', enabled: true, config: { host: '', port: 465, username: '', to: '', url: '' }, secret: '', secretSet: false });
export const validateChannel = (c) => {
  const e = {};
  if (!c.name.trim()) e.name = '请输入渠道名称';
  if (c.type === 'email') {
    if (!c.config.host?.trim()) e.host = '请输入 SMTP 服务器';
    if (!(Number(c.config.port) >= 1 && Number(c.config.port) <= 65535)) e.port = '端口 1~65535';
    if (!c.config.to || !c.config.to.split(/[,;，；]/).every((x) => isEmail(x.trim()))) e.to = '请输入合法的收件邮箱（多个用逗号分隔）';
  } else if (!isUrl(c.config.url || '')) e.url = '请输入合法的 Webhook 地址';
  return e;
};

/** AlertChannels —— 告警渠道（邮件 / Webhook）：可增删、启停、测试发送；密钥类字段永不回显 */
export default function AlertChannels({ value, onChange, errors = {}, disabled }) {
  const toast = useToast();
  const [testing, setTesting] = useState('');
  const upd = (id, patch) => onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const cfg = (c, k) => (e) => upd(c.id, { config: { ...c.config, [k]: e.target.value } });
  const test = async (c) => {
    const e = validateChannel(c);
    if (Object.keys(e).length) return toast.warning('请先补全渠道配置', Object.values(e)[0]);
    setTesting(c.id);
    try { const r = await settingsApi.testAlertChannel({ type: c.type, config: c.config }); toast.success('测试成功', r.message); } catch (ex) { toast.error('测试失败', ex.message); } finally { setTesting(''); }
  };
  return (
    <div>
      {value.length === 0 && <EmptyState compact icon={Send} title="尚未配置告警渠道" description="告警触发后将通过这里的渠道通知值班人员" />}
      <div className="space-y-4">
        {value.map((c) => {
          const er = errors[c.id] || {};
          return (
            <div key={c.id} className="rounded-lg border border-line p-4">
              <div className="flex items-center gap-3 mb-3">
                {c.type === 'email' ? <Mail size={18} className="text-primary-text" /> : <Webhook size={18} className="text-primary-text" />}
                <span className="text-sm font-medium text-fg">{c.name || '未命名渠道'}</span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-fg-muted">{c.enabled ? '已启用' : '已停用'}</span>
                  <Switch label={`${c.name || '渠道'} 启用`} checked={c.enabled} disabled={disabled} onChange={(v) => upd(c.id, { enabled: v })} />
                  <button type="button" className="btn-icon !w-8 !h-8 hover:!text-danger" disabled={disabled} aria-label={`删除渠道 ${c.name}`} onClick={() => onChange(value.filter((x) => x.id !== c.id))}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <FormField label="渠道名称" required error={er.name}><input className="field" value={c.name} disabled={disabled} onChange={(e) => upd(c.id, { name: e.target.value })} /></FormField>
                <FormField label="类型"><CustomSelect value={c.type} disabled={disabled} onChange={(v) => upd(c.id, { type: v })} options={TYPES} /></FormField>
                {c.type === 'email' ? (<>
                  <FormField label="SMTP 服务器" required error={er.host}><input className="field" value={c.config.host || ''} disabled={disabled} onChange={cfg(c, 'host')} /></FormField>
                  <FormField label="端口" required error={er.port}><input className="field" value={c.config.port || ''} disabled={disabled} onChange={cfg(c, 'port')} inputMode="numeric" /></FormField>
                  <FormField label="发件账号"><input className="field" value={c.config.username || ''} disabled={disabled} onChange={cfg(c, 'username')} autoComplete="off" /></FormField>
                  <FormField label="账号密码 / 授权码"><SecretInput saved={c.secretSet} value={c.secret || ''} onChange={(v) => upd(c.id, { secret: v })} placeholder="请输入" /></FormField>
                  <FormField className="md:col-span-3" label="收件人" required error={er.to} hint="多个邮箱用英文逗号分隔"><input className="field" value={c.config.to || ''} disabled={disabled} onChange={cfg(c, 'to')} /></FormField>
                </>) : (<>
                  <FormField className="md:col-span-2" label="Webhook 地址" required error={er.url}><input className="field font-mono text-[13px]" value={c.config.url || ''} disabled={disabled} onChange={cfg(c, 'url')} placeholder="https://" /></FormField>
                  <FormField label="签名密钥（可选）"><SecretInput saved={c.secretSet} value={c.secret || ''} onChange={(v) => upd(c.id, { secret: v })} placeholder="请输入" /></FormField>
                </>)}
              </div>
              <div className="mt-3"><LoadingButton size="sm" icon={Send} loading={testing === c.id} onClick={() => test(c)}>发送测试消息</LoadingButton></div>
            </div>
          );
        })}
      </div>
      {!disabled && <button type="button" className="btn-default mt-4" onClick={() => onChange([...value, newChannel()])}><Plus size={15} /> 新增渠道</button>}
    </div>
  );
}
