import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../Modal';
import FormField from '../FormField';
import Switch from '../Switch';
import Radio from '../Radio';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import PolicyIgnores from './PolicyIgnores';
import { analyticsApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const JOINS = [{ value: 'AND', label: '并且' }, { value: 'OR', label: '或者' }];
const EMPTY = { name: '', resourceType: 'vm', enabled: true, windowDays: 30, conds: [], scope: { mode: 'all', items: [] }, advice: '' };
const initial = (p) => (p ? { ...p, conds: p.conds.map((c) => ({ ...c })), scope: { mode: p.scope?.mode || 'all', items: [...(p.scope?.items || [])] } } : { ...EMPTY, conds: [], scope: { mode: 'all', items: [] } });
const newCond = (f) => ({ field: f.key, op: f.ops[0], value: f.type === 'enum' ? f.options[0].value : 0 });

/** PolicyModal —— 创建 / 编辑优化策略：名称、资源类型、范围（所有受支持的集群 / 部分集群）、筛选条件（过去 N 天 + 选择指标）、处置建议、忽略项 */
export default function PolicyModal({ open, policy, meta, onClose, onSaved, onIgnored }) {
  const toast = useToast();
  const edit = !!policy;
  const [form, setForm] = useState(initial(null));
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm(initial(policy)); setErrs({}); } }, [open, policy]);
  if (!open) return null;
  const fields = (meta.fields || []).filter((f) => f.res === form.resourceType);
  const fd = (k) => fields.find((f) => f.key === k);
  const byCluster = form.resourceType === 'vm' || form.resourceType === 'host';
  const scopeOpts = (byCluster ? meta.clusters : meta.platforms) || [];
  const unit = byCluster ? '集群' : '云平台';
  const setCond = (i, patch) => setForm((f) => ({ ...f, conds: f.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const changeField = (i, key) => { const f = fd(key); setCond(i, { field: key, op: f.ops[0], value: f.type === 'enum' ? f.options[0].value : 0 }); };
  const addCond = (key) => {
    const f = fd(key);
    if (f) setForm((x) => ({ ...x, conds: [...x.conds, { ...newCond(f), join: 'AND' }] }));
  };
  const delCond = (i) => setForm((f) => ({ ...f, conds: f.conds.filter((_, j) => j !== i) }));
  const changeRes = (resourceType) => setForm((f) => ({ ...f, resourceType, conds: [], scope: { mode: 'all', items: [] } }));
  const save = async () => {
    setBusy(true); setErrs({});
    const body = {
      name: form.name, resourceType: form.resourceType, enabled: form.enabled, windowDays: Number(form.windowDays), advice: form.advice,
      scope: form.scope, conds: form.conds.map((c, i) => ({ ...c, join: i === 0 ? undefined : c.join, value: fd(c.field)?.type === 'enum' ? c.value : Number(c.value) })),
    };
    try {
      if (edit) await analyticsApi.updatePolicy(policy.kind, body); else await analyticsApi.createPolicy(body);
      toast.success(edit ? '策略已保存' : '策略已创建', form.name); onSaved();
    } catch (e) {
      if (e.status === 422 && e.data) setErrs(e.data); else toast.error(edit ? '保存失败' : '创建失败', e.message);
    } finally { setBusy(false); }
  };
  const resLabel = (meta.resTypes || []).find((r) => r.value === form.resourceType)?.label || form.resourceType;
  return (
    <Modal open title={edit ? '编辑优化策略' : '创建优化策略'} subtitle={edit ? policy.name : undefined} width={760} onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-default" disabled={busy} onClick={onClose}>取消</button><LoadingButton variant="primary" loading={busy} onClick={save}>{edit ? '保存' : '创建'}</LoadingButton></>}>
      <div className="space-y-5">
        <FormField label="名称" required error={errs.name || errs.kind}>
          <input className="field" value={form.name} maxLength={32} placeholder="请输入策略名称" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FormField>
        <FormField label="资源类型" required error={errs.resourceType}>
          {edit
            ? <p className="text-sm text-fg h-9 flex items-center">{resLabel}</p>
            : <CustomSelect aria-label="资源类型" options={meta.resTypes || []} value={form.resourceType} onChange={changeRes} />}
        </FormField>
        <FormField label="范围" required error={errs.scope}>
          <div className="space-y-2">
            <Radio aria-label="范围" name="policy-scope" value={form.scope.mode} onChange={(mode) => setForm({ ...form, scope: { mode, items: [] } })}
              options={[{ value: 'all', label: `所有受支持的${unit}` }, { value: 'part', label: `部分${unit}` }]} />
            {form.scope.mode === 'part' && (
              <CustomSelect multiple searchable aria-label={`选择${unit}`} options={scopeOpts} value={form.scope.items} onChange={(items) => setForm({ ...form, scope: { ...form.scope, items } })} placeholder={`请选择${unit}`} />
            )}
          </div>
        </FormField>
        <section aria-label="筛选条件">
          <h3 className="text-sm font-semibold text-fg mb-2">筛选条件</h3>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm text-fg">过去</span>
            <input className="field !h-8 !w-[80px]" type="number" min={1} max={90} aria-label="统计周期（天）" value={form.windowDays} onChange={(e) => setForm({ ...form, windowDays: e.target.value })} />
            <span className="text-sm text-fg">天</span>
            {errs.windowDays && <span className="err-text" role="alert">{errs.windowDays}</span>}
          </div>
          <ul className="space-y-2 mb-3">
            {form.conds.map((c, i) => {
              const f = fd(c.field);
              if (!f) return null;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <div className="w-[84px]">{i === 0 ? <span className="text-xs text-fg-muted pl-1">满足</span> : <CustomSelect size="sm" aria-label={`条件${i + 1}连接`} options={JOINS} value={c.join || 'AND'} onChange={(v) => setCond(i, { join: v })} />}</div>
                  <div className="w-[190px]"><CustomSelect size="sm" aria-label={`条件${i + 1}指标`} options={fields.map((x) => ({ value: x.key, label: x.label }))} value={c.field} onChange={(v) => changeField(i, v)} /></div>
                  <div className="w-[96px]"><CustomSelect size="sm" aria-label={`条件${i + 1}运算符`} options={f.ops.map((o) => ({ value: o, label: o }))} value={c.op} onChange={(v) => setCond(i, { op: v })} /></div>
                  {f.type === 'enum'
                    ? <div className="w-[130px]"><CustomSelect size="sm" aria-label={`条件${i + 1}取值`} options={f.options} value={c.value} onChange={(v) => setCond(i, { value: v })} /></div>
                    : <div className="flex items-center gap-1.5"><input className="field !h-8 !w-[90px]" type="number" min={0} step="any" aria-label={`条件${i + 1}取值`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} /><span className="text-xs text-fg-muted">{f.unit}</span></div>}
                  <button type="button" className="btn-ghost btn-icon" aria-label={`删除条件${i + 1}`} onClick={() => delCond(i)}><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ul>
          <div className="w-[220px]">
            <CustomSelect size="sm" aria-label="选择一个指标" placeholder="选择一个指标" disabled={form.conds.length >= 8} options={fields.map((x) => ({ value: x.key, label: x.label }))} value="" onChange={addCond} />
          </div>
          {errs.conds ? <p className="err-text mt-2" role="alert">{errs.conds}</p> : <p className="hint mt-2">多个指标之间「并且」优先于「或者」结合，例如：A 或者 B 并且 C = A 或 (B 且 C)；使用率类指标取统计周期内的平均值，持续类条件需数据积累满整个周期才生效</p>}
        </section>
        <FormField label="处置建议" error={errs.advice} hint="命中该策略的资源在列表中展示的建议，不超过 100 个字符">
          <input className="field" value={form.advice} maxLength={100} placeholder="例如：建议缩减 vCPU 规格以释放资源" onChange={(e) => setForm({ ...form, advice: e.target.value })} />
        </FormField>
        <Switch checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} label="启用该策略" />
        {edit ? <PolicyIgnores kind={policy.kind} resType={policy.resourceType} onChanged={onIgnored} /> : <p className="hint">忽略项：策略创建后可在编辑中添加，被忽略的资源将不会出现在优化资源列表中</p>}
      </div>
    </Modal>
  );
}
