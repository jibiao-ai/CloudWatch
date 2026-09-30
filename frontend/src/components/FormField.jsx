import React, { useId, cloneElement, isValidElement } from 'react';

/**
 * FormField —— label 关联 + 错误信息贴近字段 + 提示
 * 属性：label / required / error / hint / children(单个输入元素，自动注入 id 与 aria)
 */
export default function FormField({ label, required, error, hint, children, className = '' }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
        error: children.props.error ?? (typeof children.type === 'function' ? !!error : undefined),
        className: `${children.props.className || ''} ${error && typeof children.type === 'string' ? 'field-error' : ''}`.trim(),
      })
    : children;
  const forId = isValidElement(children) ? children.props.id || id : id;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={forId} className="label">
          {label}
          {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      {child}
      {error ? <p id={`${id}-err`} className="err-text" role="alert">{error}</p> : hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
    </div>
  );
}
