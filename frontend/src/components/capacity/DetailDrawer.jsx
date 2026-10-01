import React, { useEffect, useState } from 'react';
import Drawer from '../Drawer';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import ConsoleLink from '../ConsoleLink';
import { capacityApi } from '../../services/api';
import { formatDateTime, formatNumber, formatBytes } from '../../utils/format';
import { FIELDS } from './fields';
import { gb, mb } from './capUtil';
import { VmExtra, PhysExtra } from './DetailExtra';

/** 把原始 JSON 打平成 路径 → 值，便于逐项查看「全量信息」 */
function flat(v, p = '', out = []) {
  if (v !== null && typeof v === 'object') {
    const ents = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    if (!ents.length) out.push([p, Array.isArray(v) ? '[]' : '{}']);
    ents.forEach(([k, x]) => flat(x, p ? `${p}${Array.isArray(v) ? `[${k}]` : `.${k}`}` : String(k), out));
  } else out.push([p, v === null ? 'null' : String(v)]);
  return out;
}

const fmtVal = (row, [, key, type]) => {
  const v = row[key];
  if (v == null || v === '') return '—';
  if (type === 'gb') return gb(v);
  if (type === 'mb') return mb(v);
  if (type === 'bytes') return formatBytes(v, 2);
  if (type === 'time') return formatDateTime(v);
  if (type === 'num') return formatNumber(v);
  if (type === 'console') return <ConsoleLink ip={v} />;
  return String(v);
};

/** 详情抽屉：先展示列表行（已含全部加工字段），再向后端取单条详情（含接口返回的原始 JSON） */
export default function DetailDrawer({ kind, title, row, anchor, onClose }) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const [tab, setTab] = useState('fields');
  useEffect(() => {
    if (!row) return undefined;
    let alive = true;
    setTab('fields');
    setState({ loading: true, data: null, error: null });
    capacityApi.getDetail(kind, row.providerId, row.id)
      .then((d) => alive && setState({ loading: false, data: d, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e }));
    return () => { alive = false; };
  }, [kind, row]);
  const d = state.data || row;
  const pairs = state.data?.raw ? flat(state.data.raw) : [];
  return (
    <Drawer open={!!row} title={row ? `${title}详情：${row.name || row.id}` : ''} subtitle={row?.providerName} width={720} anchor={anchor} onClose={onClose}>
      {row && (
        <div className="space-y-5">
          <div role="tablist" className="flex gap-1 border-b border-line">
            {[['fields', '基本信息'], ['all', `全部字段${pairs.length ? `（${pairs.length}）` : ''}`], ['json', '原始 JSON']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === k ? 'border-primary text-primary-text font-medium' : 'border-transparent text-fg-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
          {tab === 'fields' && FIELDS[kind].map(([sec, items]) => (
            <section key={sec}>
              <h3 className="text-[13px] font-semibold text-fg mb-2">{sec}</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                {items.map((it) => <div key={it[0]} className="min-w-0"><dt className="text-xs text-fg-muted">{it[0]}</dt><dd className="text-sm text-fg mt-0.5 break-all">{fmtVal(d, it)}</dd></div>)}
              </dl>
            </section>
          ))}
          {tab === 'fields' && kind === 'vms' && <VmExtra row={d} loading={state.loading} />}
          {tab === 'fields' && kind === 'phys' && <PhysExtra row={d} loading={state.loading} />}
          {tab !== 'fields' && (state.loading ? <Skeleton.Cards count={2} />
            : state.error ? <ErrorState error={state.error} onRetry={() => setState((s) => ({ ...s }))} />
              : tab === 'json' ? <pre className="text-xs text-fg bg-muted rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(state.data?.raw, null, 2)}</pre>
                : (
                  <table className="w-full text-[13px]"><tbody>
                    {pairs.map(([k, v]) => <tr key={k} className="border-b border-line align-top"><td className="py-1.5 pr-3 text-fg-muted font-mono break-all w-[42%]">{k}</td><td className="py-1.5 text-fg break-all">{v}</td></tr>)}
                  </tbody></table>
                ))}
        </div>
      )}
    </Drawer>
  );
}
