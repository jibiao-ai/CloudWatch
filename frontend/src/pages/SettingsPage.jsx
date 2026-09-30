import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import FormField from '../components/FormField';
import Switch from '../components/Switch';
import LoadingButton from '../components/LoadingButton';
import ConfirmModal from '../components/ConfirmModal';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import BrandSection from '../components/settings/BrandSection';
import AlertChannels, { validateChannel } from '../components/settings/AlertChannels';
import { settingsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store/useStore';
import { isEmail } from '../utils/validators';

const GROUPS = [
  { key: 'basic', title: '基础信息', desc: '平台名称、副标题与版权信息，显示于登录页与侧栏' },
  { key: 'brand', title: '品牌', desc: 'Logo、登录背景与主色；主色即时预览，保存后全站生效（含暗色）' },
  { key: 'security', title: '安全策略', desc: '密码复杂度、会话与验证码、登录锁定' },
  { key: 'retention', title: '数据保留', desc: '各类数据在平台内的保留天数' },
  { key: 'alertChannels', title: '告警渠道', desc: '邮件 / Webhook 通知渠道；密钥类字段保存后不再回显' },
];
const num = (v) => (v === '' ? '' : Number(v));

/** SettingsPage —— 系统配置：分组卡片，每组独立保存；密钥永不回显；「恢复默认」二次确认 */
export default function SettingsPage() {
  const toast = useToast();
  const canUpdate = useCan('settings:update');
  const setBrand = useStore((s) => s.setBrand);
  const brandInStore = useStore((s) => s.brand);
  const { data, loading, error, reload } = useAsync(() => settingsApi.getSettings(), []);
  const [f, setF] = useState(null);
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState('');
  const [reset, setReset] = useState(null);
  const orig = useRef(null);
  const committedColor = useRef(brandInStore.primaryColor);

  useEffect(() => { if (data) { setF(structuredClone(data)); orig.current = data; committedColor.current = data.brand.primaryColor; } }, [data]);
  // 离开页面时若主色仅预览未保存 → 还原
  useEffect(() => () => { useStore.getState().setBrand({ primaryColor: committedColor.current }); }, []);

  const dirty = (g) => f && JSON.stringify(f[g]) !== JSON.stringify(orig.current[g]);
  const patch = (g, p) => setF((s) => ({ ...s, [g]: { ...s[g], ...p } }));
  const fieldIn = (g, k, extra = {}) => ({ className: `field ${errs[`${g}.${k}`] ? 'field-error' : ''}`, value: f[g][k] ?? '', disabled: !canUpdate, onChange: (e) => patch(g, { [k]: e.target.value }), ...extra });
  const numIn = (g, k) => fieldIn(g, k, { inputMode: 'numeric', onChange: (e) => patch(g, { [k]: num(e.target.value.replace(/\D/g, '')) }) });

  const validate = (g) => {
    const e = {};
    const v = f[g];
    if (g === 'basic') {
      if (!v.platformName.trim()) e['basic.platformName'] = '请输入平台名称';
      else if (v.platformName.length > 24) e['basic.platformName'] = '不超过 24 个字符';
      if (v.supportEmail && !isEmail(v.supportEmail)) e['basic.supportEmail'] = '邮箱格式不正确';
    }
    if (g === 'security') {
      if (!(v.minLength >= 6 && v.minLength <= 64)) e['security.minLength'] = '6~64';
      [['expireDays', 0, 3650], ['sessionTimeoutMin', 5, 1440], ['maxSessions', 1, 20], ['captchaAfterFailures', 1, 10], ['lockThreshold', 3, 20], ['lockMinutes', 1, 1440]].forEach(([k, a, b]) => { if (!(v[k] >= a && v[k] <= b)) e[`security.${k}`] = `${a}~${b}`; });
    }
    if (g === 'retention') ['auditDays', 'metricDays', 'inspectionDays', 'alertDays'].forEach((k) => { if (!(v[k] >= 7 && v[k] <= 3650)) e[`retention.${k}`] = '7~3650 天'; });
    if (g === 'alertChannels') v.forEach((c) => { const r = validateChannel(c); if (Object.keys(r).length) e[`ch.${c.id}`] = r; });
    return e;
  };
  const save = async (g) => {
    const e = validate(g);
    setErrs(e);
    if (Object.keys(e).length) return toast.warning('请修正标红字段后再保存');
    setSaving(g);
    try {
      const res = await settingsApi.updateSettings({ [g]: f[g] });
      setF(structuredClone(res)); orig.current = res;
      if (g === 'basic') setBrand({ platformName: res.basic.platformName, subtitle: res.basic.subtitle, copyright: res.basic.copyright });
      if (g === 'brand') { committedColor.current = res.brand.primaryColor; setBrand({ ...res.brand }); }
      toast.success(`「${GROUPS.find((x) => x.key === g).title}」已保存`);
    } catch (ex) { toast.error('保存失败', ex.message); } finally { setSaving(''); }
  };
  const doReset = async () => {
    setSaving('reset');
    try {
      const res = await settingsApi.resetSettings(reset);
      setF(structuredClone(res)); orig.current = res;
      if (reset === 'brand') { committedColor.current = res.brand.primaryColor; setBrand({ ...res.brand }); }
      if (reset === 'basic') setBrand({ platformName: res.basic.platformName, subtitle: res.basic.subtitle });
      toast.success('已恢复默认', GROUPS.find((x) => x.key === reset).title); setReset(null);
    } catch (ex) { toast.error('恢复失败', ex.message); } finally { setSaving(''); }
  };
  const revertBrand = () => { patch('brand', orig.current.brand); useStore.getState().previewPrimary(orig.current.brand.primaryColor); };

  if (loading) return <div className="space-y-4"><Skeleton.Block className="h-8 w-40" /><Skeleton.Chart height={140} /><Skeleton.Chart height={140} /></div>;
  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  if (!f) return null;
  const E = (g, k) => errs[`${g}.${k}`];
  const toggles = [['requireUpper', '要求大写字母'], ['requireLower', '要求小写字母'], ['requireDigit', '要求数字'], ['requireSpecial', '要求特殊字符']];

  const Card = ({ g, children }) => {
    const meta = GROUPS.find((x) => x.key === g);
    return (
      <section className="card" aria-labelledby={`s-${g}`}>
        <header className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><h2 id={`s-${g}`} className="text-sm font-semibold text-fg">{meta.title}</h2><p className="text-xs text-fg-muted mt-0.5">{meta.desc}</p></div>
          {canUpdate && <div className="flex items-center gap-2">
            {dirty(g) && <span className="text-xs text-warning">未保存</span>}
            {g === 'brand' && dirty(g) && <button type="button" className="btn-ghost btn-sm" onClick={revertBrand}>撤销</button>}
            <button type="button" className="btn-default btn-sm" onClick={() => setReset(g)}><RotateCcw size={14} />恢复默认</button>
            <LoadingButton size="sm" variant="primary" icon={Save} loading={saving === g} disabled={!dirty(g)} onClick={() => save(g)}>保存</LoadingButton>
          </div>}
        </header>
        <div className="p-5">{children}</div>
      </section>
    );
  };
  return (
    <div className="max-w-[1100px]">
      <PageHeader title="系统配置" description="基础信息 / 品牌 / 安全策略 / 数据保留 / 告警渠道。所有参数均在此页面设置，无需改动后台配置文件" />
      <div className="space-y-5">
        <Card g="basic"><div className="grid md:grid-cols-2 gap-4">
          <FormField label="平台名称" required error={E('basic', 'platformName')}><input {...fieldIn('basic', 'platformName', { maxLength: 24 })} /></FormField>
          <FormField label="副标题"><input {...fieldIn('basic', 'subtitle')} /></FormField>
          <FormField label="版权信息"><input {...fieldIn('basic', 'copyright')} /></FormField>
          <FormField label="支持邮箱" error={E('basic', 'supportEmail')}><input {...fieldIn('basic', 'supportEmail')} /></FormField>
        </div></Card>

        <Card g="brand"><BrandSection value={f.brand} disabled={!canUpdate} onChange={(v) => setF((s) => ({ ...s, brand: v }))} onPreviewColor={(c) => useStore.getState().previewPrimary(c)} /></Card>

        <Card g="security">
          <div className="grid md:grid-cols-3 gap-4">
            <FormField label="密码最小长度" error={E('security', 'minLength')}><input {...numIn('security', 'minLength')} /></FormField>
            <FormField label="密码有效期（天，0 = 永不过期）" error={E('security', 'expireDays')}><input {...numIn('security', 'expireDays')} /></FormField>
            <FormField label="会话超时（分钟）" error={E('security', 'sessionTimeoutMin')}><input {...numIn('security', 'sessionTimeoutMin')} /></FormField>
            <FormField label="同账号最大会话数" error={E('security', 'maxSessions')}><input {...numIn('security', 'maxSessions')} /></FormField>
            <FormField label="失败几次后出现验证码" error={E('security', 'captchaAfterFailures')}><input {...numIn('security', 'captchaAfterFailures')} /></FormField>
            <FormField label="失败几次后锁定账号" error={E('security', 'lockThreshold')}><input {...numIn('security', 'lockThreshold')} /></FormField>
            <FormField label="锁定时长（分钟）" error={E('security', 'lockMinutes')}><input {...numIn('security', 'lockMinutes')} /></FormField>
          </div>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {toggles.map(([k, l]) => <div key={k} className="flex items-center justify-between rounded-lg border border-line px-4 py-3"><span className="text-sm text-fg">{l}</span><Switch label={l} checked={f.security[k]} disabled={!canUpdate} onChange={(v) => patch('security', { [k]: v })} /></div>)}
            <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3"><span className="text-sm text-fg">启用登录验证码</span><Switch label="启用登录验证码" checked={f.security.captchaEnabled} disabled={!canUpdate} onChange={(v) => patch('security', { captchaEnabled: v })} /></div>
          </div>
        </Card>

        <Card g="retention"><div className="grid md:grid-cols-4 gap-4">
          {[['auditDays', '审计日志（天）'], ['metricDays', '监控指标（天）'], ['inspectionDays', '巡检结果（天）'], ['alertDays', '告警记录（天）']].map(([k, l]) => <FormField key={k} label={l} error={E('retention', k)}><input {...numIn('retention', k)} /></FormField>)}
        </div></Card>

        <Card g="alertChannels"><AlertChannels value={f.alertChannels} disabled={!canUpdate} errors={Object.fromEntries(Object.entries(errs).filter(([k]) => k.startsWith('ch.')).map(([k, v]) => [k.slice(3), v]))} onChange={(v) => setF((s) => ({ ...s, alertChannels: v }))} /></Card>
      </div>
      <ConfirmModal open={!!reset} danger title={`恢复「${GROUPS.find((x) => x.key === reset)?.title || ''}」为默认值？`} description="该分组当前的配置将被覆盖为系统默认值。"
        impactList={reset === 'brand' ? ['Logo、登录背景将被清除，主色恢复为系统默认（云观红）', '全站主题色立即变化'] : reset === 'alertChannels' ? ['所有告警渠道将被删除，告警将无法外发通知'] : reset === 'security' ? ['密码策略与登录锁定规则恢复默认，可能影响已登录用户'] : ['配置项恢复出厂默认']}
        confirmText="确认恢复" loading={saving === 'reset'} onCancel={() => setReset(null)} onConfirm={doReset} />
    </div>
  );
}
