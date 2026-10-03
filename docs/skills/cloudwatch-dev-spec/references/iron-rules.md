# 铁律逐条说明

规则实现：`frontend/scripts/check-rules.mjs`；新增规则时同步：1) 在 `rules` 数组加正则；2) 需豁免的文件写入 `allow`；3) 在脚本头部注释与 README「铁律」章节追加一行；4) 提供替代组件。

| # | 规则 | 违规示例 | 正确做法 |
|---|---|---|---|
| 1 | 原生 select | `<select>` | `<CustomSelect options=… />` |
| 2 | 原生日期/时间 | `<input type="date">` / `datetime-local` | `<DatePicker value onChange />`；带时间 `withTime` |
| 3 | 原生弹窗 | `window.confirm('删除?')` | `<ConfirmModal danger …/>` |
| 4 | 硬编码色 | `#C6242A`、`bg-red-500` | `bg-primary`、`text-danger`、`bg-danger-soft` |
| 5 | dark 前缀 | `dark:bg-black` | 变量自动随 `[data-theme=dark]` 切换 |
| 6 | 管理员硬编码 | `role === 'admin'` | `useCan('x:y')` |
| 7 | 直接请求 | `axios.get` / `fetch(` | `services/api.js` |
| 8 | 毛玻璃 | `backdrop-blur` | `.surface` / `.card-pop` |
| 9 | 聚焦彩色 | `focus:ring-2 focus:border-primary` | `.field`（仅中性色加深） |
| 10 | emoji 图标 | `📊` | `lucide-react` |
| 11 | 页面过长 | `XxxPage.jsx` > 400 行 | 拆 `components/xxx/` |

注释行（以 `*`、`/*` 开头）和行尾 `//` 注释不参与扫描。图表颜色用 `useChartPalette()` 返回的 `pal.primary / ok / warn / bad / series[]`。
