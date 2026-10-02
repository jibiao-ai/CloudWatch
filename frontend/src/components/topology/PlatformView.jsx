import React, { useCallback, useMemo, useState } from 'react';
import { RefreshCw, ArrowLeft, BellRing, Cloud } from 'lucide-react';
import CustomSelect from '../CustomSelect';
import SearchInput from '../SearchInput';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import LoadingButton from '../LoadingButton';
import DetailDrawer from '../capacity/DetailDrawer';
import { topologyApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { fromNow } from '../../utils/format';
import { ENV_TYPES, ENV_TAG } from '../../data/dict';
import LayerView from './LayerView';
import NodeDrawer from './NodeDrawer';
import AlertPanel from './AlertPanel';
import SelectionBar from './SelectionBar';
import { TYPES, HEALTH, HEALTH_OPTIONS, LAYERS, buildIndex, related, matchNode, pctTone } from './topoUtil';

const TITLE = { phys: '物理节点', nodes: '计算节点', vms: '虚拟机', volumes: '云硬盘', ports: '虚拟网卡', pools: '集群存储' };
const TYPE_OPTIONS = [{ value: 'all', label: '全部资源类型' }, ...LAYERS.flatMap((l) => l.types).map((t) => ({ value: t, label: TYPES[t].label }))];

function Gauge({ label, v }) {
  return (
    <div className="min-w-[120px]">
      <div className="flex justify-between text-xs mb-1"><span className="text-fg-muted">{label}</span><span className="tabular-nums text-fg">{v == null ? '—' : `${v.toFixed(1)}%`}</span></div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">{v != null && <div className={`h-full ${pctTone(v)}`} style={{ width: `${Math.min(100, v)}%` }} />}</div>
    </div>
  );
}

/** 第 1 层：单个云平台的分层资源拓扑（平台 → 物理 → 计算 → 实例 → 挂载 → 后端） */
export default function PlatformView({ providerId, platforms, onSwitch, onBack }) {
  const g = useAsync(() => topologyApi.getGraph(providerId), [providerId]);
  const [q, setQ] = useState('');
  const [health, setHealth] = useState('all');
  const [type, setType] = useState('all');
  const [sel, setSel] = useState(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [asset, setAsset] = useState(null);
  const [detail, setDetail] = useState(false);
  const graph = g.data;
  const idx = useMemo(() => (graph ? buildIndex(graph) : null), [graph]);
  const nodes = useMemo(() => (graph ? graph.nodes.filter((n) => (type === 'all' || n.type === type) && matchNode(n, q, health)) : []), [graph, q, health, type]);
  const node = sel && idx ? idx.byId.get(sel) : null;
  const rel = useMemo(() => (node && idx ? related(idx, node.id) : null), [node, idx]);
  const pick = useCallback((n) => setSel(n.id), []);
  const closeDetail = useCallback(() => setDetail(false), []);
  const clear = useCallback(() => { setSel(null); setFocusOnly(false); setDetail(false); }, []);
  const openAsset = (n) => {
    setAsset({ kind: n.ref.kind, row: { id: n.ref.id, name: n.name, providerId, providerName: graph.platform.name } });
    setDetail(false);
  };

  const header = () => {
    if (!graph) return null;
    const p = graph.platform;
    const h = HEALTH[p.health] || HEALTH.unknown;
    const env = ENV_TYPES.find((e) => e.value === p.envType);
    return (
      <section className="card p-4 mb-4" id="topo-platform" aria-label="云平台">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-primary-soft text-primary-text flex items-center justify-center shrink-0"><Cloud size={18} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-fg truncate">{p.name}</h2><span className={h.tag}>{h.label}</span>{env && <span className={ENV_TAG[p.envType] || 'tag-default'}>{env.label}</span>}</div>
              <div className="text-xs text-fg-muted mt-0.5">
                <span className="font-mono">{p.consoleIp || '—'}</span>
                <span className="mx-2">资产采集：{p.assetAt ? `${p.assetOk ? '成功' : '失败'}（${fromNow(p.assetAt)}）` : '尚未采集'}</span>
                <span>监控采集：{p.monitorAt ? `${p.monitorOk ? '成功' : '失败'}（${fromNow(p.monitorAt)}）` : '尚未采集'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4 flex-1 min-w-[320px]"><Gauge label="vCPU" v={graph.usage.vcpu} /><Gauge label="内存" v={graph.usage.mem} /><Gauge label="存储" v={graph.usage.storage} /></div>
          <div className={`inline-flex items-center gap-1.5 text-sm ${p.alertFiring ? (graph.alertTotals.critical ? 'text-danger' : 'text-warning') : 'text-fg-muted'}`}><BellRing size={15} />{p.alertFiring ? `未恢复告警 ${p.alertFiring}（严重 ${graph.alertTotals.critical}）` : '无未恢复告警'}</div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line" id="topo-counts">
          {LAYERS.flatMap((l) => l.types).map((t) => {
            const c = graph.counts[t] || { total: 0, abnormal: 0, off: 0 };
            const Icon = TYPES[t].icon;
            return (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(type === t ? 'all' : t)}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[13px] transition ${type === t ? 'border-primary bg-primary-soft text-primary-text' : 'border-line text-fg hover:bg-hover'}`}>
                <Icon size={13} className="text-fg-muted" />{TYPES[t].label}<b className="tabular-nums">{c.total}</b>
                {c.abnormal > 0 && <span className="text-danger text-xs">{c.abnormal} 异常</span>}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div id="topo-platform-view">
      <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} />全局总览</button>
        <div className="w-[200px]"><CustomSelect aria-label="切换云平台" value={providerId} onChange={onSwitch} options={platforms.map((p) => ({ value: p.id, label: p.name }))} /></div>
        <SearchInput value={q} onChange={setQ} placeholder="搜索名称 / IP / 状态" width={240} />
        <div className="w-[160px]"><CustomSelect aria-label="健康度筛选" value={health} onChange={setHealth} options={HEALTH_OPTIONS} /></div>
        <div className="w-[160px]"><CustomSelect aria-label="资源类型筛选" value={type} onChange={setType} options={TYPE_OPTIONS} /></div>
        <div className="ml-auto flex items-center gap-3 text-xs text-fg-muted">
          {Object.entries(HEALTH).filter(([k]) => k !== 'unknown').map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${v.dot}`} />{v.label}</span>)}
          <span>虚线 = 挂载 / 网卡 / 存储关系</span>
          <LoadingButton icon={RefreshCw} loading={g.refreshing} onClick={g.reload}>刷新</LoadingButton>
        </div>
      </div>
      {g.loading ? <Skeleton.Cards count={4} /> : g.error ? <div className="card"><ErrorState error={g.error} onRetry={g.reload} /></div> : graph && (
        <>
          {header()}
          {node && <SelectionBar node={node} focusOnly={focusOnly} onFocus={() => setFocusOnly((v) => !v)} onDetail={() => setDetail(true)} onClear={clear} />}
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
            <LayerView graph={graph} nodes={nodes} selected={sel} rel={rel} focusOnly={focusOnly} onPick={pick} />
            <div className="sticky top-4"><AlertPanel alerts={graph.alerts} byId={idx.byId} onPick={pick} /></div>
          </div>
          <NodeDrawer key={sel || 'none'} node={detail ? node : null} graph={graph} idx={idx} focusOnly={focusOnly} onToggleFocus={() => setFocusOnly((v) => !v)} onPick={pick} onAsset={openAsset} onClose={closeDetail} />
        </>
      )}
      <DetailDrawer kind={asset?.kind} title={TITLE[asset?.kind] || ''} row={asset?.row || null} onClose={() => setAsset(null)} />
    </div>
  );
}
