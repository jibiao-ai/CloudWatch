import React from 'react';
import { CircleCheck, CircleX, Loader2, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

/**
 * VerifyResult —— 验证连接结果：先看 Keystone 是否签发 Token，再逐个看八个组件域名的 HTTP 连通性。
 * 属性：loading / result（后端 items 含 key、host、ok、latencyMs、message、error）/ hosts（[{key,label,host}] 用于未出结果前的占位行）
 */
export default function VerifyResult({ loading, result, hosts = [] }) {
  const map = Object.fromEntries((result?.items || []).map((i) => [i.key, i]));
  const rows = [{ key: 'token', label: 'Keystone 认证 Token', host: hosts[0]?.host }, ...hosts];
  return (
    <div className="rounded-lg border border-line overflow-hidden" aria-live="polite" data-testid="verify-result">
      <div className="px-4 py-2.5 bg-muted flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg flex items-center gap-1.5"><ShieldCheck size={15} /> 连接验证</span>
        {result && <span className={result.ok ? 'tag-success' : result.status === 'warning' ? 'tag-warning' : 'tag-danger'}>{result.ok ? '全部通过' : result.status === 'warning' ? '部分组件不可达' : '认证失败'}</span>}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const it = map[r.key];
          return (
            <li key={r.key} className="px-4 py-2.5 flex items-start gap-3" data-verify-key={r.key}>
              <span className="mt-0.5 shrink-0">
                {loading ? <Loader2 size={16} className="animate-spin text-fg-subtle" /> : !it ? <span className="block w-4 h-4 rounded-full border border-line-strong" /> : it.ok ? <CircleCheck size={16} className="text-success" /> : <CircleX size={16} className="text-danger" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">{r.label}</span>
                  {it?.latencyMs > 0 && <span className="text-xs text-fg-subtle tabular-nums">{it.latencyMs} ms</span>}
                </div>
                {(it?.host || r.host) && <code className="block text-xs text-fg-muted break-all">{it?.host || r.host}</code>}
                {it?.ok && it.message && <div className="text-xs text-success mt-0.5">{it.message}</div>}
                {it && !it.ok && <pre className="mt-1 text-xs text-danger bg-danger-soft rounded px-2 py-1.5 whitespace-pre-wrap break-all font-mono">{it.error}</pre>}
              </div>
            </li>
          );
        })}
      </ul>
      {result?.token && (
        <div className="px-4 py-3 border-t border-line bg-muted/50 text-xs text-fg-muted space-y-1.5">
          <div>用户：<b className="text-fg font-medium">{result.token.user}</b>　项目：<b className="text-fg font-medium">{result.token.project}</b>　有效期至：<b className="text-fg font-medium">{formatDateTime(result.token.expiresAt)}</b></div>
          <div className="flex items-center gap-1.5 flex-wrap">Roles：{(result.token.roles || []).map((r) => <span key={r} className="tag-primary">{r}</span>)}</div>
        </div>
      )}
      {result?.at && <div className="px-4 py-2 border-t border-line text-xs text-fg-subtle">验证时间：{formatDateTime(result.at)}</div>}
    </div>
  );
}
