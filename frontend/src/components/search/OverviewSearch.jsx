import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import SearchInput from '../SearchInput';
import CustomSelect from '../CustomSelect';
import { searchApi } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { searchTarget } from './searchNav';

/**
 * OverviewSearch —— 配置中心 / 运营中心「总览」的全局搜索 + 全部云平台，样式与监控中心总览一致：
 * 一张卡片：「全局搜索」标题 + 搜索框 + 全部云平台下拉 + 命中数；命中项以三列卡片按钮展示，点击跳转到对应功能页（并带入平台与关键字）。
 * 搜索走后端 /search（跨资产 / 监控 / 平台等），选了云平台时只在该平台内搜索。
 * 属性：pid / onPid 当前平台（空 = 全部）；platforms [{id,name}]；placeholder
 */
export default function OverviewSearch({ pid, onPid, platforms, placeholder = '输入虚拟机 / 节点 / 云硬盘 / 存储 名称、IP、MAC、序列号…' }) {
  const nav = useNavigate();
  const [kw, setKw] = useState('');
  const dq = useDebounce(kw.trim(), 250);
  const [st, setSt] = useState({ loading: false, items: [], error: false });
  const seq = useRef(0);
  useEffect(() => {
    if (!dq) { setSt({ loading: false, items: [], error: false }); return; }
    const id = ++seq.current;
    setSt((s) => ({ ...s, loading: true }));
    searchApi.search(dq, 12, pid || undefined)
      .then((r) => { if (id === seq.current) setSt({ loading: false, error: false, items: (r.groups || []).flatMap((g) => g.items.map((it) => ({ ...it, groupLabel: g.label }))) }); })
      .catch(() => { if (id === seq.current) setSt({ loading: false, items: [], error: true }); });
  }, [dq, pid]);
  const options = useMemo(() => (platforms || []).map((p) => ({ value: p.id, label: p.name })), [platforms]);
  const shown = st.items.slice(0, 12);
  const active = !!kw.trim();
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-fg flex items-center gap-1.5"><Search size={15} />全局搜索</span>
        <SearchInput value={kw} onChange={setKw} placeholder={placeholder} width={420} aria-label="全局搜索" />
        <div className="w-[200px]">
          <CustomSelect size="sm" clearable placeholder="全部云平台" aria-label="所属云平台" value={pid} onChange={onPid} options={options} />
        </div>
        {active && !st.loading && <span className="text-[13px] text-fg-muted">共匹配 {st.items.length} 项{st.items.length > 12 ? '（仅显示前 12 项）' : ''}</span>}
      </div>
      {active && (
        shown.length ? (
          <ul className="mt-3 grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((h, i) => (
              <li key={`${h.group}${h.providerId}${h.id}${i}`}>
                <button type="button" className="w-full text-left rounded-lg bg-muted hover:bg-hover px-3 py-2 transition" onClick={() => nav(searchTarget(h))}>
                  <span className="tag-default mr-2">{h.groupLabel}</span><span className="text-[13px] font-medium text-fg">{h.title}</span>
                  {h.subtitle && <div className="text-xs text-fg-subtle mt-0.5 truncate">{h.subtitle}{h.providerName ? ` · ${h.providerName}` : ''}</div>}
                </button>
              </li>
            ))}
          </ul>
        ) : (!st.loading && <div className="mt-3 text-[13px] text-fg-muted">{st.error ? '搜索失败，请稍后重试' : '没有匹配的条目，请换一个关键字'}</div>)
      )}
    </div>
  );
}
