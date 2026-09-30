import React, { useState, useRef } from 'react';
import Portal from './Portal';

/** Tooltip —— Portal 气泡。属性：content / children / placement('top'|'bottom'|'right') / block(外层独占一行，用于纵向列表如侧栏) */
export default function Tooltip({ content, children, placement = 'top', block }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  if (!content) return children;
  const show = () => {
    const r = ref.current.getBoundingClientRect();
    setPos(placement === 'right' ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: placement === 'top' ? r.top - 8 : r.bottom + 8 });
  };
  return (
    <span ref={ref} className={block ? 'flex w-full' : 'inline-flex'} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {children}
      {pos && (
        <Portal>
          <div role="tooltip" className="fixed z-[400] pointer-events-none px-2.5 py-1.5 rounded-md bg-fg text-fg-inverse text-xs max-w-[280px] shadow-md animate-fade-in" style={{ left: pos.x, top: pos.y, transform: placement === 'right' ? 'translate(0, -50%)' : `translate(-50%, ${placement === 'top' ? '-100%' : '0'})` }}>
            {content}
          </div>
        </Portal>
      )}
    </span>
  );
}
