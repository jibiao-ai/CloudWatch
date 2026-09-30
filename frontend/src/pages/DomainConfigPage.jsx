import React, { useEffect, useRef, useState } from 'react';
import { Copy, Info, Plus, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DomainEntryCard, { entryUrl } from '../components/domain/DomainEntryCard';
import LoadingButton from '../components/LoadingButton';
import ConfirmModal from '../components/ConfirmModal';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import { domainApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { isDomain, isIPv4, isPort } from '../utils/validators';
import { copyText } from '../utils/download';

let seq = 0;
const newEntry = () => ({ id: `new_${Date.now()}_${seq++}`, networkType: 'internal', name: '新入口', ip: '', domain: '', port: 443, protocol: 'https', cert: null, isDefault: false });
const daysLeft = (d) => Math.ceil((new Date(d) - Date.now()) / 86400e3);

/** DomainConfigPage —— 域名配置：多环境入口（内网/外网）可增删、可设默认；保存后提示生效方式；登录页访问地址读此配置 */
export default function DomainConfigPage() {
  const toast = useToast();
  const canUpdate = useCan('domain:update');
  const canVerify = useCan('domain:verify');
  const { data, loading, error, reload } = useAsync(() => domainApi.getDomainConfig(), []);
  const [entries, setEntries] = useState([]);
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [delId, setDelId] = useState(null);
  const orig = useRef('');
  useEffect(() => { if (data) { setEntries(data.entries); orig.current = JSON.stringify(data.entries); } }, [data]);
  const dirty = JSON.stringify(entries) !== orig.current;
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = (id, e) => setEntries((l) => l.map((x) => (x.id === id ? e : x)));
  const setDefault = (id) => setEntries((l) => l.map((x) => ({ ...x, isDefault: x.id === id })));
  const validate = () => {
    const all = {};
    entries.forEach((e) => {
      const r = {};
      if (!e.name.trim()) r.name = '请输入入口名称';
      if (!isIPv4(e.ip)) r.ip = 'IP 格式不正确';
      if (e.domain && !isDomain(e.domain)) r.domain = '域名格式不正确';
      if (!isPort(e.port)) r.port = '端口需为 1~65535';
      if (e.protocol === 'https') {
        if (!e.cert) r.cert = 'HTTPS 入口需要上传证书';
        else if (daysLeft(e.cert.notAfter) < 0) r.cert = `证书已于 ${e.cert.notAfter} 过期，请更换`;
      }
      if (Object.keys(r).length) all[e.id] = r;
    });
    return all;
  };
  const save = async () => {
    const v = validate();
    setErrs(v);
    if (Object.keys(v).length) return toast.warning('存在未通过校验的入口', '请根据字段提示修正后再保存');
    setSaving(true);
    try {
      const res = await domainApi.saveDomainConfig({ entries: entries.map((e) => ({ ...e, port: Number(e.port), domain: e.domain.trim(), ip: e.ip.trim() })) });
      setEntries(res.entries); orig.current = JSON.stringify(res.entries); setSaved(res);
      toast.success('域名配置已保存', res.effectHint);
    } catch (e) { toast.error('保存失败', e.message); } finally { setSaving(false); }
  };
  const def = entries.find((e) => e.isDefault);
  return (
    <div>
      <PageHeader title="域名配置" description="维护平台自身的访问入口（内网 / 外网）；登录页展示的访问地址读取此配置" actions={canUpdate && <>
        <button type="button" className="btn-default" onClick={() => setEntries((l) => [...l, newEntry()])}><Plus size={15} /> 新增入口</button>
        <LoadingButton variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={save}>保存配置</LoadingButton></>} />
      {loading ? <Skeleton.Chart height={260} /> : error ? <div className="card"><ErrorState error={error} onRetry={reload} /></div> : (
        <div className="space-y-4">
          {saved && (
            <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-lg bg-info-soft text-[13px] text-fg" role="status">
              <Info size={16} className="text-info shrink-0" /><span><b>{saved.effectHint}</b>。默认访问地址：</span>
              <code className="px-2 py-1 rounded bg-card border border-line">{def && entryUrl(def)}</code>
              <button type="button" className="btn-default btn-sm" onClick={async () => (await copyText(entryUrl(def))) && toast.success('已复制', entryUrl(def))}><Copy size={13} />一键复制</button>
            </div>
          )}
          {dirty && <div className="text-[13px] text-warning" role="status">有未保存的修改</div>}
          {entries.map((e) => (
            <DomainEntryCard key={e.id} entry={e} error={errs[e.id]} canEdit={canUpdate} canVerify={canVerify} canDelete={canUpdate && entries.length > 1}
              onChange={(n) => update(e.id, n)} onDefault={() => setDefault(e.id)} onDelete={() => setDelId(e.id)} />
          ))}
        </div>
      )}
      <ConfirmModal open={!!delId} danger title="删除该访问入口？" targets={[entries.find((e) => e.id === delId)?.name || '']} impactList={['保存配置后生效', '使用该地址访问的用户将无法再通过它登录']} confirmText="确认删除" onCancel={() => setDelId(null)} onConfirm={() => { setEntries((l) => l.filter((x) => x.id !== delId)); setDelId(null); }} />
    </div>
  );
}
