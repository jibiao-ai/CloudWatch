import React from 'react';
import { formatDateTime } from '../../utils/format';
import { STATUS_TAG, TRIGGER_TEXT } from './hosts';

const CHANNELS = [{ key: 'local', label: '本机 hosts' }, { key: 'dns', label: '内置 DNS' }, { key: 'docker', label: 'Docker 容器' }];

/** ReportPanel —— 最近一次同步结果：三个通道的状态、原因与逐容器注入结果 */
export default function ReportPanel({ report }) {
  return (
    <section className="card p-5" aria-label="最近一次同步结果">
      <h3 className="text-sm font-semibold text-fg">最近一次同步</h3>
      {!report ? <p className="text-[13px] text-fg-muted mt-2">尚未执行过同步。新增映射或点击「立即同步」后在此查看结果。</p> : (
        <>
          <p className="text-xs text-fg-muted mt-1">{formatDateTime(report.at)} · {TRIGGER_TEXT[report.trigger] || report.trigger} · {report.by || '系统'} · 共 {report.lines} 条记录</p>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {CHANNELS.map(({ key, label }) => {
              const c = report[key] || { status: 'disabled', message: '' };
              const tag = STATUS_TAG[c.status] || STATUS_TAG.disabled;
              return (
                <li key={key} className="px-3 py-2.5">
                  <div className="flex items-center gap-2"><span className="text-sm text-fg w-28 shrink-0">{label}</span><span className={tag.cls}>{tag.text}</span><span className={`text-xs break-all ${c.status === 'failed' ? 'text-danger' : 'text-fg-muted'}`}>{c.message}</span></div>
                  {!!c.targets?.length && (
                    <ul className="mt-2 ml-28 space-y-1">
                      {c.targets.map((t) => (
                        <li key={t.id || t.name} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono text-fg">{t.name}</span><span className={t.status === 'ok' ? 'tag-success' : 'tag-danger'}>{t.status === 'ok' ? '已注入' : '失败'}</span>
                          {t.method && <span className="text-fg-muted">方式：{t.method}</span>}{t.error && <span className="text-danger break-all">{t.error}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
