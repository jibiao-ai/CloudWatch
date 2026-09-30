import React, { useState, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * FullscreenButton —— 全屏切换（监控 / 拓扑 / 大表格页必挂）
 * 属性：containerRef（要全屏的容器，缺省为整个文档）/ className / iconOnly
 * 提示：全屏元素下 Portal 弹层挂在 body 上会被遮挡，因此全屏容器需自带背景色（bg-bg）。
 */
export default function FullscreenButton({ containerRef, className = '', iconOnly }) {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggle = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await (containerRef?.current || document.documentElement).requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch (e) {
      console.warn('Fullscreen toggle failed', e);
    }
  }, [containerRef]);
  const label = isFs ? '退出全屏' : '全屏';
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className={`${iconOnly ? 'btn-icon' : 'btn-default'} ${className}`}>
      {isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      {!iconOnly && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
