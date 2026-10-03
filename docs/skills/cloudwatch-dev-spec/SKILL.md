---
name: cloudwatch-dev-spec
description: CloudWatch（私有云 / OpenStack 可观测与运营控制台）的开发规格库。凡是要在该项目或同类「React + Tailwind + Go 标准库 + MariaDB」管理控制台里新增页面、组件、接口、数据表、策略、导出、部署时使用；包含技术栈锁定、铁律（lint 自动阻断）、组件库用法、前后端约定、运营分析策略引擎、交付与远程验证流程。
---

# CloudWatch 开发规格库（Skill）

> 用法：把本目录整体放入任意 AI 编码助手的 skills 目录（或作为项目 `docs/skills/`），开发前先读本文件，再按需读 `references/`。
> 所有「铁律」都有脚本自动阻断（`npm run lint:rules`），违反即构建失败，不要试图绕过。

## 1. 技术栈（锁定，不得替换）

| 层 | 选型 |
|---|---|
| 前端 | React 18 + Vite 5 + Tailwind CSS 3，**JSX，无 TypeScript**；recharts；zustand（**单一 store**）；axios（**单一 `services/api.js`**）；lucide-react |
| 后端 | Go 1.22，**仅标准库 `net/http`**（`ServeMux` 方法路由 `"GET /api/x/{id}"`），`database/sql` + MariaDB/MySQL，bcrypt，excelize（导出） |
| 部署 | docker compose：`cloudwatch-backend` / `cloudwatch-db` / `cloudwatch-web`（nginx :3000，反代 `/api`） |
| 迁移 | `backend/internal/db/migrations/NNNN_xxx.sql`，`embed` 内嵌，启动自动执行，记录于 `schema_migrations`；只增不改，已发布的迁移不得修改 |

目录：`frontend/src/{components,pages,hooks,services,store,styles,utils}`、`backend/internal/{api,analytics,capacity,monitor,audit,auth,perm,httpx,...}`。

## 2. 铁律（`frontend/scripts/check-rules.mjs` 自动扫描）

1. **所有参数必须在页面录入**，禁止写进后端配置文件；环境变量仅作启动引导（`CW_ADDR / CW_DB_DSN / CW_SECRET_KEY / CW_ADMIN_PASSWORD`）。
2. **颜色只走 CSS 变量**（`styles/index.css`，主色 `#C6242A` 运行时可配置）：禁止 `#fff` 等硬编码色值、禁止 Tailwind 调色板类（`bg-white / gray-* / red-*` …）、**禁止 `dark:` 前缀**。使用语义类：`bg-card bg-muted bg-hover text-fg text-fg-muted text-fg-subtle border-line bg-primary text-primary-text bg-primary-soft text-success bg-success-soft …`。
3. **图表颜色只能来自 `useChartPalette()`**。
4. **禁止原生控件**：原生 `<select>`（用 `CustomSelect`）、`window.confirm/alert/prompt`（用 `ConfirmModal` / `Toast`）、原生 checkbox / radio（用 `Checkbox` / `Radio`）、**原生日期/时间输入 `input[type=date|datetime-local|time|month|week]`（用自绘 `DatePicker`，第33轮新增）**。弹层统一 `Portal`。
5. **禁止毛玻璃**（`glass / backdrop-blur / backdrop-filter`）；弹窗/下拉/Toast/Tooltip 一律实色 `bg-card + border + shadow`（`.surface` / `.card-pop`）。
6. **输入聚焦无彩色高亮**：不得使用 `focus:ring`、`focus:border-primary`、`outline-primary`；统一 `.field`。
7. **页面不得直接 `fetch/axios`**，只能经 `services/api.js`（mock 在 `services/mock/`）。
8. **禁止 `role === 'admin'` 硬编码**，权限一律 `useCan('module:action')`。
9. **禁止 emoji 当图标**，用 lucide-react。
10. **`*Page.jsx` ≤ 400 行**，业务拆到 `components/<module>/`。
11. 功能必须**真实后端 + 数据库持久化**，不得用内存/前端假数据交差。
12. 密码/密钥保存后一律显示 `******`（`SecretInput`），任何位置不回显；审计详情递归脱敏 `password/token/secret`。

提交前必跑：`cd frontend && npm run lint:rules && npm run build`；后端：`gofmt -l . && go vet ./... && go test ./...`。

## 3. 组件库速查（`frontend/src/components/`）

