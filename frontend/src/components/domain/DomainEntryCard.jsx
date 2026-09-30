import React, { useRef, useState } from 'react';
import { CircleCheck, CircleX, Copy, FileBadge, Loader2, ShieldCheck, Star, Trash2, Upload } from 'lucide-react';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import { NETWORK_TYPES, PROTOCOLS } from '../../data/dict';
import { domainApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { copyText } from '../../utils/download';
import { formatDate } from '../../utils/format';

export const entryUrl = (e) => `${e.protocol}://${e.domain || e.ip}${(e.protocol === 'https' && Number(e.port) === 443) || (e.protocol === 'http' && Number(e.port) === 80) ? '' : `:${e.port}`}`;
const daysLeft = (d) => Math.ceil((new Date(d) - Date.now()) / 86400e3);

/** DomainEntryCard —— 单个访问入口：内网 IP / 域名 / 端口 / 协议 / 证书上传（格式与有效期校验）/ 校验（域名解析·连通性·证书链）/ 设为默认 / 复制访问地址 */
export default function DomainEntryCard({ entry, error = {}, canEdit, canVerify, canDelete, onChange, onDelete, onDefault }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (v) => onChange({ ...entry, [k]: v && v.target ? v.target.value : v });
  const cert = entry.cert;
  const expired = cert && daysLeft(cert.notAfter) < 0;
  const soon = cert && !expired && daysLeft(cert.notAfter) <= 30;

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 100 * 1024) return toast.error('证书文件过大', '证书文件不应超过 100KB');
    setUploading(true);
    try { const c = await domainApi.uploadCert(file); onChange({ ...entry, cert: c }); toast.success('证书已解析', `有效期至 ${c.notAfter}`); }
    catch (e) { toast.error('证书校验失败', e.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const verify = async () => {
    setVerifying(true); setResult(null);
    try { setResult(await domainApi.verifyDomainEntry(entry)); } catch (e) { toast.error('校验失败', e.message); } finally { setVerifying(false); }
  };
  const copy = async () => (await copyText(entryUrl(entry))) ? toast.success('已复制访问地址', entryUrl(entry)) : toast.error('复制失败');

  return (
    <section className="card p-5" aria-label={entry.name || '访问入口'}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-fg">{entry.name || '未命名入口'}</h3>
        <span className={entry.networkType === 'internal' ? 'tag-info' : 'tag-warning'}>{NETWORK_TYPES.find((n) => n.value === entry.networkType)?.label}</span>
        {entry.isDefault ? <span className="tag-primary"><Star size={11} />默认入口</span> : canEdit && <button type="button" className="text-[13px] text-primary-text hover:underline" onClick={onDefault}>设为默认</button>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="btn-default btn-sm" onClick={copy}><Copy size={14} />复制地址</button>
          {canDelete && <button type="button" className="btn-icon !w-8 !h-8 hover:!text-danger" aria-label="删除该入口" title={entry.isDefault ? '默认入口不可删除，请先设置其他默认' : '删除'} disabled={entry.isDefault} onClick={onDelete}><Trash2 size={15} /></button>}
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <FormField label="入口名称" required error={error.name}><input className="field" value={entry.name} disabled={!canEdit} onChange={set('name')} /></FormField>
        <FormField label="网络类型"><CustomSelect value={entry.networkType} disabled={!canEdit} onChange={set('networkType')} options={NETWORK_TYPES} /></FormField>
        <FormField label="协议"><CustomSelect value={entry.protocol} disabled={!canEdit} onChange={set('protocol')} options={PROTOCOLS} /></FormField>
        <FormField label="内网 IP" required error={error.ip}><input className="field" value={entry.ip} disabled={!canEdit} onChange={set('ip')} placeholder="192.168.27.200" /></FormField>
        <FormField label="域名" error={error.domain} hint="可留空，仅使用 IP 访问"><input className="field" value={entry.domain} disabled={!canEdit} onChange={set('domain')} placeholder="cloudwatch.example.cn" /></FormField>
        <FormField label="端口" required error={error.port}><input className="field" value={entry.port} disabled={!canEdit} onChange={set('port')} inputMode="numeric" /></FormField>
      </div>
      <div className="mt-4 p-3 rounded-lg bg-muted flex flex-wrap items-center gap-3 text-[13px]"><span className="text-fg-muted">访问地址</span><code className="text-fg break-all">{entryUrl(entry)}</code></div>

      {entry.protocol === 'https' && (
        <div className="mt-4">
          <div className="label">证书 {error.cert && <span className="err-text inline ml-2">{error.cert}</span>}</div>
          <div className={`rounded-lg border p-3 flex flex-wrap items-center gap-3 ${error.cert ? 'border-danger' : 'border-line'}`}>
            <FileBadge size={20} className={cert ? (expired ? 'text-danger' : 'text-success') : 'text-fg-subtle'} />
            {cert ? (
              <div className="flex-1 min-w-[200px] text-[13px]">
                <div className="text-fg font-medium">{cert.fileName}</div>
                <div className="text-fg-muted">颁发者：{cert.issuer} · 有效期 {formatDate(cert.notBefore)} ~ {formatDate(cert.notAfter)}
                  {expired ? <span className="tag-danger ml-2">已过期</span> : soon ? <span className="tag-warning ml-2">{daysLeft(cert.notAfter)} 天后过期</span> : <span className="tag-success ml-2">有效</span>}</div>
              </div>
            ) : <div className="flex-1 text-[13px] text-fg-muted">尚未上传证书（支持 .crt / .pem / .cer，≤100KB）</div>}
            {canEdit && <><input ref={fileRef} type="file" accept=".crt,.pem,.cer" className="sr-only" aria-label="上传证书文件" onChange={(e) => upload(e.target.files?.[0])} /><LoadingButton size="sm" icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>{cert ? '更换证书' : '上传证书'}</LoadingButton></>}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {canVerify && <LoadingButton icon={ShieldCheck} loading={verifying} onClick={verify}>校验</LoadingButton>}
        <span className="text-xs text-fg-muted">逐项检查：域名解析 / 连通性 / 证书链</span>
      </div>
      {(verifying || result) && (
        <ul className="mt-3 rounded-lg border border-line divide-y divide-line" aria-live="polite">
          {(result?.items || [{ key: 'dns', label: '域名解析' }, { key: 'connect', label: '连通性' }, { key: 'cert', label: '证书链' }]).map((it) => (
            <li key={it.key} className="px-3 py-2.5 flex items-start gap-2.5">
              {verifying ? <Loader2 size={16} className="animate-spin text-fg-subtle mt-0.5" /> : it.ok ? <CircleCheck size={16} className="text-success mt-0.5" /> : <CircleX size={16} className="text-danger mt-0.5" />}
              <div className="min-w-0 flex-1"><div className="text-sm text-fg">{it.label}</div>{!verifying && (it.ok ? <div className="text-xs text-success mt-0.5">{it.message}</div> : <div className="text-xs text-danger mt-0.5">{it.error}</div>)}</div>
            </li>))}
        </ul>
      )}
    </section>
  );
}
