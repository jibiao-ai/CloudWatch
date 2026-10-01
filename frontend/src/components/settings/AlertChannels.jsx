import React, { useEffect, useState } from 'react';
import { Mail, Pencil, Send, Trash2, Webhook } from 'lucide-react';
import Switch from '../Switch';
import LoadingButton from '../LoadingButton';
import EmptyState from '../EmptyState';
import DataTable from '../DataTable';
import Tooltip from '../Tooltip';
import ConfirmModal from '../ConfirmModal';
import ChannelModal, { TYPES } from './ChannelModal';
import { settingsApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { isEmail, isUrl } from '../../utils/validators';

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

const PAGE_SIZES = [5, 10, 20];
const typeLabel = (t) => TYPES.find((x) => x.value === t)?.label || t;

/**
 * AlertChannels —— 告警渠道（邮件 / Webhook）：一条渠道一行，表格列为 名称 / 类型 / 收件人或地址 / 操作；
 * 操作列：测试、编辑（弹窗内保存）、启用开关、删除。Webhook 地址与收件人在表格中截断显示，鼠标悬停显示完整内容。
 * 新增：页头「新增渠道」按钮（addSignal 计数触发）。弹窗「保存」= 校验该渠道后写入并保存整个告警渠道分组到数据库。
 * 密钥类字段永不回显。渠道多时分页展示（默认 5 条/页）。
 */
export default function AlertChannels({ value, onChange, errors = {}, disabled, addSignal = 0, onPersist }) {
  const toast = useToast();
  const [testing, setTesting] = useState('');
  const [pg, setPg] = useState({ page: 1, pageSize: PAGE_SIZES[0] });
  const [edit, setEdit] = useState(null); // { channel, isNew, key }
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const pages = Math.max(1, Math.ceil(value.length / pg.pageSize));
  const page = Math.min(pg.page, pages);
  const shown = value.slice((page - 1) * pg.pageSize, page * pg.pageSize);
  useEffect(() => {
    const i = value.findIndex((c) => errors[c.id]);
    if (i >= 0) setPg((s) => ({ ...s, page: Math.floor(i / s.pageSize) + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);
  // 头部「新增渠道」按钮每点一次 addSignal +1：打开新增弹窗
  const seen = React.useRef(addSignal);
  useEffect(() => {
    if (addSignal === seen.current) return;
    seen.current = addSignal;
    setEdit({ channel: newChannel(), isNew: true, key: Date.now() });
  }, [addSignal]);
  const [busy, setBusy] = useState('');
  // 启用开关 / 删除：立即写库（失败则列表保持原状）
  const persist = async (id, next) => { setBusy(id); try { return await onPersist(next); } finally { setBusy(''); } };
  const toggle = (c, v) => persist(c.id, value.map((x) => (x.id === c.id ? { ...x, enabled: v } : x)));
  const remove = async () => { if (await persist(del.id, value.filter((x) => x.id !== del.id))) setDel(null); };
  const submit = async (c) => {
    const next = edit.isNew ? [...value, c] : value.map((x) => (x.id === c.id ? c : x));
    setSaving(true);
    try {
      if (await onPersist(next)) setEdit(null);
    } finally { setSaving(false); }
  };
  const test = async (c) => {
    const e = validateChannel(c);
    if (Object.keys(e).length) return toast.warning('请先补全渠道配置', Object.values(e)[0]);
    setTesting(c.id);
    try { const r = await settingsApi.testAlertChannel({ id: c.id, type: c.type, name: c.name, config: c.config, secret: c.secret || undefined }); toast.success('测试成功', r.message); } catch (ex) { toast.error('测试失败', ex.message); } finally { setTesting(''); }
  };
  const target = (c) => (c.type === 'email' ? c.config.to : c.config.url) || '';
  const columns = [
    { key: 'name', title: '渠道名称', width: 200, render: (c) => (
      <div className="flex items-center gap-2 min-w-0">
        {c.type === 'email' ? <Mail size={16} className="text-primary-text shrink-0" /> : <Webhook size={16} className="text-primary-text shrink-0" />}
        <span className="font-medium text-fg truncate">{c.name || '未命名渠道'}</span>
        {errors[c.id] && <span className="text-xs text-danger shrink-0">配置不完整</span>}
      </div>) },
    { key: 'type', title: '类型', width: 100, render: (c) => typeLabel(c.type) },
    { key: 'target', title: '收件人 / Webhook 地址', width: 320, render: (c) => (
      <Tooltip content={<span className="break-all">{target(c)}</span>}>
        <span className="block max-w-[300px] truncate font-mono text-[13px] text-fg-muted">{target(c) || '-'}</span>
      </Tooltip>) },
    { key: 'op', title: '操作', width: 300, render: (c) => (
      <div className="flex items-center gap-1">
        <LoadingButton variant="ghost" size="sm" icon={Send} loading={testing === c.id} onClick={() => test(c)}>测试</LoadingButton>
        {!disabled && <button type="button" className="btn-ghost btn-sm" aria-label={`编辑渠道 ${c.name}`} onClick={() => setEdit({ channel: c, isNew: false, key: Date.now() })}><Pencil size={14} />编辑</button>}
        <span className="inline-flex items-center gap-1.5 px-2">
          <Switch label={`${c.name || '渠道'} 启用`} checked={c.enabled} disabled={disabled || busy === c.id} onChange={(v) => toggle(c, v)} />
          <span className="text-xs text-fg-muted w-10">{c.enabled ? '已启用' : '已停用'}</span>
        </span>
        {!disabled && <button type="button" className="btn-ghost btn-sm hover:!text-danger" aria-label={`删除渠道 ${c.name}`} onClick={() => setDel(c)}><Trash2 size={14} />删除</button>}
      </div>) },
  ];
  return (
    <div>
      {value.length === 0 ? <EmptyState compact icon={Send} title="尚未配置告警渠道" description="告警触发后将通过这里的渠道通知值班人员；点击右上角「新增渠道」添加" /> : (
        <DataTable columns={columns} rows={shown} rowKey="id" page={page} pageSize={pg.pageSize} total={value.length} pageSizeOptions={PAGE_SIZES} onPageChange={setPg} />
      )}
      {edit && <ChannelModal key={edit.key} channel={edit.channel} isNew={edit.isNew} saving={saving} serverErrors={errors[edit.channel.id] || {}} onCancel={() => setEdit(null)} onSubmit={submit} />}
      <ConfirmModal open={!!del} danger title={`删除渠道「${del?.name || ''}」？`} description="删除将立即从数据库移除该渠道及其加密保存的密钥，不可恢复。"
        impactList={['该渠道将不再接收告警通知']} confirmText="确认删除" loading={busy === del?.id}
        onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}
