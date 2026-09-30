import { createPortal } from 'react-dom';

/** 所有弹层（下拉/弹窗/抽屉/气泡/Toast）统一挂到 body，禁止靠 z-index 堆叠规避裁剪 */
export default function Portal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
