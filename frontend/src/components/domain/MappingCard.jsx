import React, { useState } from 'react';
import { CircleCheck, CircleX, Copy, Loader2, MinusCircle, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import Switch from '../Switch';
import LoadingButton from '../LoadingButton';
import { domainApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { copyText } from '../../utils/download';
import { formatDateTime } from '../../utils/format';
import { linesOf } from './hosts';

const CHECKS = [{ key: 'local', label: '本机 hosts' }, { key: 'dns', label: '内置 DNS' }, { key: 'docker', label: 'Docker 容器' }, { key: 'connect', label: '控制台连通性' }];

/** MappingCard —— 一条域名映射：生成的 hosts 记录、启停、复制、逐项校验（本机 hosts / DNS / Docker / 连通性）、编辑、删除 */
export default function MappingCard({ m, canUpdate, canVerify, toggling, onToggle, onEdit, onDelete }) {
  const toast = useToast();
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const lines = linesOf(m);
  const copy = async () => ((await copyText(lines.join('\n'))) ? toast.success('已复制 hosts 记录', `${lines.length} 条`) : toast.error('复制失败'));
  const verify = async () => {
    setVerifying(true); setResult(null);
    try { setResult(await domainApi.verifyMapping(m.id)); } catch (e) { toast.error('校验失败', e.message); } finally { setVerifying(false); }
  };
  return (
    <section className={`card p-5 ${m.enabled ? '' : 'opacity-80'}`} aria-label={m.name}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-fg">{m.name}</h3>
        <span className={m.enabled ? 'tag-success' : 'tag-default'}>{m.enabled ? '已启用' : '已停用'}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {canUpdate && <span className="flex items-center gap-2 mr-2 text-[13px] text-fg-muted">启用<Switch checked={m.enabled} disabled={toggling} label={`${m.enabled ? '停用' : '启用'} ${m.name}`} onChange={onToggle} /></span>}
          <button type="button" className="btn-default btn-sm" onClick={copy}><Copy size={14} />复制</button>
          {canVerify && <LoadingButton size="sm" icon={ShieldCheck} loading={verifying} onClick={verify}>校验</LoadingButton>}
          {canUpdate && <button type="button" className="btn-default btn-sm" onClick={onEdit}><Pencil size={14} />编辑</button>}
          {canUpdate && <button type="button" className="btn-icon !w-8 !h-8 hover:!text-danger" aria-label={`删除 ${m.name}`} title="删除" onClick={onDelete}><Trash2 size={15} /></button>}
        </div>
      </div>
      <dl className="grid sm:grid-cols-4 gap-x-6 gap-y-2 mt-3 text-[13px]">
        <div><dt className="text-fg-muted">控制台 IP</dt><dd className="text-fg font-mono">{m.consoleIp}</dd></div>
        <div className="sm:col-span-2"><dt className="text-fg-muted">根域名</dt><dd className="text-fg font-mono break-all">{m.rootDomain}</dd></div>
        <div><dt className="text-fg-muted">探测端口</dt><dd className="text-fg font-mono">{m.probePort}</dd></div>
      </dl>
      <pre className="mt-3 p-3 rounded-lg bg-muted text-[13px] text-fg font-mono overflow-x-auto whitespace-pre" aria-label="生成的 hosts 记录">{lines.join('\n')}</pre>
      <p className="mt-2 text-xs text-fg-muted">{m.remark ? `${m.remark} · ` : ''}最后修改 {formatDateTime(m.updatedAt)}{m.updatedBy ? ` · ${m.updatedBy}` : ''}</p>
      {(verifying || result) && (
        <ul className="mt-3 rounded-lg border border-line divide-y divide-line" aria-live="polite">
          {(result?.items || CHECKS).map((it) => {
            const skipped = !verifying && it.skipped;
            const Icon = verifying ? Loader2 : skipped ? MinusCircle : it.ok ? CircleCheck : CircleX;
            const color = verifying ? 'text-fg-subtle animate-spin' : skipped ? 'text-fg-subtle' : it.ok ? 'text-success' : 'text-danger';
            return (
              <li key={it.key} className="px-3 py-2.5 flex items-start gap-2.5">
                <Icon size={16} className={`${color} mt-0.5 shrink-0`} />
                <div className="min-w-0 flex-1"><div className="text-sm text-fg">{it.label}</div>{!verifying && (it.ok ? <div className="text-xs text-fg-muted mt-0.5 break-all">{it.message}</div> : <div className="text-xs text-danger mt-0.5 break-all">{it.error}</div>)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