| 组件 | 要点 |
|---|---|
| `CustomSelect` | `options[{value,label,hint,group,disabled}] / value / onChange / multiple / searchable / clearable / size('sm'|'md') / placeholder / aria-label / minWidth`；触发器 `role="combobox"`，选项 `role="option"` |
| `DatePicker` | 自绘日历（Portal 弹层，实色卡片）。`value('YYYY-MM-DD' | withTime 时 'YYYY-MM-DDTHH:mm') / onChange / min / max / withTime / clearable / size / width / aria-label`；上/下年月切换、今天高亮、范围外禁用、弹层空间不足自动上翻、Esc/点外部关闭。**交互参照 CustomSelect** |
| `DataTable` | 服务端分页/排序受控：`columns[{key,title,width,align,sortable,sticky:'right',render}] / rows / rowKey / loading / refreshing / error / onRetry / page,pageSize,total,onPageChange / sort,onSortChange / selectable,selected,onSelectedChange,selectionBar / toolbar / extra / empty{title,description}` |
| `Modal` / `Drawer` / `ConfirmModal` | Portal；`ConfirmModal(danger)` 默认聚焦「取消」；`impactList` 列影响范围，`targets` 列目标资源 |
| `PageHeader` | `title / description / actions`；actions 靠右，描述过长时自动换行不挤压操作区 |
| `Tabs` | `items[{key,label,count}] / value / onChange / idPrefix`（面板 `id=${idPrefix}-panel` 关联） |
| `SearchInput` | 防抖 300ms，`value / onChange / placeholder / width / aria-label` |
| `ExportButton` | `fn(params) => Blob`（api.js 的 exportXxx）、`params` 为**当前筛选条件**（导出 = 当前筛选结果） |
| `FormField` / `LoadingButton` / `Switch` / `Checkbox` / `Radio` / `Tooltip` / `EmptyState` / `ErrorState` / `Skeleton` / `StatCard` / `StatusDot` | 见各文件头注释 |

hooks：`useAsync(fn, deps)`（loading/refreshing/error/reload）、`useListQuery(key, fetcher, initial)`（服务端列表，筛选分页存 store）、`useClientTable`（整表前端搜索/排序/分页）、`useCan`、`useChartPalette`、`useToast`。

通用样式类：`.card .card-pop .surface .field .field-error .label .hint .btn .btn-primary .btn-default .btn-ghost .btn-danger .btn-sm .btn-icon .tag-default/.tag-primary/.tag-success/.tag-warning/.tag-danger/.tag-info .th .td`。

## 4. 新增一个功能的标准步骤

1. **迁移**：`backend/internal/db/migrations/NNNN_name.sql`（`IF NOT EXISTS`，utf8mb4）。
2. **权限**：`backend/internal/perm/perm.go` 登记 `module:action` 与菜单；前端 `useCan` 控制按钮。
3. **后端接口**：`internal/api/<module>.go` 写 handler，`server.go` 用 `mux.Handle("GET /api/x", s.guard("x:view", s.handler))` 注册；返回 `httpx.OK(w, data)` / `httpx.Err(status,msg)`；字段校验失败 `HTTP 400 / code 40001 / data.fields`；**写操作必须 `s.rec(...)` 记审计**。统一信封 `{code,message,data}`。
4. **前端 API**：`services/api.js` 按模块分组导出 `xxxApi`，导出类用 `blob()`。
5. **页面**：`pages/XxxPage.jsx`（≤400 行）+ `components/xxx/`；加载/空/错误三态齐全；表格列用 `DataTable`；筛选放 `FilterBar`。
6. **测试**：Go 单测覆盖纯逻辑（策略求值、匹配、分页）；Playwright e2e 覆盖主流程并截图。
7. **README**：追加「第N轮」小节（做了什么 / 接口 / 数据口径 / 已知限制）。

## 5. 分页与搜索约定

- 列表默认 10 条/页（`[10,20,50]`），后端 `Paginate(rows, ListQuery)`；排序空值恒排最后。
- 页头全局搜索（运营分析）：`AnalyticsShell` 在「刷新」右侧提供搜索框，关键字下发给当前页签：列表页签（优化建议 / 优化策略 / 总览平台表）直接过滤；图表页签（资源分析 / 云主机 / 磁盘）出现 `SearchHits` 卡片，匹配「云平台/计算节点/集群存储」，点击即作为筛选条件。切换页签自动清空。

## 6. 交付与验证流程（每一轮固定）

实现 → 本地验证（lint/build/vet/test + Playwright e2e + 截图）→ README → `git commit && git push origin main` → 部署 → 远程验证 → 中文汇报（提示 Ctrl+F5、提醒修改服务器 root 密码）。部署与远程验证细节见 `references/deploy-and-verify.md`。

## 7. 参考文档索引

- `references/iron-rules.md` — 铁律逐条说明与违规/正确示例
- `references/frontend-patterns.md` — 页面/筛选/表格/弹层/日期选择/全局搜索 的代码范式
- `references/backend-patterns.md` — handler、审计、权限、迁移、导出、分页范式
- `references/analytics-policy-engine.md` — 运营分析优化策略引擎（12 条内置 + 自定义）与「无数据」排查
- `references/deploy-and-verify.md` — 打包部署、远程验证、常见故障
- `references/checklist.md` — 提交前检查清单
