import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import Switch from '../Switch';
import LoadingButton from '../LoadingButton';

// 内置 DNS / Docker 容器注入已在界面隐藏（后端能力保留，保存时沿用服务端原值）
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
 * SyncPanel —— 同步方式：本机 hosts（固定 /etc/hosts）。
 * 属性：sync(服务端配置) / canUpdate / saving / onSave(payload) / onDirty(bool)
 */
export default function SyncPanel({ sync, canUpdate, saving, onSave, onDirty }) {
  const [f, setF] = useState(() => toForm(sync));
  useEffect(() => setF(toForm(sync)), [sync]);
  const dirty = !same(f, toForm(sync));
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  return (
    <section className="card p-5" aria-label="同步方式">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-fg">同步方式</h3><p className="text-xs text-fg-muted mt-1">映射保存后按下列方式自动同步。</p></div>
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
      </div>
    </section>
  );
}
