import React from 'react';
import { ExternalLink } from 'lucide-react';

/** 控制台地址：纯 IP 默认 https://<IP>；已带 http(s):// 则原样使用。新标签页打开，阻断 opener。 */
export const consoleUrl = (ip) => {
  const v = (ip || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

/** ConsoleLink —— 控制台 IP 超链接（点击跳转到对应云平台的浏览器页面）。stopPropagation 避免触发行点击。 */
export default function ConsoleLink({ ip, className = '' }) {
  if (!ip) return <span className="text-fg-subtle">-</span>;
  const url = consoleUrl(ip);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`在新标签页打开控制台：${url}`} aria-label={`打开控制台 ${ip}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[13px] font-mono text-primary-text hover:underline ${className}`}>
      {ip}<ExternalLink size={12} className="shrink-0" />
    </a>
  );
};
