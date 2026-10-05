import React from 'react';
import { Tag as TagIcon, CalendarDays } from 'lucide-react';
import { settingsApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';
import EmptyState from '../EmptyState';
import { formatDate } from '../../utils/format';

/** 版本信息（只读）：顶部展示当前版本，下方按发布时间倒序列出历史版本及更新说明。数据来自后端 app_versions 表，新增版本只需追加一条记录。 */
export default function VersionSection() {
  const { data, loading, error, reload } = useAsync(() => settingsApi.getVersions(), []);
  if (loading) return <div className="space-y-3"><Skeleton.Block className="h-20 w-full" /><Skeleton.Block className="h-24 w-full" /></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const items = data?.items || [];
  if (!items.length) return <EmptyState title="暂无版本信息" description="版本记录由系统发布时写入" />;
  const cur = items[0];
  const history = items.slice(1);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-muted p-4 flex flex-wrap items-center gap-4" aria-label="当前版本">
        <div className="w-12 h-12 rounded-lg bg-primary-soft text-primary-text flex items-center justify-center shrink-0"><TagIcon size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-fg-muted">当前版本</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-semibold text-fg tabular-nums">V{cur.version}</span>
            <span className="tag-primary">当前</span>
            {cur.title && <span className="text-sm text-fg-muted">{cur.title}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-fg-muted"><CalendarDays size={14} />发布于 {formatDate(cur.releasedAt)}</div>
      </div>
      <section>
        <h3 className="text-sm font-semibold text-fg mb-2">版本说明</h3>
        <Notes text={cur.notes} />
      </section>
      {history.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-fg mb-2">历史版本</h3>
          <ol className="space-y-3">
            {history.map((v) => (
              <li key={v.version} className="rounded-lg border border-line p-3.5">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-sm font-semibold text-fg tabular-nums">V{v.version}</span>
                  <span className="tag-default">{formatDate(v.releasedAt)}</span>
                  {v.title && <span className="text-xs text-fg-muted">{v.title}</span>}
                </div>
                <Notes text={v.notes} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Notes({ text }) {
  const lines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return <p className="text-xs text-fg-subtle">暂无说明</p>;
  return <ul className="list-disc pl-5 space-y-1 text-[13px] text-fg-muted">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>;
}
