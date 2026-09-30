import React, { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import Modal from './Modal';

/**
 * RangeSelector —— 时间范围：1小时/1天/1周/1月/1季度/1年/自定义 + 「对比上一周期」开关（全站统计页统一使用）
 * 属性：value { key, start, end, compare } / onChange(value) / showCompare(默认 true) / customOnly
 * 输出：start/end 为毫秒时间戳；自定义时通过弹窗（Portal）选择。
 */
export const RANGE_PRESETS = [
  { key: '1h', label: '1 小时', ms: 3600e3 },
  { key: '1d', label: '1 天', ms: 86400e3 },
  { key: '1w', label: '1 周', ms: 7 * 86400e3 },
  { key: '1M', label: '1 月', ms: 30 * 86400e3 },
  { key: '1Q', label: '1 季度', ms: 90 * 86400e3 },
  { key: '1y', label: '1 年', ms: 365 * 86400e3 },
];

export function resolveRange(key, now = Date.now()) {
  const p = RANGE_PRESETS.find((x) => x.key === key) || RANGE_PRESETS[1];
  return { key: p.key, start: now - p.ms, end: now };
}
export const defaultRange = (key = '1d') => ({ ...resolveRange(key), compare: false });

const toLocal = (ms) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export default function RangeSelector({ value, onChange, showCompare = true, customOnly = false }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState('');
  const [e, setE] = useState('');
  const [err, setErr] = useState('');
  const presets = customOnly ? [] : RANGE_PRESETS;

  const openCustom = () => {
    setS(toLocal(value.start || Date.now() - 86400e3));
    setE(toLocal(value.end || Date.now()));
    setErr('');
    setOpen(true);
  };
  const applyCustom = () => {
    const st = new Date(s).getTime();
    const en = new Date(e).getTime();
    if (!st || !en) return setErr('请选择开始与结束时间');
    if (st >= en) return setErr('开始时间必须早于结束时间');
    onChange({ ...value, key: 'custom', start: st, end: en });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="时间范围" className="inline-flex p-0.5 rounded-md bg-muted border border-line max-w-full overflow-x-auto">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value.key === p.key}
            onClick={() => onChange({ ...value, ...resolveRange(p.key) })}
            className={`px-2.5 h-7 rounded text-[13px] whitespace-nowrap shrink-0 transition ${value.key === p.key ? 'bg-card text-primary-text font-medium shadow-sm' : 'text-fg-muted hover:text-fg'}`}
          >
            {p.label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={value.key === 'custom'} onClick={openCustom} className={`px-2.5 h-7 rounded text-[13px] whitespace-nowrap shrink-0 transition inline-flex items-center gap-1 ${value.key === 'custom' ? 'bg-card text-primary-text font-medium shadow-sm' : 'text-fg-muted hover:text-fg'}`}>
          <CalendarRange size={13} /> 自定义
        </button>
      </div>
      {showCompare && (
        <label className="inline-flex items-center gap-2 text-[13px] text-fg-muted cursor-pointer select-none">
          <button
            type="button"
            role="switch"
            aria-checked={!!value.compare}
            onClick={() => onChange({ ...value, compare: !value.compare })}
            className={`relative w-8 h-[18px] rounded-full transition ${value.compare ? 'bg-primary' : 'bg-line-strong'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-card shadow transition-transform ${value.compare ? 'translate-x-[14px]' : ''}`} />
          </button>
          对比上一周期
        </label>
      )}
      <Modal
        open={open}
        title="自定义时间范围"
        width={420}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn-default" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="btn-primary" onClick={applyCustom}>应用</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="rs-start">开始时间</label>
            <input id="rs-start" type="datetime-local" className="field" value={s} onChange={(ev) => setS(ev.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="rs-end">结束时间</label>
            <input id="rs-end" type="datetime-local" className="field" value={e} onChange={(ev) => setE(ev.target.value)} />
          </div>
          {err && <p className="err-text" role="alert">{err}</p>}
        </div>
      </Modal>
    </div>
  );
}
