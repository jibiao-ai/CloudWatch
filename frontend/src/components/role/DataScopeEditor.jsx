import React, { useMemo, useState } from 'react';
import { Ban, CircleCheck, Trash2 } from 'lucide-react';
import CustomSelect from '../CustomSelect';
import EmptyState from '../EmptyState';

const LEVELS = [{ value: 'provider', label: '平台' }, { value: 'cluster', label: '集群' }, { value: 'resource', label: '资源' }];

/**
 * DataScopeEditor —— 数据权限：平台 / 集群 / 资源 三级 allow / deny 配置
 * 左：选择范围（三级树）；右：allow / deny 规则表。规则 { type, value, effect }；deny 优先于 allow；无 allow 规则 = 默认全部允许。
 * 注意：仅用于 UI 呈现，真实拦截由后端负责。
 */
export default function DataScopeEditor({ tree, value, onChange, readOnly }) {
  const [open, setOpen] = useState({});
  const flat = useMemo(() => {
    const m = {};
    (tree?.providers || []).forEach((p) => {
      m[p.value] = { type: 'provider', label: p.label, path: p.label };
      p.clusters.forEach((c) => {
        m[c.value] = { type: 'cluster', label: c.label, path: `${p.label} / ${c.label}` };
        c.resources.forEach((r) => { m[r.value] = { type: 'resource', label: r.label, path: `${p.label} / ${c.label} / ${r.label}` }; });
      });
    });
    return m;
  }, [tree]);
  const effectOf = (v) => value.find((r) => r.value === v)?.effect;
  const setEffect = (v, effect) => {
    if (readOnly) return;
    const rest = value.filter((r) => r.value !== v);
    onChange(effect ? [...rest, { type: flat[v].type, value: v, effect }] : rest);
  };
  const Btns = ({ v }) => (
    <span className="ml-auto flex gap-1 shrink-0">
      <button type="button" disabled={readOnly} aria-pressed={effectOf(v) === 'allow'} aria-label={`允许 ${flat[v]?.label}`} onClick={() => setEffect(v, effectOf(v) === 'allow' ? null : 'allow')} className={`h-6 px-1.5 rounded text-[11px] border transition ${effectOf(v) === 'allow' ? 'bg-success-soft border-success text-success' : 'border-line text-fg-muted hover:bg-hover'}`}>允许</button>
      <button type="button" disabled={readOnly} aria-pressed={effectOf(v) === 'deny'} aria-label={`拒绝 ${flat[v]?.label}`} onClick={() => setEffect(v, effectOf(v) === 'deny' ? null : 'deny')} className={`h-6 px-1.5 rounded text-[11px] border transition ${effectOf(v) === 'deny' ? 'bg-danger-soft border-danger text-danger' : 'border-line text-fg-muted hover:bg-hover'}`}>拒绝</button>
    </span>
  );
  const Row = ({ v, label, level, expandable, expanded, onToggle }) => (
    <div className="flex items-center gap-2 py-1.5 pr-2 rounded hover:bg-hover/60" style={{ paddingLeft: level * 18 + 6 }}>
      {expandable ? <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? '折叠' : '展开'} ${label}`} className="w-4 text-fg-muted text-xs">{expanded ? '▾' : '▸'}</button> : <span className="w-4" />}
      <span className="text-[13px] text-fg truncate">{label}</span><Btns v={v} />
    </div>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <div className="text-[13px] font-medium text-fg mb-2">选择范围（{LEVELS.map((l) => l.label).join(' → ')}）</div>
        <div className="rounded-lg border border-line p-2 max-h-[380px] overflow-y-auto">
          {(tree?.providers || []).map((p) => (
            <div key={p.value}>
              <Row v={p.value} label={p.label} level={0} expandable expanded={open[p.value]} onToggle={() => setOpen((o) => ({ ...o, [p.value]: !o[p.value] }))} />
              {open[p.value] && p.clusters.map((c) => (
                <div key={c.value}>
                  <Row v={c.value} label={c.label} level={1} expandable expanded={open[c.value]} onToggle={() => setOpen((o) => ({ ...o, [c.value]: !o[c.value] }))} />
                  {open[c.value] && c.resources.map((r) => <Row key={r.value} v={r.value} label={r.label} level={2} />)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[13px] font-medium text-fg mb-2">已配置规则（{value.length}）<span className="text-xs text-fg-muted font-normal ml-2">拒绝优先于允许</span></div>
        <div className="rounded-lg border border-line max-h-[380px] overflow-y-auto">
          {value.length === 0 ? <EmptyState compact title="未配置数据权限" description="默认可访问全部平台 / 集群 / 资源" /> : (
            <table className="w-full"><thead><tr><th className="th">范围</th><th className="th w-16">层级</th><th className="th w-20">效果</th>{!readOnly && <th className="th w-10" />}</tr></thead>
              <tbody>{value.map((r) => (
                <tr key={r.value}><td className="td text-[13px]">{flat[r.value]?.path || r.value}</td><td className="td text-[13px] text-fg-muted">{LEVELS.find((l) => l.value === r.type)?.label}</td>
                  <td className="td">{r.effect === 'allow' ? <span className="tag-success"><CircleCheck size={12} />允许</span> : <span className="tag-danger"><Ban size={12} />拒绝</span>}</td>
                  {!readOnly && <td className="td"><button type="button" className="btn-icon !w-7 !h-7" aria-label="移除规则" onClick={() => setEffect(r.value, null)}><Trash2 size={14} /></button></td>}</tr>))}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
