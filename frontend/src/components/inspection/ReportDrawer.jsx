import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Drawer from '../Drawer';
import Tabs from '../Tabs';
import StatusTag from './StatusTag';
import { STATUS, TRIGGER } from './common';
import { formatDateTime } from '../../utils/format';

const COUNT_TONE = { ok: 'text-success', warn: 'text-warning', bad: 'text-danger', na: 'text-fg-muted' };

function DetailTable({ t }) {
  return (
    <div className="mt-2.5">
      <div className="text-xs font-medium text-fg-muted mb-1">{t.title}</div>
      <div className="overflow-x-auto border border-line rounded-lg">
        <table className="w-full text-[13px]">
          <thead className="bg-muted text-fg-muted"><tr>{t.cols.map((c) => <th key={c} className="text-left font-medium px-2.5 py-1.5 whitespace-nowrap">{c}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((v, j) => <td key={j} className="px-2.5 py-1.5 break-all">{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {(t.more > 0 || t.note) && <p className="text-xs text-fg-subtle mt-1">{t.note}{t.more > 0 ? ` 另有 ${t.more} 条未列出，完整数据请在对应页面查看。` : ''}</p>}
    </div>
  );
}

function ItemCard({ it }) {
  const [open, setOpen] = useState(it.status === 'bad' || it.status === 'warn');
  return (
    <div className="border border-line rounded-lg">
      <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <StatusTag value={it.status} />
        <span className="font-medium text-sm text-fg shrink-0">{it.name}</span>
        <span className="text-[13px] text-fg-muted truncate" title={it.value}>{it.value}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-[13px] space-y-1.5 border-t border-line pt-2.5">
          {it.detail && <p><span className="text-fg-muted">检查说明：</span>{it.detail}</p>}
          {it.standard && <p className="text-fg-subtle"><span className="text-fg-muted">判定标准：</span>{it.standard}</p>}
          {it.advice && (it.status === 'bad' || it.status === 'warn') && <p className={it.status === 'bad' ? 'text-danger' : 'text-warning'}><span className="font-medium">处理建议：</span>{it.advice}</p>}
          {(it.tables || []).map((t) => <DetailTable key={t.title} t={t} />)}
        </div>
      )}
    </div>
  );
}

/** ReportDrawer —— 巡检报告详情：基本信息 / 各状态数量 / 按平台与分组展示全部检查项 */
export default function ReportDrawer({ report, groups, onClose, footer }) {
  const [pi, setPi] = useState(0);
  useEffect(() => setPi(0), [report?.id]);
  const plats = report?.platforms || [];
  const p = plats[pi];
  const kv = report ? [['发起方式', TRIGGER[report.trigger] || report.trigger], ['发起人', report.operatorName || report.operator || '-'], ['开始时间', formatDateTime(report.startedAt)], ['完成时间', formatDateTime(report.finishedAt)], ['实时刷新数据', report.refreshed ? '是' : '否（使用最近一次采集的数据）']] : [];
  return (
    <Drawer open={!!report} title={report?.title || '巡检报告'} subtitle={report && `综合评估：${STATUS[report.overall]?.label} · 健康评分 ${report.score}`} width={860} onClose={onClose} footer={footer}>
      {report && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            {kv.map(([k, v]) => <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd className="text-sm text-fg mt-0.5">{v}</dd></div>)}
          </dl>
          <p className="text-sm text-fg bg-muted rounded-lg px-3 py-2.5">{report.summary}</p>
          {plats.length > 1 && <Tabs idPrefix="insp-plat" value={String(pi)} onChange={(k) => setPi(+k)} items={plats.map((x, i) => ({ key: String(i), label: x.name }))} />}
          {p && (
            <div id="insp-plat-panel" className="space-y-5">
              <div className="grid grid-cols-5 gap-3">
                <div className="card p-3"><div className="text-xs text-fg-muted">健康评分</div><div className="text-2xl font-semibold tabular-nums">{p.score}</div></div>
                {['ok', 'warn', 'bad', 'na'].map((k) => <div key={k} className="card p-3"><div className="text-xs text-fg-muted">{STATUS[k].label}</div><div className={`text-2xl font-semibold tabular-nums ${COUNT_TONE[k]}`}>{p.counts[k]}</div></div>)}
              </div>
              {(p.notes || []).map((n) => <p key={n} className="text-xs text-warning bg-warning-soft rounded-lg px-3 py-2">提示：{n}</p>)}
              <section>
                <h3 className="text-[13px] font-semibold text-fg mb-1.5">平台环境信息</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2">{(p.env || []).map((e) => <div key={e.k} className="flex gap-2 text-[13px]"><dt className="text-fg-muted shrink-0">{e.k}</dt><dd className="text-fg break-all">{e.v || '-'}</dd></div>)}</dl>
              </section>
              {groups.map((g) => {
                const its = p.items.filter((i) => i.group === g);
                return its.length ? (
                  <section key={g}>
                    <h3 className="text-[13px] font-semibold text-fg mb-2">{g}</h3>
                    <div className="space-y-2">{its.map((it) => <ItemCard key={it.key} it={it} />)}</div>
                  </section>
                ) : null;
              })}
              <section>
                <h3 className="text-[13px] font-semibold text-fg mb-1.5 flex items-center gap-1.5"><ShieldCheck size={15} /> 巡检结论与建议</h3>
                <p className="text-sm text-fg">{p.summary}</p>
                <ol className="list-decimal pl-5 mt-1.5 space-y-1 text-sm text-fg">{(p.advices || []).map((a) => <li key={a}>{a}</li>)}</ol>
              </section>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
