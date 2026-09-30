import { useEffect } from 'react';

/** 弹窗焦点管理：打开时聚焦（可指定初始元素），Tab 循环，关闭后还原焦点 */
export function useFocusTrap(ref, active, initialSelector) {
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const prev = document.activeElement;
    const el = ref.current;
    const focusables = () =>
      Array.from(el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
    const t = setTimeout(() => {
      const init = initialSelector && el.querySelector(initialSelector);
      (init || focusables()[0] || el).focus?.();
    }, 30);
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      el.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
