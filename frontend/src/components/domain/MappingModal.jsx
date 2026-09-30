import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import Modal from '../Modal';
import FormField from '../FormField';
import Checkbox from '../Checkbox';
import LoadingButton from '../LoadingButton';
import { isIPv4, isPort } from '../../utils/validators';
import { DEFAULT_COMPONENTS, EXTRA_COMPONENTS, buildLines, normDomain } from './hosts';

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const blank = () => ({ name: '', consoleIp: '', rootDomain: '', components: [...DEFAULT_COMPONENTS], probePort: 443, remark: '' });

/** 前端预校验（仅为即时提示；最终以后端校验为准） */
export function validateMapping(f) {
  const e = {};
  const ip = f.consoleIp.trim();
  if (!f.name.trim()) e.name = '请输入名称';
  if (!isIPv4(ip) && !(ip.includes(':') && /^[0-9a-fA-F:.]+$/.test(ip))) e.consoleIp = 'IP 地址格式不正确，例如 192.168.27.150';
  if (!DOMAIN_RE.test(normDomain(f.rootDomain))) e.rootDomain = '根域名格式不正确，例如 openstack.svc.cluster.local';
  if (!f.components.length) e.components = '至少选择一个组件';
  if (!isPort(f.probePort)) e.probePort = '端口需为 1~65535';
  return e;
}

/**
 * MappingModal —— 新增 / 编辑域名映射：录入「控制台 IP + 根域名」，勾选组件，下方实时预览将写入的 hosts 行。
 * 属性：open / initial(编辑时传入映射) / errors(服务端字段错误) / saving / onSubmit(form) / onClose
 */
export default function MappingModal({ open, initial, errors = {}, saving, onSubmit, onClose }) {
  const [f, setF] = useState(blank);
  const [local, setLocal] = useState({});
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (!open) return;
    setF(initial ? { name: initial.name, consoleIp: initial.consoleIp, rootDomain: initial.rootDomain, components: [...initial.components], probePort: initial.probePort, remark: initial.remark } : blank());
    setLocal({}); setCustom('');
  }, [open, initial]);
  const err = { ...local, ...errors };
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setLocal((s) => ({ ...s, [k]: undefined })); };
  const toggle = (c, on) => setF((s) => ({ ...s, components: on ? [...s.components, c] : s.components.filter((x) => x !== c) }));
  const addCustom = () => {
    const c = custom.trim().toLowerCase();
    if (!LABEL_RE.test(c)) return setLocal((s) => ({ ...s, components: '组件名仅限小写字母、数字与连字符，且不含点' }));
    if (!f.components.includes(c)) setF((s) => ({ ...s, components: [...s.components, c] }));
    setCustom('');
    return undefined;
  };
  const submit = () => {
    const v = validateMapping(f);
    setLocal(v);
    if (Object.keys(v).length) return;
    onSubmit({ ...f, name: f.name.trim(), consoleIp: f.consoleIp.trim(), rootDomain: normDomain(f.rootDomain), probePort: Number(f.probePort), remark: f.remark.trim() });
  };
  const known = [...DEFAULT_COMPONENTS, ...EXTRA_COMPONENTS];
  const pool = [...known, ...f.components.filter((c) => !known.includes(c))];
  const lines = buildLines(f);

  return (
    <Modal open={open} width={640} title={initial ? '编辑域名映射' : '新增域名映射'} subtitle="录入云平台控制台 IP 与根域名，系统自动生成各组件的 hosts 记录" onClose={saving ? undefined : onClose}
      footer={<><button type="button" className="btn-default" disabled={saving} onClick={onClose}>取消</button><LoadingButton variant="primary" loading={saving} onClick={submit}>{initial ? '保存并同步' : '创建并同步'}</LoadingButton></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <FormField label="名称" required error={err.name}><input className="field" value={f.name} onChange={set('name')} placeholder="例如：私有云-生产" maxLength={64} /></FormField>
        <FormField label="云平台控制台 IP" required error={err.consoleIp}><input className="field" value={f.consoleIp} onChange={set('consoleIp')} placeholder="192.168.27.150" /></FormField>
        <FormField label="根域名" required error={err.rootDomain} className="sm:col-span-2" hint="组件域名 = 组件名 + . + 根域名，如 keystone.openstack.svc.cluster.local">
          <input className="field" value={f.rootDomain} onChange={set('rootDomain')} placeholder="openstack.svc.cluster.local" />
        </FormField>
      </div>
      <div className="mt-4">
        <div className="label">组件 {err.components && <span className="err-text inline ml-2">{err.components}</span>}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5 p-3 rounded-lg border border-line">
          {pool.map((c) => <Checkbox key={c} label={c} checked={f.components.includes(c)} onChange={(v) => toggle(c, v)} />)}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input className="field !w-52" aria-label="自定义组件名" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} placeholder="自定义组件名，如 trove" />
          <button type="button" className="btn-default btn-sm" onClick={addCustom}><Plus size={14} />添加</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <FormField label="连通性探测端口" error={err.probePort} hint="「校验」时探测 控制台IP:端口 是否可达，默认 443"><input className="field" value={f.probePort} onChange={set('probePort')} inputMode="numeric" /></FormField>
        <FormField label="备注" error={err.remark}><input className="field" value={f.remark} onChange={set('remark')} maxLength={255} /></FormField>
      </div>
      <div className="mt-4">
        <div className="label">将生成的 hosts 记录（{lines.length} 条）</div>
        <pre className="p-3 rounded-lg bg-muted text-[13px] text-fg font-mono overflow-x-auto min-h-[56px] whitespace-pre" aria-live="polite">{lines.length ? lines.join('\n') : '填写控制台 IP 与根域名后，这里实时预览'}</pre>
        {f.components.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{f.components.map((c) => <span key={c} className="tag-default">{c}<button type="button" aria-label={`移除 ${c}`} className="ml-1 hover:text-danger" onClick={() => toggle(c, false)}><X size={11} /></button></span>)}</div>}
      </div>
    </Modal>
  );
}
