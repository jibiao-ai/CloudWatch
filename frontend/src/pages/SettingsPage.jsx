import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import ConfirmModal from '../components/ConfirmModal';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Panel from '../components/settings/Panel';
import BasicSection from '../components/settings/BasicSection';
import BrandSection from '../components/settings/BrandSection';
import SecuritySection from '../components/settings/SecuritySection';
import RetentionSection from '../components/settings/RetentionSection';
import AlertChannels from '../components/settings/AlertChannels';
import { validateGroup, channelErrors } from '../components/settings/validate';
import { settingsApi } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useCan } from '../hooks/useCan';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store/useStore';

const GROUPS = [
  { key: 'basic', title: '基础信息', desc: '平台名称、副标题与版权信息，显示于登录页与侧栏' },
  { key: 'brand', title: '品牌信息', desc: 'Logo、登录背景与主色；主色即时预览，保存后全站生效（含暗色）' },
  { key: 'security', title: '安全策略', desc: '密码复杂度、会话与验证码、登录锁定；保存后由登录 / 改密 / 会话逻辑真实执行' },
  { key: 'retention', title: '数据保留', desc: '各类数据的保留天数；后端每小时按此清理过期数据' },
  { key: 'alertChannels', title: '告警渠道', desc: '邮件 / Webhook 通知渠道；可发送真实测试消息，密钥加密存库且不再回显' },
];
const TAB_ID = 'settings-tab';
const RESET_IMPACT = {
  brand: ['Logo、登录背景将被清除，主色恢复为系统默认（云观红）', '全站主题色立即变化'],
  alertChannels: ['所有告警渠道（含已保存的密钥）将被删除，告警将无法外发通知'],
  security: ['密码策略与登录锁定规则恢复默认，立即对所有用户生效'],
};

/**
 * SettingsPage —— 系统配置：横向分组标签（基础信息 / 品牌信息 / 安全策略 / 数据保留 / 告警渠道），一次只显示一个分组；
 * 底部「上一项 / 下一项」翻页；告警渠道列表自带分页。各分组独立保存到后端数据库；
 * 切换分组不丢失未保存修改（标签上以圆点提示）；校验以后端为准，字段级错误回填到对应输入。
 */
