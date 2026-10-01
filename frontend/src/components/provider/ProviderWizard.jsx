import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Globe, Info, PlugZap, Save } from 'lucide-react';
import Modal from '../Modal';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import SecretInput from '../SecretInput';
import LoadingButton from '../LoadingButton';
import VerifyResult from './VerifyResult';
import { ENV_TYPES } from '../../data/dict';
import { FIELD_STEP, STEPS, accessReady, componentHosts, emptyForm, toForm, toPayload, validateStep } from './providerForm';
import { providerApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ARCHS = ['X86（Intel）', 'X86（AMD）', 'ARM（鲲鹏）', 'ARM（飞腾）'].map((v) => ({ value: v, label: v }));
const ACCESS_KEYS = new Set(['consoleIp', 'rootDomain', 'auth']);

/**
 * ProviderWizard —— 平台新增 / 编辑分步向导：① 基本信息 ② 认证信息 ③ 高级（请求超时 / 同步间隔 / 备注）
 * 「验证连接」：基本信息 + 认证信息全部填写完整后才可用并高亮；点击后按根域名自动补全七个组件域名
 * （<keystone|neutron|nova|cinder|glance|gnocchi|emla>.<根域名>），逐个验证 HTTP 连通性，并验证能否从 Keystone 拿到 Token。
 * 密码保存后一律显示 ******，任何位置不回显。
 */
export default function ProviderWizard({ open, provider, onClose, onSaved, onVerified }) {
  const editing = !!provider;
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => (provider ? toForm(provider) : emptyForm()));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState(false);
  const passwordSet = !!provider?.auth?.passwordSet;
  const ctx = { editing, passwordSet };
  const ready = accessReady(f, ctx);
  const hosts = useMemo(() => componentHosts(f.rootDomain), [f.rootDomain]);

  const patch = (path, v) => {
    setDirty(true);
    const [a, b] = path.split('.');
    if (ACCESS_KEYS.has(a)) setResult(null); // 接入信息变了，旧的验证结论作废
    setErr((e) => { const n = { ...e }; delete n[b || a]; return n; });
    setF((s) => (b ? { ...s, [a]: { ...s[a], [b]: v } } : { ...s, [a]: v }));
  };
  const inp = (path, extra = {}) => {
    const [a, b] = path.split('.');
    return { value: (b ? f[a][b] : f[a]) ?? '', onChange: (e) => patch(path, e.target.value), className: 'field', ...extra };
  };
  const goNext = () => {
    const e = validateStep(step, f, ctx);
    setErr(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const jump = (i) => {
    if (i <= step) return setStep(i);
    for (let k = 0; k < i; k += 1) {
      const e = validateStep(k, f, ctx);
      if (Object.keys(e).length) { setErr(e); setStep(k); return; }
    }
    setStep(i);
  };
  const showFieldErrors = (fields) => {
    setErr(fields);
    const first = Math.min(...Object.keys(fields).map((k) => FIELD_STEP[k] ?? 0));
    setStep(Number.isFinite(first) ? first : 0);
  };

  const verify = async () => {
    setStep(1); setVerifying(true); setResult(null);
    try { setResult(await providerApi.verifyProvider(provider?.id, toPayload(f))); }
    catch (e) { if (e.data?.fields) showFieldErrors(e.data.fields); else toast.error('验证失败', e.message); }
    finally { setVerifying(false); }
  };
  const save = async () => {
    for (let k = 0; k < STEPS.length; k += 1) {
      const e = validateStep(k, f, ctx);
      if (Object.keys(e).length) { setErr(e); setStep(k); return; }
    }
    setSaving(true);
    try {
      const body = toPayload(f);
      const saved = editing ? await providerApi.updateProvider(provider.id, body) : await providerApi.createProvider(body);
      toast.success(editing ? '平台已更新' : '平台已新增', saved.name);
      // 保存后后台立即用已落库的凭据复验一次，让列表「状态」反映真实连通性
      providerApi.verifyProvider(saved.id).catch(() => {}).finally(() => onVerified?.());
      onSaved(saved);
    } catch (e) {
      if (e.data?.fields) showFieldErrors(e.data.fields); else toast.error('保存失败', e.message);
    } finally { setSaving(false); }
  };
  const close = () => { if (dirty && !saving) { setLeave(true); return; } onClose(); };

  const E = (k) => err[k];
  const last = step === STEPS.length - 1;
  const verified = !!result?.ok;
  const highlightVerify = ready && !verified;
  return (
    <>
      <Modal open={open} width={760} onClose={close} closeOnMask={false} title={editing ? `编辑平台：${provider.name}` : '新增平台'} subtitle="填写基本信息与认证信息后验证连接，再保存接入（所有参数均在页面填写）"
        footer={<>
          <button type="button" className="btn-default" onClick={close}>取消</button>
          <div className="flex-1" />
          <LoadingButton id="provider-verify-btn" variant={highlightVerify ? 'primary' : 'default'} icon={PlugZap} loading={verifying} disabled={!ready}
            title={ready ? '按根域名自动补全七个组件域名，验证 HTTP 连通性并获取 Keystone Token' : '请先填写完整的基本信息与认证信息'} onClick={verify}>验证连接</LoadingButton>
          {step > 0 && <button type="button" className="btn-default" onClick={() => setStep(step - 1)}><ChevronLeft size={15} /> 上一步</button>}
          {!last ? <button type="button" className={highlightVerify && step === 1 ? 'btn-default' : 'btn-primary'} onClick={goNext}>下一步 <ChevronRight size={15} /></button>
            : <LoadingButton variant="primary" icon={Save} loading={saving} onClick={save}>{editing ? '保存修改' : '保存并接入'}</LoadingButton>}
        </>}>
        <ol className="flex items-center mb-6" aria-label="向导步骤">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center flex-1 last:flex-none">
              <button type="button" onClick={() => jump(i)} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-2 group">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${i < step ? 'bg-primary text-primary-on' : i === step ? 'bg-primary-soft text-primary-text ring-2 ring-primary' : 'bg-muted text-fg-muted'}`}>{i < step ? <Check size={14} /> : i + 1}</span>
                <span className={`text-[13px] hidden sm:block ${i === step ? 'text-fg font-medium' : 'text-fg-muted'}`}>{s.title}</span>
              </button>
              {i < STEPS.length - 1 && <span className={`flex-1 h-px mx-3 ${i < step ? 'bg-primary' : 'bg-line'}`} />}
            </li>
          ))}
        </ol>

        <div className="space-y-4 min-h-[300px]">
          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="云贯标" required error={E('name')} hint="平台在云管中的唯一名称"><input {...inp('name', { placeholder: '例如：生产环境高性能云ES1', maxLength: 40 })} /></FormField>
              <FormField label="环境类型" required><CustomSelect value={f.envType} onChange={(v) => patch('envType', v)} options={ENV_TYPES} /></FormField>
              <FormField label="控制台 IP" required error={E('consoleIp')} hint="界面访问地址 / VIP"><input {...inp('consoleIp', { placeholder: '192.168.27.150' })} /></FormField>
              <FormField label="根域名" required error={E('rootDomain')} hint="各组件域名 = <组件>.<根域名>，如 openstack.svc.cluster.local"><input {...inp('rootDomain', { placeholder: 'openstack.svc.cluster.local' })} /></FormField>
              <FormField label="芯片架构"><CustomSelect value={f.arch} onChange={(v) => patch('arch', v)} options={ARCHS} /></FormField>
              <FormField label="超融合节点数" error={E('nodeCount')}><input {...inp('nodeCount', { type: 'number', min: 0 })} /></FormField>
            </div>
          )}

          {step === 1 && (<>
            <div className="flex gap-2 p-3 rounded-lg bg-info-soft text-[13px] text-fg"><Info size={16} className="text-info shrink-0 mt-0.5" />项目名称对应云平台的 project，仅管理加入该 project 的资源；如需管理全部资源，建议将资源统一加入一个 project 后对接。</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="用户名" required error={E('username')}><input {...inp('auth.username', { autoComplete: 'off' })} /></FormField>
              <FormField label="密码" required={!editing || !passwordSet} error={E('password')} hint={editing && passwordSet ? '已保存密码：留空表示不修改；输入新密码将覆盖' : undefined}>
                <SecretInput saved={editing && passwordSet} value={f.auth.password} onChange={(v) => patch('auth.password', v)} placeholder="请输入密码" error={!!E('password')} />
              </FormField>
              <FormField label="项目名称（project）" required error={E('projectName')}><input {...inp('auth.projectName')} /></FormField>
              <FormField label="用户域" required error={E('userDomain')}><input {...inp('auth.userDomain')} /></FormField>
              <FormField label="项目域" required error={E('projectDomain')}><input {...inp('auth.projectDomain')} /></FormField>
            </div>
            <p className="text-xs text-fg-muted">密码仅在保存时提交并加密存库；保存后任何位置均显示为 ******，不会回显。</p>
            <section aria-label="组件域名" id="component-hosts" className="rounded-lg border border-line">
              <header className="px-4 py-2.5 bg-muted flex items-center gap-1.5 text-[13px] font-medium text-fg"><Globe size={15} /> 组件域名（按根域名自动补全）</header>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
                {hosts.map((h) => <li key={h.key} className="flex gap-2 min-w-0"><span className="w-12 text-fg-muted shrink-0">{h.key}</span><code className="break-all">{h.host || `${h.key}.<根域名>`}</code></li>)}
              </ul>
              {!ready && <p className="px-4 pb-3 text-xs text-fg-muted">基本信息与认证信息填写完整后，「验证连接」按钮将高亮，可验证以上七个域名的 HTTP 连通性及能否从 Keystone 获取 Token。</p>}
            </section>
            {(verifying || result) && <VerifyResult loading={verifying} result={result} hosts={hosts} />}
          </>)}

          {step === 2 && (<>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="请求超时（秒）" error={E('timeoutSec')} hint="验证连接与同步时，每个请求的超时时间"><input {...inp('advanced.timeoutSec', { type: 'number' })} /></FormField>
              <FormField label="同步间隔（分钟）" error={E('syncIntervalMin')} hint="后台按该间隔自动同步该平台资源"><input {...inp('advanced.syncIntervalMin', { type: 'number' })} /></FormField>
              <FormField label="告警同步间隔（秒）" error={E('alertIntervalSec')} hint="独立于资源同步：按该间隔拉取告警并推送到告警渠道（10~3600，默认 60）"><input {...inp('advanced.alertIntervalSec', { type: 'number' })} /></FormField>
            </div>
            <FormField label="备注" error={E('remark')}><textarea className="field" rows={3} maxLength={255} value={f.advanced.remark} onChange={(e) => patch('advanced.remark', e.target.value)} /></FormField>
          </>)}
        </div>
      </Modal>
      <Modal open={leave} width={400} title="放弃未保存的修改？" onClose={() => setLeave(false)} footer={<><button type="button" className="btn-default" onClick={() => setLeave(false)}>继续编辑</button><button type="button" className="btn-danger" onClick={() => { setLeave(false); onClose(); }}>放弃并关闭</button></>}>
        <p className="text-sm text-fg-muted">当前向导中已填写的内容尚未保存，关闭后将丢失。</p>
      </Modal>
    </>
  );
}
