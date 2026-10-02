import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import FormField from '../FormField';
import Switch from '../Switch';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import { analyticsApi } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const JOINS = [{ value: 'AND', label: '并且' }, { value: 'OR', label: '或者' }];
const blank = (f) => ({ field: f.key, op: f.ops[0], value: f.type === 'enum' ? f.options[0].value : 0 });

/** PolicyModal —— 编辑优化策略：名称 / 启用 / 统计周期 / 条件（字段 + 运算符 + 取值，条件间 并且 / 或者；并且优先于或者） */
export default function PolicyModal({ policy, fields, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(policy ? { ...policy, conds: policy.conds.map((c) => ({ ...c })) } : null); setErrs({}); }, [policy]);
  if (!policy || !form) return null;
  const fd = (k) => fields.find((f) => f.key === k);
  const setCond = (i, patch) => setForm((f) => ({ ...f, conds: f.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setField = (i, key) => { const f = fd(key); setCond(i, { field: key, op: f.ops[0], value: f.type === 'enum' ? f.options[0].value : 0 }); };
  const add = () => setForm((f) => ({ ...f, conds: [...f.conds, { ...blank(fields[0]), join: 'AND' }] }));
  const del = (i) => setForm((f) => ({ ...f, conds: f.conds.filter((_, j) => j !== i) }));
  const save = async () => {
    setBusy(true); setErrs({});
    try {
      await analyticsApi.updatePolicy(policy.kind, { name: form.name, enabled: form.enabled, windowDays: Number(form.windowDays), conds: form.conds.map((c) => ({ ...c, value: fd(c.field).type === 'enum' ? c.value : Number(c.value) })) });
      toast.success('策略已保存', form.name); onSaved();
    } catch (e) {
      if (e.status === 422 && e.data) setErrs(e.data); else toast.error('保存失败', e.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal open title="编辑优化策略" subtitle={policy.name} width={760} onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-default" disabled={busy} onClick={onClose}>取消</button><LoadingButton variant="primary" loading={busy} onClick={save}>保存</LoadingButton></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="策略名称" required error={errs.name}><input className="field" value={form.name} maxLength={32} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="统计周期（天）" required error={errs.windowDays} hint="使用率类条件取该周期内的平均值 / 最大值；数据不足整个周期时低负载条件不生效">
            <input className="field" type="number" min={1} max={90} value={form.windowDays} onChange={(e) => setForm({ ...form, windowDays: e.target.value })} />
          </FormField>
        </div>
        <Switch checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} label="启用该策略" />
        <section aria-label="策略条件">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-fg">优化条件</h3>
            <button type="button" className="btn-default btn-sm" disabled={form.conds.length >= 8} onClick={add}><Plus size={14} /> 添加条件</button>
          </div>
          <ul className="space-y-2">
            {form.conds.map((c, i) => {
              const f = fd(c.field);
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <div className="w-[84px]">{i === 0 ? <span className="text-xs text-fg-muted pl-1">满足</span> : <CustomSelect size="sm" aria-label={`条件${i + 1}连接`} options={JOINS} value={c.join || 'AND'} onChange={(v) => setCond(i, { join: v })} />}</div>
                  <div className="w-[190px]"><CustomSelect size="sm" aria-label={`条件${i + 1}字段`} options={fields.map((x) => ({ value: x.key, label: x.label }))} value={c.field} onChange={(v) => setField(i, v)} /></div>
                  <div className="w-[96px]"><CustomSelect size="sm" aria-label={`条件${i + 1}运算符`} options={f.ops.map((o) => ({ value: o, label: o }))} value={c.op} onChange={(v) => setCond(i, { op: v })} /></div>
                  {f.type === 'enum'
                    ? <div className="w-[130px]"><CustomSelect size="sm" aria-label={`条件${i + 1}取值`} options={f.options} value={c.value} onChange={(v) => setCond(i, { value: v })} /></div>
                    : <div className="flex items-center gap-1.5"><input className="field !h-8 !w-[90px]" type="number" min={0} aria-label={`条件${i + 1}取值`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} /><span className="text-xs text-fg-muted">{f.unit}</span></div>}
                  <button type="button" className="btn-ghost btn-icon" aria-label={`删除条件${i + 1}`} disabled={form.conds.length <= 1} onClick={() => del(i)}><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ul>
          {errs.conds ? <p className="err-text mt-2" role="alert">{errs.conds}</p> : <p className="hint mt-2">条件之间「并且」优先于「或者」结合，例如：A 或者 B 并且 C = A 或 (B 且 C)</p>}
        </section>
      </div>
    </Modal>
  );
}
