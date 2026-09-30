import React from 'react';

/**
 * Skeleton —— 骨架屏（首屏用；局部刷新用行内 loading）
 * 预设：<Skeleton.Table rows cols /> / <Skeleton.Cards count /> / <Skeleton.Chart height /> / <Skeleton.Block className />
 */
const Block = ({ className = '', style }) => <div className={`skeleton ${className}`} style={style} />;

function Table({ rows = 6, cols = 6 }) {
  return (
    <div className="p-3 space-y-3" aria-busy="true" aria-label="加载中">
      <Block className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((__, j) => (
            <Block key={j} className="h-5 flex-1" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
function Cards({ count = 4 }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="加载中">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <Block className="h-4 w-1/3" />
          <Block className="h-8 w-2/3" />
          <Block className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
function Chart({ height = 240 }) {
  return (
    <div className="card p-4" aria-busy="true" aria-label="加载中">
      <Block className="h-4 w-32 mb-4" />
      <Block className="w-full" style={{ height }} />
    </div>
  );
}
const Skeleton = { Block, Table, Cards, Chart };
export default Skeleton;
