import React from 'react';
import { useChartPalette } from '../../hooks/useChartPalette';

const CX = 60;
const CY = 62;
const R = 44;
const START = 135; // 270° 仪表盘，自左下起顺时针
const SWEEP = 270;
const pt = (deg, r = R) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const arc = (from, to) => {
  const [x1, y1] = pt(START + (SWEEP * from) / 100);
  const [x2, y2] = pt(START + (SWEEP * to) / 100);
  const large = (SWEEP * (to - from)) / 100 > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
};

/** Gauge —— 分配率仪表盘：0-60% 常规 / 60-85% 偏高 / 85-100% 紧张 三段色 + 指针 + 数值。value 为 null 显示「-」 */
export default function Gauge({ value, label }) {
  const pal = useChartPalette();
  const has = value != null;
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const ang = START + (SWEEP * v) / 100;
  const [nx, ny] = pt(ang, R - 8);
  return (
    <figure className="flex flex-col items-center" aria-label={`${label} ${has ? `${value.toFixed(1)}%` : '暂无数据'}`}>
      <svg viewBox="0 0 120 100" className="w-[150px] h-[125px]" role="img">
        <path d={arc(0, 100)} fill="none" stroke={pal.grid} strokeWidth="9" strokeLinecap="round" />
        <path d={arc(0, 60)} fill="none" stroke={pal.series[1]} strokeWidth="9" strokeLinecap="round" />
        <path d={arc(60, 85)} fill="none" stroke={pal.warn} strokeWidth="9" />
        <path d={arc(85, 100)} fill="none" stroke={pal.bad} strokeWidth="9" strokeLinecap="round" />
        {has && (
          <>
            <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={pal.text} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx={CX} cy={CY} r="4.5" fill={pal.text} />
          </>
        )}
        <text x={CX} y={CY + 30} textAnchor="middle" fontSize="15" fontWeight="600" fill={pal.text}>{has ? `${value.toFixed(1)}%` : '-'}</text>
      </svg>
      <figcaption className="text-[13px] text-fg-muted -mt-1">{label}</figcaption>
    </figure>
  );
}
