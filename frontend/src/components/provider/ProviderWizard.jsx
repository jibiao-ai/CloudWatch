import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Info, PlugZap, Wand2, Save } from 'lucide-react';
import Modal from '../Modal';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import SecretInput from '../SecretInput';
import LoadingButton from '../LoadingButton';
import Switch from '../Switch';
import VerifyResult from './VerifyResult';
import { ENV_TYPES, OPENSTACK_COMPONENTS, PROTOCOLS } from '../../data/dict';
import { STEPS, buildEndpoints, emptyForm, toForm, toPayload, validateStep } from './providerForm';
import { providerApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';

/**
 * ProviderWizard —— 平台新增 / 编辑分步向导（毛玻璃卡片）：
 * ① 基本信息 ② 五端点配置 ③ 认证信息 ④ 资源类型约定 ⑤ 高级
 * 规则：不允许后台填写参数 —— 所有参数在向导内填写；密码保存后一律显示 ******，任何位置不回显。
 */
export default function ProviderWizard({ open, provider, onClose, onSaved }) {
  const editing = !!provider;
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => (provider ? toForm(provider) : emptyForm()));
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const passwordSet = !!provider?.auth?.passwordSet;

  const patch = (path, v) => {
    setDirty(true);
    setF((s) => {
      const n = { ...s };
      const [a, b] = path.split('.');
      if (b) n[a] = { ...s[a], [b]: v };
      else n[a] = v;
      return n;
    });
  };
  const inp = (path, extra = {}) => {
    const [a, b] = path.split('.');
    const val = b ? f[a][b] : f[a];
    return { value: val ?? '', onChange: (e) => patch(path, e.target.value), className: 'field', ...extra };
  };
  const goNext = () => {
    const e = validateStep(step, f, { editing, passwordSet });
    setErr(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const jump = (i) => {
    if (i <= step) return setStep(i);
    // 向前跳转须先通过之前所有步骤
    for (let k = 0; k < i; k += 1) {
      const e = validateStep(k, f, { editing, passwordSet });
      if (Object.keys(e).length) { setErr(e); setStep(k); return; }
    }
    setStep(i);
  };
  const autoFill = () => {
    if (!f.rootDomain.trim()) return setErr({ rootDomain: '请先在「基本信息」填写根域名' });
    patch('endpoints', buildEndpoints(f.rootDomain, f.endpointProtocol));
    setErr({});
    toast.info('已按根域名填充', `${f.endpointProtocol}://<组件>.${f.rootDomain.trim()}`);
  };
  const verify = async () => {
    for (let k = 0; k < 3; k += 1) {
      const e = validateStep(k, f, { editing, passwordSet });
      if (Object.keys(e).length) { setErr(e); setStep(k); toast.warning('请先补全必填项', '验证连接需要基本信息、端点与认证信息'); return; }
    }
    setVerifying(true); setResult(null);
    try { setResult(await providerApi.verifyProvider(provider?.id, toPayload(f))); }
    catch (e) { toast.error('验证失败', e.message); }
    finally { setVerifying(false); }
  };
  const save = async () => {
    for (let k = 0; k < STEPS.length; k += 1) {
      const e = validateStep(k, f, { editing, passwordSet });
      if (Object.keys(e).length) { setErr(e); setStep(k); return; }
    }
    setSaving(true);
    try {
      const body = toPayload(f);
      const saved = editing ? await providerApi.updateProvider(provider.id, body) : await providerApi.createProvider(body);
      toast.success(editing ? '平台已更新' : '平台已新增', `${saved.name}${!editing ? '，请点击「验证连接」确认可用' : ''}`);
      setF((s) => ({ ...s, auth: { ...s.auth, password: '' } }));
      onSaved(saved);
    } catch (e) {
      const m = /云管标识/.test(e.message) ? { name: e.message } : /控制台 IP/.test(e.message) ? { consoleIp: e.message } : null;
      if (m) { setErr(m); setStep(0); } else toast.error('保存失败', e.message);
    } finally { setSaving(false); }
  };
  const [leave, setLeave] = useState(false);
  const close = () => { if (dirty && !saving) { setLeave(true); return; } onClose(); };

  const E = (k) => err[k];
  return (
    <>
      <Modal open={open} width={760} onClose={close} closeOnMask={false} title={editing ? `编辑平台：${provider.name}` : '新增平台'} subtitle="分步填写并验证 OpenStack 平台接入参数（所有参数均在页面填写）"
        footer={<>
          <button type="button" className="btn-default" onClick={close}>取消</button>
          <div className="flex-1" />
          <LoadingButton icon={PlugZap} loading={verifying} onClick={verify}>验证连接</LoadingButton>
          {step > 0 && <button type="button" className="btn-default" onClick={() => setStep(step - 1)}><ChevronLeft size={15} /> 上一步</button>}
          {step < STEPS.length - 1 ? <button type="button" className="btn-primary" onClick={goNext}>下一步 <ChevronRight size={15} /></button>
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
          {step === 0 && (<>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="云管标识" required error={E('name')} hint="平台在云管中的唯一名称"><input {...inp('name', { placeholder: '例如：生产环境高性能云ES1', maxLength: 40 })} /></FormField>
              <FormField label="环境类型" required><CustomSelect value={f.envType} onChange={(v) => patch('envType', v)} options={ENV_TYPES} /></FormField>
              <FormField label="控制台 IP" required error={E('consoleIp')} hint="界面访问地址 / VIP，用于 hosts 映射"><input {...inp('consoleIp', { placeholder: '192.168.47.3' })} /></FormField>
              <FormField label="根域名" required error={E('rootDomain')} hint="每朵云独立的根域名，如 secs.cheryfs.cn"><input {...inp('rootDomain', { placeholder: 'secs.cheryfs.cn' })} /></FormField>
              <FormField label="芯片架构"><CustomSelect value={f.arch} onChange={(v) => patch('arch', v)} options={['X86（Intel）', 'X86（AMD）', 'ARM（鲲鹏）', 'ARM（飞腾）'].map((v) => ({ value: v, label: v }))} /></FormField>
              <FormField label="超融合节点数" error={E('nodeCount')}><input {...inp('nodeCount', { type: 'number', min: 0 })} /></FormField>
            </div>
          </>)}

          {step === 1 && (<>
            <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-primary-soft">
              <div className="w-[120px]"><label className="label">协议</label><CustomSelect value={f.endpointProtocol} onChange={(v) => patch('endpointProtocol', v)} options={PROTOCOLS} /></div>
              <button type="button" className="btn-primary" onClick={autoFill}><Wand2 size={15} /> 按根域名自动填充</button>
              <span className="text-xs text-fg-muted flex-1 min-w-[200px]">将生成 <code className="text-primary-text">{f.endpointProtocol}://&lt;组件&gt;.{f.rootDomain || '根域名'}</code></span>
            </div>
            <div className="flex gap-2 p-3 rounded-lg bg-warning-soft text-[13px] text-fg">
              <Info size={16} className="text-warning shrink-0 mt-0.5" />
              <div>各组件 API 入口封装为域名访问。请在<b>部署 CloudWatch 后端的机器</b>的 <code className="text-xs">/etc/hosts</code> 中做域名映射，例如：<code className="block mt-1 text-xs font-mono bg-card rounded px-2 py-1.5 border border-line">{f.consoleIp || '<控制台IP>'} keystone.{f.rootDomain || '<根域名>'} nova.{f.rootDomain || '<根域名>'} neutron.{f.rootDomain || '<根域名>'} cinder.{f.rootDomain || '<根域名>'} glance.{f.rootDomain || '<根域名>'}</code></div>
            </div>
            <div className="grid gap-4">
              {OPENSTACK_COMPONENTS.map((c) => (
                <FormField key={c.key} label={c.label} required error={E(`ep_${c.key}`)}>
                  <input className="field font-mono text-[13px]" value={f.endpoints[c.key]} onChange={(e) => patch('endpoints', { ...f.endpoints, [c.key]: e.target.value })} placeholder={`http://${c.key}.${f.rootDomain || 'openstack.svc.cluster.local'}`} />
                </FormField>
              ))}
            </div>
          </>)}

          {step === 2 && (<>
            <div className="flex gap-2 p-3 rounded-lg bg-info-soft text-[13px] text-fg"><Info size={16} className="text-info shrink-0 mt-0.5" />项目名称对应云平台的 project，仅管理加入该 project 的资源；如需管理全部资源，建议将资源统一加入一个 project 后对接。</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="用户名" required error={E('username')}><input {...inp('auth.username', { autoComplete: 'off' })} /></FormField>
              <FormField label="密码" required={!editing || !passwordSet} error={E('password')} hint={editing && passwordSet ? '已保存密码：留空表示不修改；输入新密码将覆盖' : undefined}>
                <SecretInput saved={editing && passwordSet} value={f.auth.password} onChange={(v) => patch('auth.password', v)} placeholder="请输入密码" error={!!E('password')} />
              </FormField>
              <FormField label="项目名称（project）" required error={E('projectName')}><input {...inp('auth.projectName')} /></FormField>
              <FormField label="用户域 ID" required error={E('userDomain')}><input {...inp('auth.userDomain')} /></FormField>
              <FormField label="项目域 ID" required error={E('projectDomain')}><input {...inp('auth.projectDomain')} /></FormField>
            </div>
            <p className="text-xs text-fg-muted">密码仅在保存时提交；保存后任何位置均显示为 ******，不会回显。</p>
          </>)}

          {step === 3 && (<>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="默认云硬盘类型" required error={E('defaultVolumeType')} hint="对应 Cinder volume type 名称，如 hdd / ssd"><input {...inp('conventions.defaultVolumeType')} /></FormField>
              <FormField label="默认域 ID" required error={E('defaultDomainId')}><input {...inp('conventions.defaultDomainId')} /></FormField>
            </div>
            <div className="rounded-lg border border-line divide-y divide-line">
              <div className="flex items-center justify-between gap-4 p-4"><div><div className="text-sm text-fg">默认从云硬盘启动</div><div className="text-xs text-fg-muted mt-0.5">创建云主机时使用 block_device_mapping_v2（source_type=image, boot_index=0）</div></div><Switch label="默认从云硬盘启动" checked={f.conventions.bootFromVolume} onChange={(v) => patch('conventions.bootFromVolume', v)} /></div>
              <div className="flex items-center justify-between gap-4 p-4"><div><div className="text-sm text-fg">云主机销毁时删除引导卷</div><div className="text-xs text-fg-muted mt-0.5">对应 delete_on_termination；生产环境建议关闭以防误删数据</div></div><Switch label="销毁时删除引导卷" checked={f.conventions.deleteOnTermination} onChange={(v) => patch('conventions.deleteOnTermination', v)} /></div>
            </div>
          </>)}

          {step === 4 && (<>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="请求超时（秒）" error={E('timeoutSec')}><input {...inp('advanced.timeoutSec', { type: 'number' })} /></FormField>
              <FormField label="同步间隔（分钟）" error={E('syncIntervalMin')}><input {...inp('advanced.syncIntervalMin', { type: 'number' })} /></FormField>
              <FormField label="Prometheus 地址" error={E('prometheusUrl')} hint="存储容量数据来源（query_range）"><input {...inp('advanced.prometheusUrl', { placeholder: 'http://192.168.47.3:9090' })} /></FormField>
              <FormField label="排除的存储池 ID" error={E('excludePoolIds')} hint="逗号分隔，如 8（可用 ceph osd lspools 查询）"><input {...inp('advanced.excludePoolIds', { placeholder: '8' })} /></FormField>
              <FormField label="nova-dashboard-api VIP" error={E('novaDashboardVip')} hint="计算节点资源消耗数据来源"><input {...inp('advanced.novaDashboardVip', { placeholder: '192.168.47.3' })} /></FormField>
            </div>
            <div className="rounded-lg border border-line divide-y divide-line">
              <div className="flex items-center justify-between gap-4 p-4"><div><div className="text-sm text-fg">校验 SSL 证书</div><div className="text-xs text-fg-muted mt-0.5">内网自签证书环境请关闭</div></div><Switch label="校验 SSL 证书" checked={f.advanced.verifySsl} onChange={(v) => patch('advanced.verifySsl', v)} /></div>
              <div className="flex items-center justify-between gap-4 p-4"><div><div className="text-sm text-fg">启用 EMLA 监控接口</div><div className="text-xs text-fg-muted mt-0.5">/apis/monitoring/v1/ecms/*；高版本环境可能已废弃，关闭后改用 Keystone domain_usage</div></div><Switch label="启用 EMLA" checked={f.advanced.enableEmla} onChange={(v) => patch('advanced.enableEmla', v)} /></div>
            </div>
            <FormField label="备注"><textarea className="field" rows={2} value={f.advanced.remark} onChange={(e) => patch('advanced.remark', e.target.value)} /></FormField>
          </>)}

          {(verifying || result) && <VerifyResult loading={verifying} result={result} />}
        </div>
      </Modal>
      <Modal open={leave} width={400} title="放弃未保存的修改？" onClose={() => setLeave(false)} footer={<><button type="button" className="btn-default" onClick={() => setLeave(false)}>继续编辑</button><button type="button" className="btn-danger" onClick={() => { setLeave(false); onClose(); }}>放弃并关闭</button></>}>
        <p className="text-sm text-fg-muted">当前向导中已填写的内容尚未保存，关闭后将丢失。</p>
      </Modal>
    </>
  );
}
