#!/usr/bin/env node
/**
 * FE-7 禁用项扫描：npm run lint:rules
 * 铁律（含 v2 新增）：禁止毛玻璃（glass/backdrop-blur/backdrop-filter）；输入类控件聚焦禁止彩色高亮（focus:ring / 彩色 focus 边框 / outline）
 * 检查：原生 <select> / window.confirm|alert|prompt / 硬编码颜色 / dark: 前缀 / emoji 图标 /
 *       role === 'admin' 硬编码 / 页面里直接 fetch|axios / 页面文件行数
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(ROOT).filter((f) => /\.(jsx?|css)$/.test(f));

// 主题定义文件允许出现颜色字面量
const COLOR_ALLOW = ['styles/index.css', 'utils/theme.js', 'services/mock/', 'tailwind.config'];
const rules = [
  { name: '原生 <select>', re: /<select[\s>]/, only: /\.jsx$/ },
  { name: 'window.confirm/alert/prompt', re: /\b(window\.)?(confirm|alert|prompt)\s*\(/, only: /\.jsx?$/, skip: (l) => /\.(confirm|alert)\w*\(/.test(l) || /(const|let)\s+(confirm|alert)/.test(l) },
  { name: '硬编码色值 #fff/#000 等', re: /#(?:[0-9a-fA-F]{3}){1,2}\b/, only: /\.jsx?$/, allow: COLOR_ALLOW, skip: (l) => /PRESET|value:\s*'#|'#C6242A'|placeholder|如 #|默认 #|<svg|fill=/.test(l) },
  { name: 'Tailwind 硬编码调色板类(bg-white/gray-*/slate-*…)', re: /\b(bg|text|border|ring|from|to|via)-(white|black|gray|slate|zinc|neutral|stone|red|green|blue|yellow|indigo|purple|pink|orange|amber|emerald|teal|cyan|sky|rose)(-\d{2,3})?\b/, only: /\.jsx?$/ },
  { name: 'dark: 前缀', re: /\bdark:[a-z]/, only: /\.jsx?$/ },
  { name: "role === 'admin' 硬编码", re: /role\s*===?\s*['"]admin['"]/, only: /\.jsx?$/ },
  { name: '页面/组件里直接 fetch/axios', re: /\b(fetch\(|axios\.)/, only: /\.jsx?$/, allow: ['services/api.js', 'services/mock/'] },
  { name: '铁律：禁止毛玻璃(glass/card-glass/backdrop-blur/backdrop-filter)', re: /\b(card-)?glass\b|backdrop-(blur|filter|saturate|brightness)|backdrop-filter/, only: /\.(jsx?|css)$/, skip: (l) => /铁律/.test(l) },
  { name: '铁律：输入聚焦禁止彩色高亮(focus:ring / focus:border-primary|danger / peer-focus ring / outline-primary)', re: /(focus|focus-visible|focus-within|peer-focus(-visible)?):(ring(?!-0)|border-(primary|danger|success|warning|info)|outline-(primary|danger))/, only: /\.(jsx?|css)$/ },
  { name: 'emoji 当图标', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, only: /\.jsx?$/, skip: (l) => /[✓×]|▾|▸/.test(l) && !/[\u{1F300}-\u{1FAFF}]/u.test(l) },
];
let bad = 0;
for (const f of files) {
  const rel = relative(ROOT, f).split(sep).join('/');
  const lines = readFileSync(f, 'utf8').split('\n');
  for (const r of rules) {
    if (r.only && !r.only.test(f)) continue;
    if (r.allow?.some((a) => rel.includes(a))) continue;
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (/^\s*(\*|\/\*)/.test(l)) return; // 注释行
      if (r.re.test(code) && !(r.skip && r.skip(l))) { bad += 1; console.log(`✗ [${r.name}] ${rel}:${i + 1}  ${l.trim().slice(0, 110)}`); }
    });
  }
  if (/pages\/.*Page\.jsx$/.test(rel)) {
    const n = lines.length;
    if (n > 400) { bad += 1; console.log(`✗ [页面行数>400] ${rel}: ${n} 行，需拆分`); }
  }
}
console.log(bad ? `\n共 ${bad} 处违规` : `\n✓ 规则扫描通过（${files.length} 个文件）`);
process.exit(bad ? 1 : 0);
