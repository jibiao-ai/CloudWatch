import React from 'react';
import { CircleAlert, RotateCw } from 'lucide-react';

/** ErrorState —— 可读错误 + 重试按钮。属性：error(Error|string) / onRetry / compact */
export default function ErrorState({ error, onRetry, compact }) {
  const msg = typeof error === 'string' ? error : error?.message || '加载失败，请稍后重试';
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="w-14 h-14 rounded-full bg-danger-soft flex items-center justify-center text-danger mb-3">
        <CircleAlert size={26} />
      </div>
      <div className="text-sm font-medium text-fg">数据加载失败</div>
      <div className="text-xs text-fg-muted mt-1 max-w-md break-words">{msg}</div>
      {onRetry && (
        <button type="button" className="btn-default btn-sm mt-4" onClick={onRetry}>
          <RotateCw size={14} /> 重试
        </button>
      )}
    </div>
  );
}
