import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import NodeChip from './NodeChip';
import { LAYERS, TYPES, sortBySeverity } from './topoUtil';

const LIMIT = 18; // 每个分组默认最多显示的节点数，其余折叠

/** 一个分组（同一层内的某种类型）：必须显示的节点（选中 / 关联）始终展示，其余按 LIMIT 折叠 */
function Group({ type, nodes, must, selected, dim, onPick, open, onToggle }) {
  const sorted = useMemo(() => sortBySeverity(nodes), [nodes]);
  const shown = open ? sorted : sorted.filter((n, i) => i < LIMIT || must.has(n.id));
  const hidden = sorted.length - shown.length;
  return (
    <div className="min-w-0">
      <div className="text-xs text-fg-muted mb-1.5 flex items-center gap-2">
        <span className="font-medium text-fg">{TYPES[type].label}</span><span className="tabular-nums">{nodes.length}</span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {shown.map((n) => (
          <div key={n.id} className={dim(n.id) ? 'opacity-30' : ''}><NodeChip node={n} active={selected === n.id} onClick={onPick} /></div>
        ))}
      </div>
      {(hidden > 0 || (open && sorted.length > LIMIT)) && (
        <button type="button" className="btn-ghost btn-sm mt-2" onClick={onToggle}>
          {open ? <><ChevronUp size={14} />收起</> : <><ChevronDown size={14} />展开其余 {hidden} 个</>}
        </button>
      )}
    </div>
  );
}

/** 关系连线：只绘制与选中节点相关的链路（上游 + 下游），从上层卡片底部到下层卡片顶部 */
function Edges({ box, edges, rel }) {
  const [paths, setPaths] = useState([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !rel) { setPaths([]); return undefined; }
    const calc = () => {
      const b = el.getBoundingClientRect();
      const pos = (id) => { const n = el.querySelector(`[data-nid="${CSS.escape(id)}"]`); return n ? n.getBoundingClientRect() : null; };
      const out = [];
      edges.forEach((e, i) => {
        if (!rel.has(e.from) || !rel.has(e.to)) return;
        const a = pos(e.from); const c = pos(e.to);
        if (!a || !c) return;
        const x1 = a.left + a.width / 2 - b.left; const y1 = a.bottom - b.top;
        const x2 = c.left + c.width / 2 - b.left; const y2 = c.top - b.top;
        const dy = Math.max(24, (y2 - y1) / 2);
        out.push({ k: i, t: e.type, d: `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}` });
      });
      setPaths(out);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, edges, rel]);
  if (!paths.length) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true">
      {paths.map((p) => <path key={p.k} d={p.d} fill="none" className="stroke-primary" strokeWidth="1.5" strokeOpacity="0.75" strokeDasharray={p.t === 'attach' || p.t === 'nic' || p.t === 'net' || p.t === 'store' ? '5 3' : undefined} />)}
    </svg>
  );
}

/** 分层视图：物理层 → 计算层 → 实例层 → 挂载层 → 后端层 */
export default function LayerView({ graph, nodes, selected, rel, focusOnly, onPick }) {
  const box = useRef(null);
  const [open, setOpen] = useState({});
  const visible = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const must = rel || new Set();
  const dim = (id) => !!rel && !rel.has(id);
  const layers = LAYERS.map((l) => ({
    ...l,
    groups: l.types.map((t) => ({ type: t, nodes: nodes.filter((n) => n.type === t && (!focusOnly || !rel || rel.has(n.id))) })).filter((g) => g.nodes.length),
  })).filter((l) => l.groups.length);
  const edges = useMemo(() => graph.edges.filter((e) => visible.has(e.from) && visible.has(e.to)), [graph.edges, visible]);
  if (!layers.length) return <div className="text-sm text-fg-muted py-10 text-center">没有符合筛选条件的资源</div>;
  return (
    <div ref={box} className="relative space-y-4" id="topo-layers">
      {layers.map((l, i) => (
        <section key={l.key} id={`topo-layer-${l.key}`} className="card px-4 py-3" aria-label={l.title}>
          <header className="flex items-baseline gap-2 mb-2.5">
            <span className="w-5 h-5 rounded-full bg-primary-soft text-primary-text text-xs flex items-center justify-center font-semibold tabular-nums">{i + 1}</span>
            <h3 className="text-sm font-semibold text-fg">{l.title}</h3>
            <span className="text-xs text-fg-subtle">{l.desc}</span>
          </header>
          <div className="grid gap-4" style={{ gridTemplateColumns: l.groups.length > 1 ? 'repeat(auto-fit, minmax(380px, 1fr))' : '1fr' }}>
            {l.groups.map((g) => (
              <Group key={g.type} type={g.type} nodes={g.nodes} must={must} selected={selected} dim={dim} onPick={onPick}
                open={!!open[g.type]} onToggle={() => setOpen((o) => ({ ...o, [g.type]: !o[g.type] }))} />
            ))}
          </div>
        </section>
      ))}
      <Edges box={box} edges={edges} rel={rel} />
    </div>
  );
}
