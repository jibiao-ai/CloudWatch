import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import Switch from '../Switch';
import FormField from '../FormField';
import LoadingButton from '../LoadingButton';

const toForm = (s) => ({ ...s, dnsUpstreams: (s.dnsUpstreams || []).join(', ') });
const split = (t) => t.split(/[\s,;，]+/).map((x) => x.trim()).filter(Boolean);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function Channel({ title, desc, checked, disabled, onChange, children }) {
  return (
    <section className="rounded-lg border border-line p-4" aria-label={title}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1"><h4 className="text-sm font-medium text-fg">{title}</h4><p className="text-xs text-fg-muted mt-0.5">{desc}</p></div>
        <Switch checked={checked} disabled={disabled} label={`${checked ? '关闭' : '开启'}${title}`} onChange={onChange} />
      </div>
      {checked && <div className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>}
    </section>
  );
}

/**
 * SyncPanel —— 同步方式：本机 hosts（固定 /etc/hosts）/ 内置 DNS / Docker（固定作用于所有运行中容器）。
 * 属性：sync(服务端配置) / dnsAddr(内置 DNS 实际监听) / canUpdate / errors(sync.* 字段错误) / saving / onSave(payload) / onDirty(bool)
 */
export default function SyncPanel({ sync, dnsAddr, canUpdate, errors = {}, saving, onSave, onDirty }) {
  const [f, setF] = useState(() => toForm(sync));
  useEffect(() => setF(toForm(sync)), [sync]);
  const dirty = !same(f, toForm(sync));
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const inp = (k) => ({ className: 'field', value: f[k], disabled: !canUpdate, onChange: (e) => set(k)(e.target.value) });

  return (
    <section className="card p-5" aria-label="同步方式">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-fg">同步方式</h3><p className="text-xs text-fg-muted mt-1">映射保存后按下列方式自动同步；可同时开启多种。</p></div>
        {canUpdate && <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-warning">未保存</span>}
          {dirty && <button type="button" className="btn-ghost btn-sm" onClick={() => setF(toForm(sync))}>撤销</button>}
          <LoadingButton size="sm" variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={() => onSave({ ...f, dnsUpstreams: split(f.dnsUpstreams) })}>保存并同步</LoadingButton>
        </div>}
      </div>
      <div className="space-y-3">
        <Channel title="本机 hosts 文件" desc="把生成的记录写入本机 /etc/hosts 的受控区块，区块外的原有内容不会被改动" checked={f.localEnabled} disabled={!canUpdate} onChange={set('localEnabled')}>
          <div className="sm:col-span-2 text-[13px] text-fg-muted">目标文件：<code className="px-1.5 py-0.5 rounded bg-muted text-fg font-mono">/etc/hosts</code>（固定，不可修改）</div>
        </Channel>
        <Channel title="内置 DNS 服务" desc="平台自带解析服务，容器通过 --dns 指向本机即可按域名解析，无需逐个写入 hosts" checked={f.dnsEnabled} disabled={!canUpdate} onChange={set('dnsEnabled')}>
          <FormField label="监听地址" error={errors['sync.dnsListen']} hint={dnsAddr ? `当前实际监听：${dnsAddr}` : '53 端口需要特权，可改用高位端口'}><input {...inp('dnsListen')} placeholder="0.0.0.0:53" spellCheck={false} /></FormField>
          <FormField label="上游 DNS（可选）" error={errors['sync.dnsUpstreams']} hint="非受管域名转发到这些地址，多个用逗号分隔"><input {...inp('dnsUpstreams')} placeholder="223.5.5.5, 114.114.114.114" spellCheck={false} /></FormField>
          <p className="sm:col-span-2 text-xs text-fg-muted bg-muted rounded-lg p-2.5 font-mono break-all">docker run --dns &lt;本机IP&gt; …　或在 /etc/docker/daemon.json 中配置 {'{"dns":["<本机IP>"]}'}</p>
        </Channel>
        <Channel title="Docker 容器注入" desc="把记录写入本机所有运行中容器的 /etc/hosts；容器重启、新建后自动重新注入" checked={f.dockerEnabled} disabled={!canUpdate} onChange={set('dockerEnabled')}>
          <FormField label="Docker Socket" error={errors['sync.dockerSocket']}><input {...inp('dockerSocket')} placeholder="/var/run/docker.sock" spellCheck={false} /></FormField>
          <div className="text-[13px] text-fg-muted self-end pb-2">注入范围：<b className="text-fg font-medium">所有运行中的容器</b>（固定）</div>
        </Channel>
      </div>
    </section>
  );
}
