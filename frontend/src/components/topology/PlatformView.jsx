import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshCw, ArrowLeft, Server, Cpu, Monitor, HardDrive, Cable, Database, Network } from 'lucide-react';
import CustomSelect from '../CustomSelect';
import SearchInput from '../SearchInput';
import Switch from '../Switch';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import LoadingButton from '../LoadingButton';
import DetailDrawer from '../capacity/DetailDrawer';
import { topologyApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { buildIndex, HEALTH } from './topoUtil';
import { buildModel, focusVms, stat } from './topoModel';
import { KpiCard, Seg, StateLine } from './StatusUi';
import PlatformHeader from './PlatformHeader';
import HubBand from './HubBand';
import HostTiles from './HostTiles';
import VmCards from './VmCards';
import EgoGraph from './EgoGraph';
import ProblemPanel from './ProblemPanel';
import OrphanSection from './OrphanSection';
import SidePanel from './SidePanel';
import NodeDrawer from './NodeDrawer';
import RelationLines from './RelationLines';

const TITLE = { phys: '物理节点', nodes: '计算节点', vms: '虚拟机', volumes: '云硬盘', ports: '虚拟网卡', pools: '集群存储' };
const KPIS = [['phys', '物理节点', Server], ['host', '计算节点', Cpu], ['vm', '虚拟机', Monitor], ['volume', '云硬盘', HardDrive], ['port', '虚拟网卡', Cable], ['pool', '集群存储', Database], ['network', '网络', Network]];
const FILTERS = [{ value: 'all', label: '全部' }, { value: 'bad', label: '仅异常 / 告警' }, { value: 'off', label: '含已停止' }];
const bad = (h) => h === 'danger' || h === 'warning';

/** 平台拓扑：平台 → 宿主机热力块（嵌套 物理 → 计算 → 虚拟机）→ 宿主机下钻 → 虚拟机 1 跳关系图；存储池 / 网络为汇聚带，连线仅对选中对象按需开启 */
export default function PlatformView({ providerId, platforms, initialHost, onSwitch, onBack }) {
  const g = useAsync(() => topologyApi.getGraph(providerId), [providerId]);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [host, setHost] = useState(initialHost || null);
  const [sel, setSel] = useState(null);
  const [focus, setFocus] = useState(null);
  const [lines, setLines] = useState(false);
  const [detail, setDetail] = useState(false);
  const [asset, setAsset] = useState(null);
  const box = useRef(null);
  const graph = g.data;
  const m = useMemo(() => (graph ? buildModel(graph) : null), [graph]);
  const idx = useMemo(() => (graph ? buildIndex(graph) : null), [graph]);
  const fs = m ? focusVms(m, focus) : null;
  const ql = q.trim().toLowerCase();
  const hit = (n) => `${n.name} ${n.sub}`.toLowerCase().includes(ql);

  const hosts = useMemo(() => (m ? m.hosts.filter((h) => {
    if (f === 'bad' && !bad(h.health)) return false;
    if (f === 'off' && !(bad(h.health) || h.c.off)) return false;
    return !ql || hit(h.host) || (h.phys && hit(h.phys)) || h.vms.some(hit);
  }) : []), [m, f, ql]); // eslint-disable-line react-hooks/exhaustive-deps

  const drill = useCallback((id) => { setHost(id); setSel(null); }, []);
  const pickVm = useCallback((id) => { setHost(m.hostOfVm.get(id) || null); setSel(id); setFocus((c) => (c && !focusVms(m, c).has(id) ? null : c)); }, [m]);
  const toggleFocus = useCallback((kind, id) => setFocus((c) => (c?.id === id ? null : { kind, id })), []);
  const pickNode = useCallback((n) => {
    if (n.type === 'pool') { setFocus({ kind: 'pool', id: n.id }); setHost(null); setSel(null); return; }
    if (n.type === 'vm') return pickVm(n.id);
    if (n.type === 'volume' || n.type === 'port') { const vm = m.vmOfChild.get(n.id); if (vm) return pickVm(vm); }
    const h = n.type === 'host' ? n.id : [...m.hosts].find((x) => x.phys?.id === n.id)?.id;
    if (h) drill(h);
    return undefined;
  }, [m, pickVm, drill]);
  const openAsset = (n) => { setAsset({ kind: n.ref.kind, row: { id: n.ref.id, name: n.name, providerId, providerName: graph.platform.name } }); setDetail(false); };

  const cur = host && m ? m.hostById.get(host) : null;
  const vmNode = sel && m ? m.byId.get(sel) : null;
  const vmList = useMemo(() => (cur ? cur.vms.filter((v) => (f !== 'bad' || bad(v.health)) && (!ql || hit(v)) && (!fs || fs.has(v.id))) : []), [cur, f, ql, fs]); // eslint-disable-line react-hooks/exhaustive-deps

  // 关系线：仅对「选中对象」绘制——汇聚焦点 → 受影响的宿主机 / 虚拟机；选中虚拟机 → 它的存储池 / 网络
  const links = useMemo(() => {
    if (!lines || !m) return [];
    const out = [];
    if (focus && fs) {
      const to = cur ? vmList.filter((v) => fs.has(v.id)).map((v) => `[data-nid="${CSS.escape(v.id)}"]`) : hosts.filter((h) => h.vms.some((v) => fs.has(v.id))).map((h) => `[data-tile="${CSS.escape(h.id)}"]`);
      out.push({ from: focus.id, to });
    }
    if (sel) {
      const hubs = new Set();
      (m.volsOfVm.get(sel) || []).forEach((v) => m.poolOfVol.has(v) && hubs.add(m.poolOfVol.get(v)));
      (m.portsOfVm.get(sel) || []).forEach((p) => m.netOfPort.has(p) && hubs.add(m.netOfPort.get(p)));
      hubs.forEach((h) => out.push({ from: sel, to: [`[data-nid="${CSS.escape(h)}"]`] }));
    }
    return out;
  }, [lines, m, focus, fs, sel, cur, vmList, hosts]);

  const mustShow = useMemo(() => {
    const s = new Set();
    if (focus) s.add(focus.id);
    if (sel && m) (m.portsOfVm.get(sel) || []).forEach((p) => m.netOfPort.has(p) && s.add(m.netOfPort.get(p)));
    return s;
  }, [focus, sel, m]);

  const phys = graph?.platform;
  const banner = focus && m && (
    <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg border border-primary/30 bg-primary-soft text-[13px]" role="status">
      <span>反向高亮：{focus.kind === 'pool' ? '存储池' : '网络'} <b>{m.byId.get(focus.id)?.name}</b> 关联 <b>{fs.size}</b> 台虚拟机 · {focus.kind === 'pool' ? `${m.poolVols.get(focus.id) || 0} 块云硬盘` : `${m.netPorts.get(focus.id) || 0} 个网卡`}。其余资源已淡化。</span>
      <button type="button" className="text-primary-text underline" onClick={() => setFocus(null)}>清除</button>
    </div>
  );

  return (
    <div id="topo-platform-view">
      <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} />全局总览</button>
        <div className="w-[200px]"><CustomSelect aria-label="切换云平台" value={providerId} onChange={onSwitch} options={platforms.map((p) => ({ value: p.id, label: p.name }))} /></div>
        <SearchInput value={q} onChange={setQ} placeholder="搜索 宿主机 / 虚拟机 / IP" width={240} />
        <Seg label="健康度筛选" value={f} onChange={setF} options={FILTERS} />
        <div className="ml-auto flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-[13px] text-fg-muted" title="只对选中的存储池 / 网络 / 虚拟机绘制关系线，最多 80 条">
            <Switch checked={lines} onChange={setLines} label="显示关系线" />显示关系线<span className="text-xs text-fg-subtle">（仅选中对象）</span>
          </label>
          <LoadingButton icon={RefreshCw} loading={g.refreshing} onClick={g.reload}>刷新</LoadingButton>
        </div>
      </div>
      {g.loading ? <Skeleton.Cards count={4} /> : g.error ? <div className="card"><ErrorState error={g.error} onRetry={g.reload} /></div> : graph && m && (
        <>
          <PlatformHeader graph={graph} />
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} id="topo-kpis">
            {KPIS.map(([t, label, Icon]) => <KpiCard key={t} icon={Icon} label={label} s={stat(graph.counts, t)} />)}
          </div>
          <nav className="flex items-center gap-1.5 mb-3 text-sm" aria-label="层级导航">
            <button type="button" className={host ? 'text-fg-muted hover:text-primary-text' : 'font-semibold text-fg'} onClick={() => { setHost(null); setSel(null); }}>{phys.name}</button>
            {cur && <><span className="text-fg-subtle">›</span>{vmNode ? <button type="button" className="text-fg-muted hover:text-primary-text" onClick={() => setSel(null)}>{cur.host.name}</button> : <span className="font-semibold text-fg">{cur.host.name}</span>}</>}
            {vmNode && <><span className="text-fg-subtle">›</span><span className="font-semibold text-fg">{vmNode.name}</span></>}
          </nav>
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
            <div ref={box} className="relative min-w-0" id="topo-canvas">
              <HubBand m={m} focus={focus} mustShow={mustShow} onFocus={toggleFocus} />
              {banner}
              {!cur ? (
                <>
                  <HostTiles hosts={hosts} total={m.hosts.length} fs={fs} q={q} selected={host} onDrill={drill} onPickVm={pickVm} />
                  {m.physOnly.length > 0 && !ql && f !== 'bad' && (
                    <section className="card px-4 py-3 mt-4" aria-label="仅物理角色节点">
                      <h3 className="text-xs font-semibold text-fg-muted mb-2">仅有物理角色的节点（无计算服务）<span className="font-normal text-fg-subtle ml-1">{m.physOnly.length}</span></h3>
                      <div className="flex flex-wrap gap-1.5">{m.physOnly.map((n) => <span key={n.id} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-line text-xs text-fg" title={n.reasons[0]}><span className={`w-1.5 h-1.5 rounded-full ${(HEALTH[n.health] || HEALTH.unknown).dot}`} />{n.name}{bad(n.health) && <span className={(HEALTH[n.health] || {}).text}>{HEALTH[n.health].label}</span>}</span>)}</div>
                    </section>
                  )}
                  <OrphanSection orphans={m.orphans} summary={graph.orphan} providerId={providerId} />
                </>
              ) : (
                <>
                  <section className="card px-4 py-2.5 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1">
                    <b className="text-sm text-fg inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${HEALTH[cur.health]?.dot}`} />{cur.host.name}</b>
                    <span className="text-xs text-fg-muted">{cur.host.sub}</span>
                    <span className="text-xs text-fg-muted">物理 {cur.phys?.name || '—'}{cur.phys && bad(cur.phys.health) && <span className={`ml-1 ${HEALTH[cur.phys.health].text}`}>{HEALTH[cur.phys.health].label}</span>}</span>
                    <span className="text-xs text-fg-muted">CPU {cur.host.cpu != null ? `${cur.host.cpu.toFixed(0)}%` : '—'} · 内存 {cur.host.mem != null ? `${cur.host.mem.toFixed(0)}%` : '—'}</span>
                    <span className="ml-auto"><StateLine s={{ danger: cur.c.danger, warning: cur.c.warning, off: cur.c.off }} /></span>
                  </section>
                  <section className="card px-4 py-3">
                    <h3 className="text-xs font-semibold text-fg-muted mb-2.5">虚拟机<span className="font-normal text-fg-subtle ml-2">{vmList.length}/{cur.vms.length} · 异常优先 · 点击卡片展开关系图</span></h3>
                    <VmCards vms={vmList} m={m} selected={sel} fs={fs} onPick={setSel} />
                  </section>
                  <section className="card px-4 py-3 mt-4" id="topo-ego">
                    <h3 className="text-xs font-semibold text-fg-muted mb-2">关系图（仅 1 跳，选中后按需绘制）{vmNode && <span className="font-normal text-fg-subtle ml-2">{vmNode.name}</span>}</h3>
                    {sel ? <EgoGraph m={m} vmId={sel} /> : <div className="py-8 text-center text-sm text-fg-subtle">选中一台虚拟机，在此处绘制它到物理节点、云硬盘、存储池、网络的关系线</div>}
                  </section>
                </>
              )}
              <RelationLines boxRef={box} links={links} deps={[links, hosts, vmList, sel]} />
            </div>
            <div className="sticky top-4 space-y-4 max-h-[calc(100vh-32px)] overflow-y-auto">
              {sel && <SidePanel m={m} vmId={sel} onDetail={() => setDetail(true)} onClear={() => setSel(null)} />}
              <ProblemPanel problems={m.problems} onPick={pickNode} />
            </div>
          </div>
          <NodeDrawer key={sel || 'none'} node={detail ? vmNode : null} graph={graph} idx={idx} onPick={pickNode} onAsset={openAsset} onClose={() => setDetail(false)} />
        </>
      )}
      <DetailDrawer kind={asset?.kind} title={TITLE[asset?.kind] || ''} row={asset?.row || null} onClose={() => setAsset(null)} />
    </div>
  );
}
