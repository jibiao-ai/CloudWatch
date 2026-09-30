import React from 'react';

/**
 * Logo —— CloudWatch 品牌标识：眼睛（洞察）+ 表盘虹膜（watch）。
 * 属性：
 *  - size      图标尺寸(px)，默认 36
 *  - badge     是否带主色圆角底（默认 true；false 时描边跟随 currentColor，用于主色底上）
 *  - src       自定义 Logo 图片地址（来自「系统配置」，为空则使用内置矢量标识）
 *  - showText  是否显示文字 CloudWatch
 *  - name      平台名称（来自系统配置），默认 CloudWatch
 *  - subtitle  副标题
 * 颜色全部走 CSS 变量，主色改变后立即生效。
 */
export function LogoMark({ size = 36, badge = true, className = '' }) {
  const ink = badge ? 'rgb(var(--c-on-primary))' : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="CloudWatch">
      {badge && <rect width="64" height="64" rx="16" fill="rgb(var(--c-primary))" />}
      {/* 眼廓 */}
      <path d="M6 32C13 20 22 14 32 14s19 6 26 18c-7 12-16 18-26 18S13 44 6 32z" fill="none" stroke={ink} strokeWidth="3.2" strokeLinejoin="round" />
      {/* 虹膜 = 表盘 */}
      <circle cx="32" cy="32" r="11.5" fill="none" stroke={ink} strokeWidth="2.6" />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1="32" y1="21.6" x2="32" y2="23.6" stroke={ink} strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${a} 32 32)`} />
      ))}
      {/* 指针 */}
      <path d="M32 32V25M32 32l5.6 3.2" stroke={ink} strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="32" r="2.2" fill={ink} />
    </svg>
  );
}

export default function Logo({ size = 36, src, showText = true, name = 'CloudWatch', subtitle, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      {src ? (
        <img src={src} alt={name} style={{ width: size, height: size }} className="object-contain rounded-md shrink-0" />
      ) : (
        <LogoMark size={size} />
      )}
      {showText && (
        <div className="min-w-0 leading-tight">
          <div className="font-bold text-fg truncate tracking-tight" style={{ fontSize: size * 0.44 }}>
            {name}
          </div>
          {subtitle && <div className="text-[11px] text-fg-muted truncate">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
