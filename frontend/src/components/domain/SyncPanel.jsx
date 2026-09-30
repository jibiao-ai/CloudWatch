import React, { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import Switch from '../Switch';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import { domainApi } from '../../services/api';

const MODES = [{ value: 'selected', label: '仅指定容器' }, { value: 'all', label: '所有运行中的容器' }];
const toForm = (s) => ({ ...s, dnsUpstreams: (s.dnsUpstreams || []).join(', '), dockerContainers: s.dockerContainers || [] });
const split = (t) => t.split(/[\s,;，]+/).map((x) => x.trim()).filter(Boolean);

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
 * SyncPanel —— 同步方式：本机 hosts 文件 / 内置 DNS（供容器 --dns 使用）/ Docker 容器直接注入。
 * 属性：sync(服务端配置) / dnsAddr(内置 DNS 实际监听) / canUpdate / errors(sync.* 字段错误) / saving / onSave(payload)
 */
export default function SyncPanel({ sync, dnsAddr, canUpdate, errors = {}, saving, onSave }) {
  const [f, setF] = useState(() => toForm(sync));
  const [ctn, setCtn] = useState({ list: [], loading: false, error: '' });
  useEffect(() => setF(toForm(sync)), [sync]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const inp = (k) => ({ className: 'field', value: f[k], disabled: !canUpdate, onChange: (e) => set(k)(e.target.value) });

  const loadContainers = async () => {
    setCtn((c) => ({ ...c, loading: true, error: '' }));
    try { const r = await domainApi.listContainers(f.dockerSocket); setCtn({ list: r.list || [], loading: false, error: '' }); } catch (e) { setCtn({ list: [], loading: false, error: e.message }); }
  };
  useEffect(() => { if (f.dockerEnabled && f.dockerMode === 'selected') loadContainers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f.dockerEnabled, f.dockerMode]);

  const options = [...ctn.list.map((c) => ({ value: c.name, label: c.name, hint: `${c.image} · ${c.state}` })),
    ...f.dockerContainers.filter((n) => !ctn.list.some((c) => c.name === n)).map((n) => ({ value: n, label: n, hint: '当前未运行' }))];
  const submit = () => onSave({ ...f, dnsUpstreams: split(f.dnsUpstreams) });

  return (
    <section className="card p-5" aria-label="同步方式">
      <h3 className="text-sm font-semibold text-fg">同步方式</h3>
      <p className="text-xs text-fg-muted mt-1 mb-4">映射保存后按下列方式自动同步；可同时开启多种。</p>
      <div className="space-y-3">
        <Channel title="本机 hosts 文件" desc="把生成的记录写入受控区块，区块外的原有内容不会被改动" checked={f.localEnabled} disabled={!canUpdate} onChange={set('localEnabled')}>
          <FormField label="hosts 文件路径" error={errors['sync.localPath']} className="sm:col-span-2"><input {...inp('localPath')} placeholder="/etc/hosts" spellCheck={false} /></FormField>
        </Channel>
        <Channel title="内置 DNS 服务" desc="平台自带解析服务，容器通过 --dns 指向本机即可按域名解析，无需逐个写入 hosts" checked={f.dnsEnabled} disabled={!canUpdate} onChange={set('dnsEnabled')}>
          <FormField label="监听地址" error={errors['sync.dnsListen']} hint={dnsAddr ? `当前实际监听：${dnsAddr}` : '53 端口需要特权，可改用高位端口'}><input {...inp('dnsListen')} placeholder="0.0.0.0:53" spellCheck={false} /></FormField>
          <FormField label="上游 DNS（可选）" error={errors['sync.dnsUpstreams']} hint="非受管域名转发到这些地址，多个用逗号分隔"><input {...inp('dnsUpstreams')} placeholder="223.5.5.5, 114.114.114.114" spellCheck={false} /></FormField>
          <p className="sm:col-span-2 text-xs text-fg-muted bg-muted rounded-lg p-2.5 font-mono break-all">docker run --dns &lt;本机IP&gt; …　或在 /etc/docker/daemon.json 中配置 {'{"dns":["<本机IP>"]}'}</p>
        </Channel>
        <Channel title="Docker 容器注入" desc="通过 Docker Engine API 把记录直接写入运行中容器的 /etc/hosts，容器重启后自动重新注入" checked={f.dockerEnabled} disabled={!canUpdate} onChange={set('dockerEnabled')}>
          <FormField label="Docker Socket" error={errors['sync.dockerSocket']}><input {...inp('dockerSocket')} placeholder="/var/run/docker.sock" spellCheck={false} /></FormField>
          <FormField label="注入范围" error={errors['sync.dockerMode']}><CustomSelect options={MODES} value={f.dockerMode} disabled={!canUpdate} onChange={set('dockerMode')} aria-label="注入范围" /></FormField>
          {f.dockerMode === 'selected' && (
            <FormField label="目标容器" className="sm:col-span-2" error={errors['sync.dockerContainers'] || ctn.error} hint={ctn.loading ? '正在读取容器列表…' : '修改 Socket 路径后点击右侧刷新按钮重新读取'}>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0"><CustomSelect multiple options={options} value={f.dockerContainers} disabled={!canUpdate} onChange={set('dockerContainers')} placeholder="选择要注入的容器" aria-label="目标容器" /></div>
                <button type="button" className="btn-default" onClick={loadContainers} disabled={ctn.loading} aria-label="刷新容器列表" title="刷新容器列表"><RefreshCw size={15} className={ctn.loading ? 'animate-spin' : ''} /></button>
              </div>
            </FormField>
          )}
        </Channel>
      </div>
      {canUpdate && <div className="flex justify-end mt-4"><LoadingButton variant="primary" icon={Save} loading={saving} onClick={submit}>保存并同步</LoadingButton></div>}
    </section>
  );
}
