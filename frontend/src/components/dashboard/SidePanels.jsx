import React from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import EmptyState from '../EmptyState';
import { fromNow } from '../../utils/format';

const SEV = { critical: ['严重', 'tag-danger'], warning: ['警告', 'tag-warning'], info: ['提示', 'tag-info'] };

function Panel({ title, more, children, label }) {
  return (
    <section className="card overflow-hidden" aria-label={label || title}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-line">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        {more && <Link to={more[0]} className="text-[13px] text-primary-text hover:underline">{more[1]} →</Link>}
      </div>
      {children}
    </section>
  );
}

/** RecentAlerts —— 最新活跃告警（按严重程度、时间），点击跳转告警中心并打开详情 */
export function RecentAlerts({ rows }) {
  return (
    <Panel title="最新活跃告警" more={['/alerts', '告警中心']}>
      {!rows?.length ? <EmptyState compact title="当前无活跃告警" /> : (
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id}>
              <Link to={`/alerts?open=${a.id}`} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-hover/60 transition-colors">
                <span className={`${SEV[a.severity]?.[1] || 'tag-default'} shrink-0 mt-0.5`}>{SEV[a.severity]?.[0] || a.severity}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg truncate">{a.name}</div>
                  <div className="text-xs text-fg-muted truncate">{a.provider || '-'} · {a.object || '-'} · {fromNow(a.firedAt)}</div>
                </div>
                {!a.acked && <span className="tag-default shrink-0">未确认</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Suggestions —— 运营中心命中的优化建议（有命中资源的策略） */
export function Suggestions({ rows }) {
  return (
    <Panel title="优化建议" more={['/analytics', '运营中心']}>
      {!rows?.length ? <EmptyState compact title="暂无命中的优化建议" /> : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 6).map((s) => (
            <li key={s.kind}>
              <Link to="/analytics" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-hover/60 transition-colors">
                <span className="w-7 h-7 rounded-md bg-warning-soft text-warning flex items-center justify-center shrink-0"><Lightbulb size={15} /></span>
                <span className="text-sm text-fg flex-1 min-w-0 truncate">{s.name}</span>
                <span className="tag-warning tabular-nums">{s.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
