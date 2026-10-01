import React, { useEffect, useRef, useState } from 'react';
import { Check, ImageUp, Trash2 } from 'lucide-react';
import FormField from '../FormField';
import { PRESET_COLORS, DEFAULT_PRIMARY, contrastOn, isValidHex } from '../../utils/theme';
import { fileToDataUrl, readImageSize } from '../../utils/validators';
import { useToast } from '../../hooks/useToast';
import { LogoMark } from '../Logo';

const RULES = { logo: { types: ['image/png', 'image/svg+xml', 'image/jpeg'], max: 512 * 1024, min: 64, maxDim: 1024, tip: '建议 256×256 PNG / SVG，正方形，透明背景，≤512KB' }, bg: { types: ['image/png', 'image/jpeg', 'image/webp'], max: 2 * 1024 * 1024, min: 1200, maxDim: 4096, tip: '建议 1920×1080 JPG / PNG，≤2MB' } };

function ImageUpload({ kind, label, value, onChange, disabled }) {
  const ref = useRef(null);
  const toast = useToast();
  const rule = RULES[kind];
  const pick = async (file) => {
    if (!file) return;
    if (!rule.types.includes(file.type)) return toast.error('格式不支持', `仅支持 ${rule.types.map((t) => t.split('/')[1].replace('svg+xml', 'svg')).join(' / ')}`);
    if (file.size > rule.max) return toast.error('文件过大', `不能超过 ${(rule.max / 1024).toFixed(0)}KB`);
    if (file.type !== 'image/svg+xml') {
      try {
        const { width, height } = await readImageSize(file);
        if (kind === 'logo' && (width < rule.min || height < rule.min)) return toast.error('尺寸过小', `Logo 至少 ${rule.min}×${rule.min}px`);
        if (kind === 'bg' && width < rule.min) return toast.error('尺寸过小', `背景图宽度至少 ${rule.min}px`);
        if (width > rule.maxDim || height > rule.maxDim) return toast.error('尺寸过大', `边长不超过 ${rule.maxDim}px`);
      } catch (e) { return toast.error('图片无法读取', e.message); }
    }
    onChange(await fileToDataUrl(file));
    if (ref.current) ref.current.value = '';
  };
  return (
    <FormField label={label} hint={rule.tip}>
      <div className="flex items-center gap-3">
        <div className={`${kind === 'logo' ? 'w-16 h-16' : 'w-28 h-16'} rounded-lg border border-dashed border-line-strong bg-muted flex items-center justify-center overflow-hidden shrink-0`}>
          {value ? <img src={value} alt={`${label}预览`} className="w-full h-full object-contain" /> : kind === 'logo' ? <LogoMark size={40} /> : <span className="text-xs text-fg-subtle">未设置</span>}
        </div>
        <input ref={ref} type="file" className="sr-only" aria-label={`上传${label}`} accept={rule.types.join(',')} onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" className="btn-default btn-sm" disabled={disabled} onClick={() => ref.current?.click()}><ImageUp size={14} />{value ? '更换' : '上传'}</button>
        {value && <button type="button" className="btn-ghost btn-sm" disabled={disabled} onClick={() => onChange('')}><Trash2 size={14} />移除</button>}
      </div>
    </FormField>
  );
}

/** BrandSection —— 品牌：Logo（预览 + 尺寸/格式校验 + 建议尺寸）、登录背景、主色选择器（预设色板 + 自定义取色，选择后立即预览全站效果） */
export default function BrandSection({ value, onChange, onPreviewColor, disabled }) {
  const [hex, setHex] = useState(value.primaryColor);
  const [err, setErr] = useState('');
  // 外部改动（撤销 / 恢复默认 / 保存回填）时同步输入框
  useEffect(() => { if (isValidHex(value.primaryColor) && value.primaryColor.toLowerCase() !== hex.toLowerCase() && (hex.length === 7 ? isValidHex(hex) : true)) { setHex(value.primaryColor); setErr(''); } }, [value.primaryColor]); // eslint-disable-line react-hooks/exhaustive-deps
  const setColor = (c) => { setHex(c); setErr(''); onChange({ ...value, primaryColor: c }); onPreviewColor(c); };
  const typed = (v) => {
    setHex(v);
    const full = v.startsWith('#') ? v : `#${v}`;
    if (isValidHex(full) && (full.length === 7 || full.length === 4)) { setErr(''); onChange({ ...value, primaryColor: full.toUpperCase() }); onPreviewColor(full); } else setErr('请输入合法的 HEX 色值，如 #C6242A');
  };
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-6">
      <div className="space-y-5">
        <ImageUpload kind="logo" label="平台 Logo" value={value.logoUrl} disabled={disabled} onChange={(v) => onChange({ ...value, logoUrl: v })} />
        <ImageUpload kind="bg" label="登录页背景" value={value.loginBgUrl} disabled={disabled} onChange={(v) => onChange({ ...value, loginBgUrl: v })} />
      </div>
      <div>
        <div className="label">主色</div>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="预设主色">
          {PRESET_COLORS.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={value.primaryColor.toLowerCase() === c.value.toLowerCase()} disabled={disabled} title={`${c.name} ${c.value}`} onClick={() => setColor(c.value)}
              className="w-9 h-9 rounded-full flex items-center justify-center ring-offset-2 ring-offset-card transition hover:scale-110 disabled:opacity-50" style={{ background: c.value, boxShadow: value.primaryColor.toLowerCase() === c.value.toLowerCase() ? `0 0 0 2px rgb(var(--c-card)), 0 0 0 4px ${c.value}` : undefined }}>
              {value.primaryColor.toLowerCase() === c.value.toLowerCase() && <Check size={16} color={contrastOn(c.value)} strokeWidth={3} />}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <label className="relative w-10 h-9 rounded-md overflow-hidden border border-line-strong cursor-pointer shrink-0" title="自定义取色">
            <input type="color" className="absolute -inset-2 w-16 h-16 cursor-pointer" aria-label="自定义取色" disabled={disabled} value={isValidHex(value.primaryColor) ? value.primaryColor : DEFAULT_PRIMARY} onChange={(e) => setColor(e.target.value.toUpperCase())} />
          </label>
          <input className={`field font-mono w-32 ${err ? 'field-error' : ''}`} value={hex} disabled={disabled} onChange={(e) => typed(e.target.value)} maxLength={7} aria-label="主色 HEX" />
          <span className="text-xs text-fg-muted">选择后立即预览全站效果（含暗色），保存后生效</span>
        </div>
        {err && <p className="err-text" role="alert">{err}</p>}
        <div className="mt-5 p-4 rounded-lg border border-line bg-muted/50">
          <div className="text-xs text-fg-muted mb-3">实时预览</div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" tabIndex={-1}>主要按钮</button>
            <button type="button" className="btn-default" tabIndex={-1}>次要按钮</button>
            <span className="tag-primary">标签</span>
            <span className="text-primary-text text-sm font-medium">强调文字</span>
            <div className="w-28 h-2 rounded-full bg-muted overflow-hidden"><div className="w-2/3 h-full bg-primary" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
