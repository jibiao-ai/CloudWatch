import React, { useState } from 'react';
import { X } from 'lucide-react';
import CustomSelect from '../CustomSelect';
import LoadingButton from '../LoadingButton';
import { analyticsApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useToast';

/** PolicyIgnores —— 策略「忽略项」：被忽略的资源不再出现在该策略的优化资源列表中；按名称 / ID 精确查找后添加，可单个移除 */
export default function PolicyIgnores({ kind, resType, onChanged }) {
  const toast = useToast();
  const q = useAsync(() => analyticsApi.getPolicyIgnores(kind), [kind]);
  const [kw, setKw] = useState('');
  const [hits, setHits] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!kw.trim()) return;
    setBusy(true);
    try {
      const r = (await analyticsApi.resolveRes({ resourceType: resType, keyword: kw.trim() })) || [];
      setHits(r); setPick(r.length === 1 ? `${r[0].providerId}/${r[0].resId}` : '');
      if (!r.length) toast.error('未找到资源', '请输入完整的名称或 ID');
    } catch (e) { toast.error('查找失败', e.message); } finally { setBusy(false); }
  };
  const mutate = async (items, ignore) => {
    setBusy(true);
    try {
      await analyticsApi.setIgnore({ kind, ignore, items });
      toast.success(ignore ? '已添加忽略项' : '已移除忽略项');
      setHits(null); setKw(''); setPick(''); q.reload(); onChanged?.();
    } catch (e) { toast.error('操作失败', e.message); } finally { setBusy(false); }
  };
  const add = () => {
    const h = (hits || []).find((x) => `${x.providerId}/${x.resId}` === pick);
    if (h) mutate([{ providerId: h.providerId, resId: h.resId }], true);
  };
  const list = q.data || [];
  return (
    <section aria-label="忽略项">
      <h3 className="text-sm font-semibold text-fg">忽略项</h3>
      <p className="hint mb-2">被忽略的资源将不会出现在优化资源列表中</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="field !w-[260px]" aria-label="忽略的资源" placeholder="输入资源名称或 ID" value={kw} maxLength={100}
          onChange={(e) => { setKw(e.target.value); setHits(null); }} onKeyDown={(e) => e.key === 'Enter' && (hits ? add() : search())} />
        {hits && hits.length > 1 && (
          <div className="w-[260px]"><CustomSelect aria-label="选择匹配的资源" options={hits.map((h) => ({ value: `${h.providerId}/${h.resId}`, label: `${h.name}（${h.platform}）` }))} value={pick} onChange={setPick} placeholder="存在多个匹配，请选择" /></div>
        )}
        {hits && hits.length > 0
          ? <LoadingButton variant="primary" loading={busy} disabled={!pick} onClick={add}>添加</LoadingButton>
          : <LoadingButton variant="default" loading={busy} disabled={!kw.trim()} onClick={search}>查找</LoadingButton>}
      </div>
      <div className="mt-3">
        {q.loading ? <p className="text-[13px] text-fg-subtle">加载中…</p> : q.error ? <p className="err-text" role="alert">忽略项加载失败：{q.error.message}</p> : list.length === 0
          ? <p className="text-[13px] text-fg-subtle">暂无忽略项</p>
          : (
            <ul className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {list.map((r) => (
                <li key={`${r.providerId}/${r.resId}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-muted px-2 h-7 text-[13px] text-fg">
                  <span className="truncate max-w-[220px]">{r.name}</span><span className="text-fg-subtle text-xs">{r.platform}</span>
                  <button type="button" className="text-fg-subtle hover:text-fg" aria-label={`移除忽略项${r.name}`} disabled={busy} onClick={() => mutate([{ providerId: r.providerId, resId: r.resId }], false)}><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}
