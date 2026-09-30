import React from 'react';
import { CircleCheck, CircleX, Loader2, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

const ORDER = [['token', '获取 Token'], ['keystone', 'Keystone（认证）'], ['nova', 'Nova（计算）'], ['neutron', 'Neutron（网络）'], ['cinder', 'Cinder（块存储）'], ['glance', 'Glance（镜像）']];

/**
 * VerifyResult —— 验证连接结果：逐组件一行（取 token / keystone / nova / neutron / cinder / glance），成功绿、失败红并展示上游原始错误；
 * 展示 token 有效期与 roles。属性：loading / result
 */
export default function VerifyResult({ loading, result }) {
  const map = Object.fromEntries((result?.items || []).map((i) => [i.key, i]));
  return (
    <div className="rounded-lg border border-line overflow-hidden" aria-live="polite">
      <div className="px-4 py-2.5 bg-muted flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg flex items-center gap-1.5"><ShieldCheck size={15} /> 连接验证</span>
        {result && <span className={result.ok ? 'tag-success' : 'tag-danger'}>{result.ok ? '全部通过' : '存在失败项'}</span>}
      </div>
      <ul className="divide-y divide-line">
        {ORDER.map(([k, label]) => {
          const it = map[k];
          return (
            <li key={k} className="px-4 py-2.5 flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {loading ? <Loader2 size={16} className="animate-spin text-fg-subtle" /> : !it ? <span className="block w-4 h-4 rounded-full border border-line-strong" /> : it.ok ? <CircleCheck size={16} className="text-success" /> : <CircleX size={16} className="text-danger" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">{label}</span>
                  {it?.latencyMs != null && <span className="text-xs text-fg-subtle tabular-nums">{it.latencyMs} ms</span>}
                </div>
                {it?.ok && it.message && <div className="text-xs text-success mt-0.5">{it.message}</div>}
                {it && !it.ok && <pre className="mt-1 text-xs text-danger bg-danger-soft rounded px-2 py-1.5 whitespace-pre-wrap break-all font-mono">{it.error}</pre>}
              </div>
            </li>
          );
        })}
      </ul>
      {result?.token && (
        <div className="px-4 py-3 border-t border-line bg-muted/50 text-xs text-fg-muted space-y-1.5">
          <div>项目：<b className="text-fg font-medium">{result.token.project}</b>　有效期至：<b className="text-fg font-medium">{formatDateTime(result.token.expiresAt, false)}</b></div>
          <div className="flex items-center gap-1.5 flex-wrap">Roles：{result.token.roles.map((r) => <span key={r} className="tag-primary">{r}</span>)}</div>
        </div>
      )}
    </div>
  );
}
