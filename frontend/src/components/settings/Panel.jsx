import React from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Save } from 'lucide-react';
import LoadingButton from '../LoadingButton';

/**
 * Panel —— 系统配置当前分组的面板：头部（标题/说明/未保存/撤销/恢复默认/保存）+ 内容 + 底部「上一项 / 下一项」翻页。
 * 必须是模块级组件（不能在页面渲染函数内定义），否则每次输入都会重新挂载导致输入框失焦。
 */
export default function Panel({ tabId, meta, index, total, prev, next, onGo, canUpdate, dirty, saving, onReset, onSave, onRevert, children, banner }) {
  return (
    <section id={tabId} role="tabpanel" aria-labelledby={`${tabId.replace('-panel', '')}-${meta.key}`} className="card">
      <header className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{meta.title}</h2>
          <p className="text-xs text-fg-muted mt-0.5">{meta.desc}</p>
        </div>
        {canUpdate && (
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-warning">未保存</span>}
            {onRevert && dirty && <button type="button" className="btn-ghost btn-sm" onClick={onRevert}>撤销</button>}
            <button type="button" className="btn-default btn-sm" onClick={onReset}><RotateCcw size={14} />恢复默认</button>
            <LoadingButton size="sm" variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={onSave}>保存</LoadingButton>
          </div>
        )}
      </header>
      {banner}
      <div className="p-5">{children}</div>
      <footer className="px-5 py-3 border-t border-line flex items-center justify-between gap-3">
        <button type="button" className="btn-ghost btn-sm" disabled={!prev} onClick={() => onGo(prev.key)}><ChevronLeft size={15} />{prev ? `上一项：${prev.title}` : '上一项'}</button>
        <span className="text-xs text-fg-muted tabular-nums" aria-live="polite">第 {index + 1} / {total} 项</span>
        <button type="button" className="btn-ghost btn-sm" disabled={!next} onClick={() => onGo(next.key)}>{next ? `下一项：${next.title}` : '下一项'}<ChevronRight size={15} /></button>
      </footer>
    </section>
  );
}