export default function SettingsPage() {
  const toast = useToast();
  const canUpdate = useCan('settings:update');
  const setBrand = useStore((s) => s.setBrand);
  const brandInStore = useStore((s) => s.brand);
  const { data, loading, error, reload } = useAsync(() => settingsApi.getSettings(), []);
  const [f, setF] = useState(null);
  const [errs, setErrs] = useState({});
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.slice(1);
    return GROUPS.some((g) => g.key === h) ? h : 'basic';
  });
  const [saving, setSaving] = useState('');
  const [reset, setReset] = useState(null);
  const orig = useRef(null);
  const committedColor = useRef(brandInStore.primaryColor);

  useEffect(() => { if (data) { setF(structuredClone(data)); orig.current = structuredClone(data); committedColor.current = data.brand.primaryColor; } }, [data]);
  useEffect(() => { window.history.replaceState(null, '', `#${tab}`); }, [tab]);
  // 主色仅在「品牌信息」标签内预览：切走即还原已保存主色，切回恢复预览；离开页面时同样还原
  useEffect(() => {
    if (!f) return;
    useStore.getState().previewPrimary(tab === 'brand' ? f.brand.primaryColor : committedColor.current);
  }, [tab, f?.brand.primaryColor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { useStore.getState().setBrand({ primaryColor: committedColor.current }); }, []);

  const dirty = (g) => !!f && JSON.stringify(f[g]) !== JSON.stringify(orig.current[g]);
  const patch = (g) => (p) => setF((s) => ({ ...s, [g]: { ...s[g], ...p } }));
  const chErrs = useMemo(() => channelErrors(errs), [errs]);
  const items = GROUPS.map((g) => ({ key: g.key, label: g.title, dot: dirty(g.key), count: g.key === 'alertChannels' && f ? f.alertChannels.length : undefined }));
  const goTab = (k) => { setTab(k); window.scrollTo({ top: 0 }); };

  /** 只把已保存的分组写回本地，其它分组的未保存修改原样保留 */
  const commit = (g, res) => {
    orig.current = { ...orig.current, [g]: structuredClone(res[g]) };
    setF((s) => ({ ...s, [g]: structuredClone(res[g]) }));
    if (g === 'basic') setBrand({ platformName: res.basic.platformName, subtitle: res.basic.subtitle, copyright: res.basic.copyright });
    if (g === 'brand') { committedColor.current = res.brand.primaryColor; setBrand({ ...res.brand }); }
  };
  const fieldErrorsOf = (g, ex) => {
    const fields = ex?.data?.fields;
    if (!fields) return false;
    setErrs((s) => ({ ...Object.fromEntries(Object.entries(s).filter(([k]) => !(g === 'alertChannels' ? k.startsWith('ch.') : k.startsWith(`${g}.`)))), ...fields }));
    toast.error('保存失败', Object.values(fields)[0]);
    return true;
  };

  const save = async (g) => {
    const e = validateGroup(g, f[g]);
    setErrs((s) => ({ ...Object.fromEntries(Object.entries(s).filter(([k]) => !(g === 'alertChannels' ? k.startsWith('ch.') : k.startsWith(`${g}.`)))), ...e }));
    if (Object.keys(e).length) return toast.warning('请修正标红字段后再保存');
    setSaving(g);
    try {
      commit(g, await settingsApi.updateSettings({ [g]: f[g] }));
      toast.success(`「${GROUPS.find((x) => x.key === g).title}」已保存`);
    } catch (ex) { if (!fieldErrorsOf(g, ex)) toast.error('保存失败', ex.message); } finally { setSaving(''); }
  };
  const doReset = async () => {
    setSaving('reset');
    try {
      commit(reset, await settingsApi.resetSettings(reset));
      setErrs({});
      toast.success('已恢复默认', GROUPS.find((x) => x.key === reset).title); setReset(null);
    } catch (ex) { toast.error('恢复失败', ex.message); } finally { setSaving(''); }
  };
  const revertBrand = () => { setF((s) => ({ ...s, brand: structuredClone(orig.current.brand) })); };

  if (loading) return <div className="space-y-4"><Skeleton.Block className="h-8 w-40" /><Skeleton.Block className="h-9 w-full max-w-xl" /><Skeleton.Chart height={180} /></div>;
  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  if (!f) return null;

  const idx = GROUPS.findIndex((g) => g.key === tab);
  const meta = GROUPS[idx];
  const common = { value: f[tab], errors: errs, disabled: !canUpdate, onChange: patch(tab) };
  const brandErrs = ['logoUrl', 'loginBgUrl', 'primaryColor'].map((k) => errs[`brand.${k}`]).filter(Boolean);
  const banner = tab === 'brand' && brandErrs.length > 0 && <div className="mx-5 mt-4 rounded-lg bg-danger-soft text-danger text-[13px] px-3 py-2" role="alert">{brandErrs.map((m) => <div key={m}>{m}</div>)}</div>;

  return (
    <div className="max-w-[1100px]">
      <PageHeader title="系统配置" description="基础信息 / 品牌信息 / 安全策略 / 数据保留 / 告警渠道。所有参数均在此页面设置并保存到数据库，无需改动后台配置文件" />
      <Tabs idPrefix={TAB_ID} items={items} value={tab} onChange={goTab} className="mb-4" />
      <Panel tabId={`${TAB_ID}-panel`} meta={meta} index={idx} total={GROUPS.length} prev={GROUPS[idx - 1]} next={GROUPS[idx + 1]} onGo={goTab}
        canUpdate={canUpdate} dirty={dirty(tab)} saving={saving === tab} onReset={() => setReset(tab)} onSave={() => save(tab)} onRevert={tab === 'brand' ? revertBrand : undefined} banner={banner}>
        {tab === 'basic' && <BasicSection {...common} />}
        {tab === 'brand' && <BrandSection value={f.brand} disabled={!canUpdate} onChange={patch('brand')} onPreviewColor={(c) => useStore.getState().previewPrimary(c)} />}
        {tab === 'security' && <SecuritySection {...common} />}
        {tab === 'retention' && <RetentionSection {...common} />}
        {tab === 'alertChannels' && <AlertChannels value={f.alertChannels} disabled={!canUpdate} errors={chErrs} onChange={(v) => setF((s) => ({ ...s, alertChannels: v }))} />}
      </Panel>
      <ConfirmModal open={!!reset} danger title={`恢复「${GROUPS.find((x) => x.key === reset)?.title || ''}」为默认值？`} description="该分组当前的配置将被覆盖为系统默认值，并立即写入数据库。"
        impactList={RESET_IMPACT[reset] || ['配置项恢复出厂默认']}
        confirmText="确认恢复" loading={saving === 'reset'} onCancel={() => setReset(null)} onConfirm={doReset} />
    </div>
  );
}
