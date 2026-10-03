import React, { useId } from 'react';
import { useChartPalette } from '../../hooks/useChartPalette';

const R = 44;
const W = 2 * R;

/** WaterCircle —— 使用率水球：水位随数值上升，颜色随水位变化（<70 常规 / <85 偏高 / 其余 紧张），双层波浪平移 */
export default function WaterCircle({ value, label }) {
  const pal = useChartPalette();
  const uid = useId().replace(/[^\w]/g, '');
  const has = value != null;
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const color = !has ? pal.axis : v < 70 ? pal.series[1] : v < 85 ? pal.warn : pal.bad;
  const level = W * (1 - v / 100); // 水面距圆顶的距离
  const path = `M 0 ${level} q ${W / 4} -5 ${W / 2} 0 t ${W / 2} 0 t ${W / 2} 0 t ${W / 2} 0 V ${W + 6} H 0 Z`;
  const txt = has ? `${value.toFixed(1)}%` : '-';
  return (
    <figure className="flex flex-col items-center" aria-label={`${label} ${has ? `${value.toFixed(1)}%` : '暂无数据'}`}>
      <svg viewBox="-6 -6 100 100" className="w-[116px] h-[116px]" role="img">
        <defs>
          <clipPath id={`${uid}-c`}><circle cx={R} cy={R} r={R} /></clipPath>
          <clipPath id={`${uid}-w`}><rect x="0" y={level} width={W} height={W} /></clipPath>
        </defs>
        <circle cx={R} cy={R} r={R + 2} fill="none" stroke={pal.grid} strokeWidth="3" />
        <g clipPath={`url(#${uid}-c)`}>
          <g opacity="0.45">
            <path d={path} fill={color}>
              <animateTransform attributeName="transform" type="translate" from="0 0" to={`${-W} 0`} dur="5s" repeatCount="indefinite" />
            </path>
          </g>
          <path d={path} fill={color} transform="translate(0 2)">
            <animateTransform attributeName="transform" type="translate" additive="sum" from={`${-W} 0`} to="0 0" dur="7s" repeatCount="indefinite" />
          </path>
          <text x={R} y={R + 5} textAnchor="middle" fontSize="14" fontWeight="600" fill={pal.text}>{txt}</text>
          <g clipPath={`url(#${uid}-w)`}>
            <text x={R} y={R + 5} textAnchor="middle" fontSize="14" fontWeight="600" fill={pal.inverse}>{txt}</text>
          </g>
        </g>
      </svg>
      <figcaption className="text-[13px] text-fg-muted">{label}</figcaption>
    </figure>
  );
}
