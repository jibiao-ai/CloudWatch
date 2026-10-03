import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import Tabs from '../Tabs';
import Switch from '../Switch';
import Checkbox from '../Checkbox';
import Radio from '../Radio';
import FormField from '../FormField';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import { inspectionApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { WEEKDAYS } from './common';

/** [错误键, 名称, 预警字段, 异常字段, 单位, 说明] */
const PAIRS = [
  ['ssdLife', '固态盘已用寿命', 'ssdLifeWarn', 'ssdLifeBad', '%'],
  ['diskUsage', '物理磁盘使用率', 'diskUsageWarn', 'diskUsageBad', '%'],
  ['storage', '存储集群容量使用率', 'storageWarn', 'storageBad', '%'],
  ['pool', '存储池使用率', 'poolWarn', 'poolBad', '%'],
  ['runway', '容量预计耗尽天数（≤ 触发）', 'runwayWarnDays', 'runwayBadDays', '天'],
  ['vcpu', '云平台 vCPU 使用率', 'vcpuWarn', 'vcpuBad', '%'],
  ['mem', '云平台内存使用率', 'memWarn', 'memBad', '%'],
  ['nodeCpu', '物理节点 CPU 使用率', 'nodeCpuWarn', 'nodeCpuBad', '%'],
  ['nodeMem', '物理节点内存使用率', 'nodeMemWarn', 'nodeMemBad', '%'],
  ['diskIo', '节点磁盘 I/O 使用率', 'diskIoWarn', 'diskIoBad', '%'],
  ['latency', '节点磁盘 I/O 延迟', 'latencyWarn', 'latencyBad', 'ms'],
];
const SINGLES = [
  ['vmCpuHigh', '云主机 CPU 偏高阈值（当前或近 30 天平均 ≥）', 'vmCpuHigh', '%'],
  ['vmMemHigh', '云主机内存偏高阈值（当前或近 30 天平均 ≥）', 'vmMemHigh', '%'],
  ['staleMin', '监控数据过期时间', 'staleMin', '分钟'],
  ['listMax', '明细表最多列出行数', 'listMax', '行'],
];
const TABS = [{ key: 'th', label: '判定阈值' }, { key: 'sch', label: '定时与数据' }, { key: 'items', label: '检查项' }];

function Num({ value, onChange, label, unit, error }) {
  return (
    <div className="flex items-center gap-1.5">
      <input className={`field !h-8 !w-[84px] ${error ? 'field-error' : ''}`} type="number" min={0} step="any" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="text-xs text-fg-muted w-8">{unit}</span>
    </div>
  );
}

/** SettingsModal —— 巡检设置：判定阈值 / 定时巡检与数据来源 / 检查项启停 */
export default function SettingsModal({ open, onClose, catalog, groups, onSaved }) {
  const toast = useToast();
  const [tab, setTab] = useState('th');
  const [cfg, setCfg] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('th'); setErrs({});
    inspectionApi.getConfig().then((r) => { setCfg(structuredClone(r.config)); setDefaults(r.defaults); }).catch(() => {});
  }, [open]);

  const th = (k, v) => setCfg((c) => ({ ...c, thresholds: { ...c.thresholds, [k]: v } }));
  const sch = (k, v) => setCfg((c) => ({ ...c, schedule: { ...c.schedule, [k]: v } }));
  const toggleItem = (key, on) => setCfg((c) => ({ ...c, disabled: on ? c.disabled.filter((x) => x !== key) : [...c.disabled, key] }));

  const save = async () => {
    const t = Object.fromEntries(Object.entries(cfg.thresholds).map(([k, v]) => [k, Number(v)]));
    if (Object.values(t).some((v) => Number.isNaN(v))) { toast.error('保存失败', '阈值必须是数字'); return; }
    setBusy(true);
    try {
      const out = await inspectionApi.saveConfig({ ...cfg, thresholds: t, schedule: { ...cfg.schedule, weekday: Number(cfg.schedule.weekday) } });
      toast.success('巡检设置已保存');
      onSaved?.(out);
      onClose();
    } catch (e) {
      const f = e?.data?.fields;
      if (f) { setErrs(f); toast.error('保存失败', Object.values(f)[0]); } else toast.error('保存失败', e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title="巡检设置" subtitle="阈值、定时巡检与检查项；修改后对之后的巡检生效，历史报告不受影响" width={760} onClose={busy ? undefined : onClose}
      footer={<>
        <button type="button" className="btn-default mr-auto" disabled={busy || !defaults} onClick={() => { setCfg((c) => ({ ...c, thresholds: { ...defaults.thresholds } })); setErrs({}); }}>阈值恢复默认</button>
        <button type="button" className="btn-default" disabled={busy} onClick={onClose}>取消</button>
        <LoadingButton variant="primary" loading={busy} disabled={!cfg} onClick={save}>保存</LoadingButton>
      </>}>
      {cfg && (
        <div>
          <Tabs idPrefix="insp-set" items={TABS} value={tab} onChange={setTab} />
          <div id="insp-set-panel" className="pt-4 min-h-[360px]">
            {tab === 'th' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_150px_150px] gap-3 text-xs text-fg-muted px-1"><span>指标（≥ 即触发）</span><span>预警</span><span>异常</span></div>
                {PAIRS.map(([ek, label, w, b, unit]) => (
                  <div key={ek}>
                    <div className="grid grid-cols-[1fr_150px_150px] gap-3 items-center px-1">
                      <span className="text-sm text-fg">{label}</span>
                      <Num label={`${label}预警`} unit={unit} value={cfg.thresholds[w]} error={errs[ek]} onChange={(v) => th(w, v)} />
                      <Num label={`${label}异常`} unit={unit} value={cfg.thresholds[b]} error={errs[ek]} onChange={(v) => th(b, v)} />
                    </div>
                    {errs[ek] && <p className="err-text px-1" role="alert">{errs[ek]}</p>}
                  </div>
                ))}
                <div className="border-t border-line pt-3 space-y-2.5">
                  {SINGLES.map(([ek, label, k, unit]) => (
                    <div key={ek}>
                      <div className="grid grid-cols-[1fr_300px] gap-3 items-center px-1"><span className="text-sm text-fg">{label}</span><Num label={label} unit={unit} value={cfg.thresholds[k]} error={errs[ek]} onChange={(v) => th(k, v)} /></div>
                      {errs[ek] && <p className="err-text px-1" role="alert">{errs[ek]}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'sch' && (
              <div className="space-y-5 max-w-[520px]">
                <div className="flex items-center justify-between">
                  <div><div className="text-sm font-medium text-fg">定时巡检</div><div className="text-xs text-fg-muted mt-0.5">到点自动对全部云平台巡检并生成报告（东八区）</div></div>
                  <Switch label="定时巡检" checked={cfg.schedule.enabled} onChange={(v) => sch('enabled', v)} />
                </div>
                {cfg.schedule.enabled && (
                  <div className="space-y-4 pl-1">
                    <Radio aria-label="执行频率" value={cfg.schedule.mode} onChange={(v) => sch('mode', v)} options={[{ value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }]} />
                    {cfg.schedule.mode === 'weekly' && <FormField label="星期"><div className="w-[140px]"><CustomSelect value={cfg.schedule.weekday} onChange={(v) => sch('weekday', v)} options={WEEKDAYS} /></div></FormField>}
                    <FormField label="执行时间（HH:MM）" error={errs.time}><input className="field !w-[120px]" placeholder="02:00" maxLength={5} value={cfg.schedule.time} onChange={(e) => sch('time', e.target.value)} /></FormField>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-line pt-4">
                  <div><div className="text-sm font-medium text-fg">巡检前先实时采集</div><div className="text-xs text-fg-muted mt-0.5">开启后巡检前会实时调用云平台接口刷新监控与资产数据（更准确，耗时更长）；失败时自动使用最近一次数据</div></div>
                  <Switch label="巡检前先实时采集" checked={cfg.refreshFirst} onChange={(v) => setCfg({ ...cfg, refreshFirst: v })} />
                </div>
              </div>
            )}
            {tab === 'items' && (
              <div className="space-y-4">
                {errs.disabled && <p className="err-text" role="alert">{errs.disabled}</p>}
                {groups.map((g) => (
                  <section key={g}>
                    <h4 className="text-[13px] font-semibold text-fg mb-1.5">{g}</h4>
                    <div className="space-y-2">
                      {catalog.filter((c) => c.group === g).map((c) => (
                        <div key={c.key} className="flex items-start gap-2"><Checkbox checked={!cfg.disabled.includes(c.key)} onChange={(on) => toggleItem(c.key, on)} label={<span><span className="font-medium">{c.name}</span><span className="block text-xs text-fg-muted">{c.desc}</span></span>} /></div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
