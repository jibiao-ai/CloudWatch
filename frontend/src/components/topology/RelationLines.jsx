import React, { useLayoutEffect, useState } from 'react';

const MAX = 80;

/**
 * 关系线（只对选中对象开启）：links = [{ from: 'nid', to: ['selector', ...] }]
 * 源为带 data-nid 的元素；目标为 CSS 选择器（宿主机卡片 [data-tile]、存储池 / 网络 [data-nid]）。最多 80 条。
 */
export default function RelationLines({ boxRef, links, deps }) {
  const [paths, setPaths] = useState([]);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !links.length) { setPaths([]); return undefined; }
    const calc = () => {
      const b = el.getBoundingClientRect();
      const out = [];
      links.forEach((l) => {
        const a = el.querySelector(`[data-nid="${CSS.escape(l.from)}"]`);
        if (!a) return;
        const ar = a.getBoundingClientRect();
        l.to.forEach((sel) => {
          if (out.length >= MAX) return;
          const t = el.querySelector(sel);
          if (!t) return;
          const tr = t.getBoundingClientRect();
          const up = tr.top < ar.top;
          const x1 = ar.left + ar.width / 2 - b.left; const y1 = (up ? ar.top : ar.bottom) - b.top;
          const x2 = tr.left + tr.width / 2 - b.left; const y2 = (up ? tr.bottom : tr.top) - b.top;
          const dy = Math.max(30, Math.abs(y2 - y1) / 2) * (up ? -1 : 1);
          out.push(`M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`);
        });
      });
      setPaths(out);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxRef, ...deps]);
  if (!paths.length) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} fill="none" className="stroke-primary" strokeWidth="1.4" strokeOpacity="0.55" strokeDasharray="5 3" />)}
    </svg>
  );
}
