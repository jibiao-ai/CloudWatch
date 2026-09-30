import React from 'react';
import { Moon, Sun, Server, Cpu, Cloud, Boxes } from 'lucide-react';
import Logo, { LogoMark } from './Logo';
import { useStore } from '../store/useStore';
import { useAsync } from '../hooks/useAsync';
import { publicApi } from '../services/api';
import { formatNumber } from '../utils/format';

/**
 * AuthLayout —— 登录 / 强制改密共用：左品牌区（平台名 + 纳管规模概览，数据来自 /api/public/portal-info，不含环境 IP/账号）
 * + 右卡片（≤420px）。品牌区渐变跟随主色变量，暗色同样可用。
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const brand = useStore((s) => s.brand);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const { data } = useAsync(() => publicApi.getPortalInfo(), []);
  const stats = [
    { icon: Cloud, label: '纳管平台', value: data?.providerCount },
    { icon: Server, label: '计算节点', value: data?.hostCount },
    { icon: Cpu, label: '云主机', value: data?.vmCount },
    { icon: Boxes, label: '资源集群', value: data?.clusterCount },
  ];
  return (
    <div className="min-h-full h-full flex bg-bg">
      <section
        className="hidden lg:flex flex-1 relative overflow-hidden brand-gradient text-primary-on flex-col justify-between p-12"
        style={brand.loginBgUrl ? { backgroundImage: `linear-gradient(rgb(var(--c-primary) / .78), rgb(var(--c-primary-hover) / .9)), url(${brand.loginBgUrl})`, backgroundSize: 'cover' } : undefined}
      >
        <div className="absolute -right-24 -top-24 opacity-[.09] pointer-events-none"><LogoMark size={560} badge={false} className="text-primary-on" /></div>
        <div className="relative flex items-center gap-3">
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="w-11 h-11 rounded-xl bg-primary-on/15 p-1 object-contain" /> : <div className="w-11 h-11 rounded-xl bg-primary-on/15 flex items-center justify-center"><LogoMark size={30} badge={false} className="text-primary-on" /></div>}
          <div className="text-2xl font-bold tracking-tight">{brand.platformName}</div>
        </div>
        <div className="relative max-w-xl">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">一个界面，看清<br />平台到存储的全链路</h2>
          <p className="mt-4 text-[15px] opacity-85 leading-relaxed">{brand.subtitle}。统一纳管多套 OpenStack / 私有云，资源视图、巡检、监控、容量与告警一站式呈现。</p>
          <div className="mt-10 grid grid-cols-2 gap-4 max-w-md">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-primary-on/10 backdrop-blur-sm border border-primary-on/15 px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs opacity-80"><s.icon size={14} /> {s.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value == null ? '—' : formatNumber(s.value)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs opacity-70">{brand.copyright || '© 2026 CloudWatch'}</div>
      </section>

      <section className="flex-1 lg:max-w-[560px] flex flex-col relative">
        <div className="absolute top-4 right-4">
          <button type="button" className="btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[420px] animate-pop-in">
            <div className="lg:hidden mb-8"><Logo size={40} src={brand.logoUrl} name={brand.platformName} subtitle={brand.subtitle} /></div>
            <div className="card-glass !rounded-2xl p-8">
              <h1 className="text-xl font-semibold text-fg">{title}</h1>
              {subtitle && <p className="text-[13px] text-fg-muted mt-1.5">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </div>
            {footer && <div className="mt-4 text-center text-xs text-fg-muted">{footer}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
