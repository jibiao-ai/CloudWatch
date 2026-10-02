import React from 'react';
import { ExternalLink } from 'lucide-react';

/** 控制台地址：纯 IP 默认 https://<IP>；已带 http(s):// 则原样使用。新标签页打开，阻断 opener。 */
export const consoleUrl = (ip) => {
  const v = (ip || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

/** ConsoleLink —— 控制台 IP 超链接（点击跳转到对应云平台的浏览器页面）。stopPropagation 避免触发行点击。 */
export default function ConsoleLink({ ip, className = '', plain = false }) {
  if (!ip) return <span className="text-fg-subtle">-</span>;
  const url = consoleUrl(ip);
  if (plain) { // IP 以普通文字展示；仅点击右侧链接按钮才打开控制台（不显示链接样式 / 地址提示）
    return (
      <span className={`inline-flex items-center gap-1 text-[13px] font-mono text-fg-muted ${className}`}>
        {ip}
        <a href={url} target="_blank" rel="noopener noreferrer" title="打开控制台" aria-label={`打开控制台 ${ip}`} onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-5 h-5 rounded text-primary-text hover:bg-hover"><ExternalLink size={12} className="shrink-0" /></a>
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`在新标签页打开控制台：${url}`} aria-label={`打开控制台 ${ip}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[13px] font-mono text-primary-text hover:underline ${className}`}>
      {ip}<ExternalLink size={12} className="shrink-0" />
    </a>
  );
};
