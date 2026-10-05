import React, { useState } from 'react';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import SecretInput from '../SecretInput';
import LoadingButton from '../LoadingButton';
import Modal from '../Modal';
import { deepClone } from '../../utils/clone';
import { validateChannel } from './AlertChannels';

export const TYPES = [{ value: 'email', label: '邮件' }, { value: 'webhook', label: 'Webhook' }];

/**
 * ChannelModal —— 新增 / 编辑单个告警渠道。点「保存」先校验该渠道，通过后交给父组件写入并保存到数据库。
 * 属性：channel(草稿初值) / isNew / saving / serverErrors(后端字段错误) / onCancel / onSubmit(channel)
 * 父组件需用 key 区分每次打开，以重置草稿。
 */
export default function ChannelModal({ channel, isNew, saving, serverErrors = {}, onCancel, onSubmit }) {
  const [c, setC] = useState(() => deepClone(channel));
  const [local, setLocal] = useState({});
  const er = { ...serverErrors, ...local };
  const set = (patch) => setC((s) => ({ ...s, ...patch }));
  const cfg = (k) => (e) => set({ config: { ...c.config, [k]: e.target.value } });
  const submit = () => {
    const e = validateChannel(c);
    setLocal(e);
    if (Object.keys(e).length === 0) onSubmit({ ...c, name: c.name.trim() });
  };
  return (
    <Modal open title={isNew ? '新增告警渠道' : '编辑告警渠道'} subtitle="保存后写入数据库；密钥类字段加密存储且不再回显" width={680} onClose={saving ? undefined : onCancel} closeOnMask={false}
      footer={<><button type="button" className="btn-default" disabled={saving} onClick={onCancel}>取消</button><LoadingButton variant="primary" loading={saving} onClick={submit}>保存</LoadingButton></>}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 pt-1">
        <FormField label="渠道名称" required error={er.name}><input className="field" value={c.name} onChange={(e) => set({ name: e.target.value })} /></FormField>
        <FormField label="类型"><CustomSelect value={c.type} onChange={(v) => set({ type: v })} options={TYPES} /></FormField>
        {c.type === 'email' ? (<>
          <FormField label="SMTP 服务器" required error={er.host}><input className="field" value={c.config.host || ''} onChange={cfg('host')} /></FormField>
          <FormField label="端口" required error={er.port}><input className="field" value={c.config.port || ''} onChange={cfg('port')} inputMode="numeric" /></FormField>
          <FormField label="发件账号"><input className="field" value={c.config.username || ''} onChange={cfg('username')} autoComplete="off" /></FormField>
          <FormField label="账号密码 / 授权码"><SecretInput saved={c.secretSet} value={c.secret || ''} onChange={(v) => set({ secret: v })} placeholder="请输入" /></FormField>
          <FormField className="col-span-full" label="收件人" required error={er.to} hint="多个邮箱用英文逗号分隔"><input className="field" value={c.config.to || ''} onChange={cfg('to')} /></FormField>
        </>) : (<>
          <FormField className="col-span-full" label="Webhook 地址" required error={er.url} hint="支持企业微信 / 钉钉 / 自定义 Webhook"><input className="field font-mono text-[13px]" value={c.config.url || ''} onChange={cfg('url')} placeholder="https://" /></FormField>
          <FormField label="签名密钥（可选）"><SecretInput saved={c.secretSet} value={c.secret || ''} onChange={(v) => set({ secret: v })} placeholder="请输入" /></FormField>
        </>)}
      </div>
    </Modal>
  );
}
