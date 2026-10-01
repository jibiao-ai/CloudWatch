import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import SearchInput from '../SearchInput';
import { serviceName } from '../../utils/monitorUtil';

/** 在快照里按关键字查找条目：物理节点 / 磁盘 / 虚拟机 / 服务 / 采集接口 */
export function searchSnapshot(snap, kw, platform) {
  const k = kw.trim().toLowerCase();
  if (!k) return [];
  const has = (...v) => v.join(' ').toLowerCase().includes(k);
  const out = [];
  snap.nodes.forEach((n) => has(n.name, n.hostIp, platform?.name) && out.push({ tab: 'nodes', type: '物理节点', title: n.name, sub: n.hostIp }));
  snap.vms.forEach((v) => has(v.name, v.id, v.ips, v.node) && out.push({ tab: 'vms', type: '虚拟机', title: v.name || v.id, sub: `${v.ips || ''} ${v.node ? `· ${v.node}` : ''}` }));
  snap.disks.forEach((d) => has(d.node, d.device, d.model, d.serial, d.osdId) && out.push({ tab: 'disks', type: '磁盘', title: `${d.node} ${d.device}`, sub: `${d.model || ''} ${d.osdId ? `· ${d.osdId}` : ''}` }));
  snap.services.forEach((s) => has(s.name, serviceName(s.name)) && out.push({ tab: 'services', type: '服务', title: serviceName(s.name), sub: s.name }));
  snap.steps.forEach((s) => has(s.label, s.key, s.error) && out.push({ tab: 'steps', type: '采集明细', title: s.label, sub: s.ok ? '成功' : s.error }));
  return out;
}

/** GlobalSearch —— 总览全局搜索：跨「物理节点 / 虚拟机 / 磁盘 / 服务 / 采集明细」查找具体条目，点击跳转到对应页签并带入关键字 */
export default function GlobalSearch({ snap, platform, onJump }) {
  const [kw, setKw] = useState('');
  const hits = useMemo(() => searchSnapshot(snap, kw, platform), [snap, kw, platform]);
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-fg flex items-center gap-1.5"><Search size={15} />全局搜索</span>
        <SearchInput value={kw} onChange={setKw} placeholder="输入节点 / 云主机 / 磁盘 / 服务名称、IP、序列号…" width={420} aria-label="全局搜索监控条目" />
        {kw.trim() && <span className="text-[13px] text-fg-muted">共匹配 {hits.length} 项{hits.length > 12 ? '（仅显示前 12 项）' : ''}</span>}
      </div>
      {kw.trim() && (
        hits.length ? (
          <ul className="mt-3 grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {hits.slice(0, 12).map((h, i) => (
              <li key={`${h.tab}${i}`}>
                <button type="button" className="w-full text-left rounded-lg bg-muted hover:bg-hover px-3 py-2 transition" onClick={() => onJump(h.tab, kw.trim())}>
                  <span className="tag-default mr-2">{h.type}</span><span className="text-[13px] font-medium text-fg">{h.title}</span>
                  {h.sub && <div className="text-xs text-fg-subtle mt-0.5 truncate">{h.sub}</div>}
                </button>
              </li>
            ))}
          </ul>
        ) : <div className="mt-3 text-[13px] text-fg-muted">没有匹配的条目，请换一个关键字</div>
      )}
    </div>
  );
}
