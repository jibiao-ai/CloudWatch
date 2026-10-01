import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import CustomSelect from './CustomSelect';

/**
 * Pagination —— 统一分页
 * 属性：page(从 1 开始) / pageSize / total / pageSizeOptions / onChange({page,pageSize})
 * 显示：第 X-Y 条 / 共 N 条；页码跳转；页大小选择（CustomSelect）；移动端简化。
 */
export default function Pagination({ page, pageSize, total, pageSizeOptions = [10, 20, 50, 100], onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = useState('');
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p) => onChange({ page: Math.min(Math.max(1, p), pages), pageSize });

  const nums = [];
  const push = (n) => nums.push(n);
  const win = 2;
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || (i >= page - win && i <= page + win)) push(i);
    else if (nums[nums.length - 1] !== '…') push('…');
  }
  const btn = 'w-8 h-8 rounded-md text-[13px] flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav data-dt-pagination aria-label="分页" className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-line">
      <div className="text-[13px] text-fg-muted">
        第 <b className="text-fg font-medium">{from}-{to}</b> 条 / 共 <b className="text-fg font-medium">{total}</b> 条
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={`${btn} hover:bg-hover hidden sm:flex`} disabled={page <= 1} onClick={() => go(1)} aria-label="首页"><ChevronsLeft size={15} /></button>
        <button type="button" className={`${btn} hover:bg-hover`} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="上一页"><ChevronLeft size={15} /></button>
        <div className="hidden sm:flex items-center gap-1">
          {nums.map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} className="w-6 text-center text-fg-subtle">…</span>
            ) : (
              <button key={n} type="button" onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} className={`${btn} ${n === page ? 'bg-primary text-primary-on font-medium' : 'hover:bg-hover text-fg'}`}>{n}</button>
            ),
          )}
        </div>
        <span className="sm:hidden text-[13px] text-fg-muted px-2">{page} / {pages}</span>
        <button type="button" className={`${btn} hover:bg-hover`} disabled={page >= pages} onClick={() => go(page + 1)} aria-label="下一页"><ChevronRight size={15} /></button>
        <button type="button" className={`${btn} hover:bg-hover hidden sm:flex`} disabled={page >= pages} onClick={() => go(pages)} aria-label="末页"><ChevronsRight size={15} /></button>
      </div>
      <div className="hidden sm:flex items-center gap-3">
        <div className="w-[104px]">
          <CustomSelect size="sm" aria-label="每页条数" value={pageSize} options={pageSizeOptions.map((n) => ({ value: n, label: `${n} 条/页` }))} onChange={(v) => onChange({ page: 1, pageSize: v })} />
        </div>
        <label className="flex items-center gap-1.5 text-[13px] text-fg-muted">
          跳至
          <input
            className="field !h-8 !w-14 !px-2 text-center"
            inputMode="numeric"
            value={jump}
            aria-label="跳转页码"
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && jump) { go(Number(jump)); setJump(''); } }}
          />
          页
        </label>
      </div>
    </nav>
  );
}
