import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Tabs from './Tabs';

/**
 * Carousel —— 横向轮播：slides[{key,label,node}]；按 interval（默认 10 秒）自动切换到下一页，
 * 支持上一页 / 下一页按钮、点击标签与 ←/→ 键翻页；鼠标悬停或键盘聚焦在内容上时暂停，离开后重新计时。
 * 容器高度跟随当前页内容；非当前页 aria-hidden + inert，不会被 Tab 键聚焦。
 */
export default function Carousel({ slides, interval = 10000, ariaLabel = '轮播', idPrefix = 'carousel', className = '' }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [epoch, setEpoch] = useState(0); // 暂停恢复后重新计时，进度条同步重启
  const [h, setH] = useState(null);
  const slideRefs = useRef([]);
  const n = slides.length;
  const cur = Math.min(idx, Math.max(0, n - 1));

  const go = useCallback((i) => { setIdx(((i % n) + n) % n); setEpoch((e) => e + 1); }, [n]);

  useEffect(() => {
    if (paused || n < 2) return undefined;
    const t = setTimeout(() => setIdx((i) => (i + 1) % n), interval);
    return () => clearTimeout(t);
  }, [cur, paused, epoch, interval, n]);

  // 容器高度 = 当前页高度（内容变化时同步）
  useLayoutEffect(() => {
    const el = slideRefs.current[cur];
    if (!el) return undefined;
    setH(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cur, n]);

  const setPause = (v) => { setPaused(v); if (!v) setEpoch((e) => e + 1); };
  if (!n) return null;
  const items = slides.map((s) => ({ key: s.key, label: s.label }));

  return (
    <section className={className} aria-roledescription="carousel" aria-label={ariaLabel}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Tabs idPrefix={idPrefix} items={items} value={slides[cur].key} onChange={(k) => go(slides.findIndex((s) => s.key === k))} className="!border-b-0" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted" aria-live="off">{n > 1 && (paused ? '已暂停轮播' : `每 ${Math.round(interval / 1000)} 秒自动轮播`)} · {cur + 1} / {n}</span>
          <button type="button" className="btn-icon !w-8 !h-8 border border-line" onClick={() => go(cur - 1)} disabled={n < 2} aria-label="上一页"><ChevronLeft size={16} /></button>
          <button type="button" className="btn-icon !w-8 !h-8 border border-line" onClick={() => go(cur + 1)} disabled={n < 2} aria-label="下一页"><ChevronRight size={16} /></button>
        </div>
      </div>
      {n > 1 && (
        <div className="h-0.5 mb-3 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <div key={`${cur}-${epoch}`} className="h-full bg-primary carousel-progress" style={{ animationDuration: `${interval}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
        </div>
      )}
      <div className="overflow-hidden" style={{ height: h == null ? undefined : h, transition: 'height .3s ease' }}
        onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)} onFocus={() => setPause(true)} onBlur={() => setPause(false)}>
        <div className="flex items-start transition-transform duration-500 ease-out" style={{ transform: `translateX(-${cur * 100}%)` }}>
          {slides.map((s, i) => (
            <div key={s.key} ref={(el) => { slideRefs.current[i] = el; }} role="group" aria-roledescription="slide" aria-label={`${s.label}（${i + 1} / ${n}）`}
              aria-hidden={i !== cur} {...(i === cur ? {} : { inert: '' })} className="w-full shrink-0 min-w-0 space-y-4 pb-px">
              {s.node}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
