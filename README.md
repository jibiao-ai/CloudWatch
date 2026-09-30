# CloudWatch · 私有云可观测平台

<p align="center"><img src="docs/logo.svg" width="72" alt="CloudWatch logo" /></p>

面向 SRE 与云平台运维人员的**多云 / 私有云统一运维控制台**：把多个 OpenStack（易捷行云 ES 等）平台纳管到同一界面，
一眼看清 **平台 → 集群 → 节点 → 云主机 → 存储/网络** 全链路状态，并可一键回到原平台处理。

- **主色**：`#C6242A`（运行时可在「系统配置」修改，全站即时生效，含暗色）
- **Logo**：眼睛（洞察）+ 表盘虹膜（watch），SVG 矢量，`frontend/src/components/Logo.jsx`
- **风格参考**：[jibiao-ai/deliverydesk](https://github.com/jibiao-ai/deliverydesk)（页面命名 / 共享组件 / 单 store / 单 api.js / CSS 变量主题）
- **铁律**：所有参数**只允许在页面上填写**，不允许改后台配置文件

## 当前进度（首批交付：前端 · 登录 + 系统管理）

| 模块 | 状态 |
|---|---|
| 主题系统（CSS Variables · 浅/暗 · 主色运行时注入 · 图表色板） | ✅ |
| 共享组件（CustomSelect / ConfirmModal / Toast / Pagination / Skeleton / EmptyState / StatusDot / CapacityBar / RangeSelector / DataTable / Drawer / Modal / FullscreenButton …） | ✅ |
| 布局 + 侧栏（权限树生成 / 折叠持久化 / 图标模式 / 移动抽屉）+ 路由守卫 + 403/404/500 | ✅ |
| 登录 / 强制改密 / 个人信息 | ✅ |
| 运维概览（KPI · 容量条 · 趋势图 · 平台概况 · 高负载节点） | ✅ |
| **平台管理**（五步向导 · 五端点自动填充 · 逐组件验证连接 · 写操作开关全站联动 · 影响范围删除） | ✅ |
| 用户管理 / 角色管理（功能权限树 + 数据权限三级 allow/deny）/ 审计日志 / 域名配置 / 系统配置 | ✅ |
| 统一资源管理 / 资源视图 / 巡检 / 性能监控 / 容量 / 告警 / 拓扑 / 运营分析 | ⏳ 菜单与权限码已预留（占位页），待接口文档 |
| **后端（Go + MariaDB/MySQL）** | 🟡 已实现：认证 / 系统配置（5 组）/ 审计日志 / 图片资源 / 数据保留清理；**域名配置（hosts 映射 / 内置 DNS / Docker 注入）**；其余模块（平台/用户/角色/概览）暂为 mock |

## 系统配置（真实后端）

页面以**横向标签**一次只显示一组：基础信息 · 品牌信息 · 安全策略 · 数据保留 · 告警渠道；底部「上一项 / 第 X / 5 项 / 下一项」翻页，告警渠道列表自带分页（5/10/20 条）。
每组独立保存 / 撤销 / 恢复默认，未保存的标签带圆点提示；服务端字段级校验错误回显到对应输入框。

| 分组 | 后端真实行为 |
|---|---|
| 基础信息 / 品牌信息 | 入库 `settings`；Logo / 登录背景以二进制存入 `assets`（校验类型、尺寸），经 `/api/assets/{id}` 提供；主色即时生效 |
| 安全策略 | 登录真实执行：密码复杂度与最小长度（改密页据公开接口同步展示规则）、失败锁定、**登录验证码（默认关闭；开启后每次登录都必须输入，一次性、3 分钟有效）**、会话超时、最大并发会话、密码有效期/强制改密 |
| 数据保留 | 后台任务启动时及每小时分批清理 `audit_logs / metric_samples / inspection_results / alert_events` 与过期会话 |
| 告警渠道 | 邮件（SMTP）/ Webhook 真实发送；「测试」按钮真实投递；密钥 AES-256-GCM 加密入库，接口永不回显（`******`） |

## 域名配置（真实后端）

录入「云平台控制台 IP + 根域名」，自动生成各组件的 hosts 记录，并同步到本机与 Docker 容器，之后即可用域名访问云平台。
例：`192.168.27.150` + `openstack.svc.cluster.local` →

```
192.168.27.150 keystone.openstack.svc.cluster.local
192.168.27.150 neutron.openstack.svc.cluster.local
192.168.27.150 nova.openstack.svc.cluster.local
192.168.27.150 cinder.openstack.svc.cluster.local
192.168.27.150 glance.openstack.svc.cluster.local
```

- **映射**：可多条（每个根域名唯一）；默认组件 keystone/neutron/nova/cinder/glance，可勾选 emla，或自定义组件名；支持启用/停用、编辑、删除；「校验」逐项检查 本机 hosts / 内置 DNS / Docker / 控制台连通性（`IP:探测端口`）。
- **页面布局**：「域名配置 / 同步方式 / 最近一次同步」三个标签并排显示与切换（支持方向键、`#hash` 记忆当前标签、未保存红点提示），底部「上一项 / 第 i / 3 项 / 下一项」翻页。
- **三种同步通道**（页面「同步方式」配置，可同时开启，保存映射后自动执行；也可「立即同步」）：
  1. **本机 hosts 文件**：固定为 `/etc/hosts`（页面不可改路径），只维护 `# BEGIN/END CloudWatch managed` 受控区块，区块外内容原样保留；原子写入（临时文件 + rename，失败回退原地写）。
  2. **内置 DNS**：平台自带 UDP/TCP DNS 服务（默认 `0.0.0.0:53`，可改高位端口），受管域名直接应答，其余转发到「上游 DNS」（未配置则 REFUSED）。容器使用：`docker run --dns <本机IP> …`，或 `/etc/docker/daemon.json` 中 `{"dns":["<本机IP>"]}`。
  3. **Docker 容器注入**：通过 Docker Engine API（unix socket）把受控区块写入容器 `/etc/hosts`；范围固定为**所有运行中的容器**（无需选择）。写入方式依次尝试：宿主机直接写 `HostsPath` → `exec` 以 root 改写 → archive 上传；`host` 网络模式容器与宿主机共用 `/etc/hosts`，由本机通道覆盖（本机通道未开启时在报告中标记并提示）。**监听 Docker 启动事件，容器重启/新建后自动重新注入**。
- **权限**：`domain:view` / `domain:update` / `domain:verify`（角色管理中分配）；所有变更写入审计日志（新增/修改/删除/同步/验证）。
- **API**（均需登录）：`GET /api/domain-config` · `POST /api/domain-config/mappings` · `PUT|DELETE /api/domain-config/mappings/{id}` · `POST /api/domain-config/mappings/{id}/verify` · `PUT /api/domain-config/sync` · `POST /api/domain-config/apply`。字段校验失败返回 400 / code 40001 + `data.fields`。
- **数据**：表 `host_mappings`（迁移 `0002_hosts.sql`）；同步方式与最近同步结果存 `system_meta`（`hosts_sync` / `hosts_last_apply`）。服务启动时自动执行一次同步。
- **部署注意**：写 `/etc/hosts` 需要 root 或对该文件有写权限；监听 53 端口需 root / `CAP_NET_BIND_SERVICE`（或改用高位端口）；访问 Docker 需要对 `docker.sock` 有读写权限。后端若跑在容器内，需挂载宿主机 hosts 文件与 `/var/run/docker.sock`。
- **已验证范围**：后端 60 项接口测试 + 浏览器端到端 22 项（含用户示例、DNS 应答、hosts 保留/清理、容器注入）；Docker 部分用**模拟的 Docker Engine API** 验证，未连真实 dockerd，上线前请在真实 Docker 环境复测。

## 后端（`backend/`）

Go 1.22 · 标准库 `net/http` · `database/sql` + MySQL/MariaDB · bcrypt · 内嵌 SQL 迁移（`schema_migrations`，启动自动执行）。

**引导项环境变量**（仅用于启动引导，业务参数一律在页面配置）：

| 变量 | 说明 |
|---|---|
| `CW_ADDR` | 监听地址，默认 `:8080` |
| `CW_DB_DSN` | 数据库 DSN，如 `cloudwatch:pwd@tcp(127.0.0.1:3306)/cloudwatch` |
| `CW_SECRET_KEY` | 密钥加密主密钥；缺省时自动生成并存入 `system_meta` |
| `CW_ADMIN_PASSWORD` | 初始 admin 密码；缺省时随机生成，**仅在首次启动日志打印一次**，且首次登录强制改密 |
| `CW_SEED_DEMO` | `true` 时写入演示账号（密码 `CloudWatch@2026`），生产请勿开启 |

```bash
sudo service mariadb start
sudo mysql -e "CREATE DATABASE cloudwatch CHARACTER SET utf8mb4; CREATE USER 'cloudwatch'@'localhost' IDENTIFIED BY 'cloudwatch_dev'; GRANT ALL ON cloudwatch.* TO 'cloudwatch'@'localhost';"
cd backend && go build -o bin/cloudwatch-api ./cmd/server
pm2 start ecosystem.config.cjs      # 或直接运行 bin/cloudwatch-api
```

**接口**（统一 `{code,message,data}`）：`GET /healthz` · `GET /api/settings/public` · `GET /api/public/portal-info` · `GET /api/assets/{id}` ·
`GET /api/auth/captcha` · `POST /api/auth/login|refresh|logout|change-password` · `GET /api/auth/me` · `GET /api/alerts/unread-count` ·
`GET|PUT /api/settings` · `POST /api/settings/reset` · `POST /api/settings/alert-channels/test` ·
`GET /api/audit-logs[/{id}]` · `GET /api/audit-logs/export`（xlsx）· `POST /api/audit-logs/clean`。
字段校验失败：HTTP 400 / code 40001 / `data.fields`。

**数据表**：`system_meta · roles · users · user_roles · sessions · login_failures · settings · alert_channels · assets · audit_logs · metric_samples · inspection_results · alert_events · schema_migrations`。

## 技术栈（锁定）

React 18 + Vite 5 + Tailwind CSS 3（**JSX，无 TypeScript**）· Recharts · zustand（单 store）· axios（单 `services/api.js`）· lucide-react。

## 目录

```
frontend/src/
  components/   共享组件（MainLayout / Sidebar / CustomSelect / ConfirmModal / DataTable …）+ provider/ user/ role/ domain/ settings/ 业务子组件
  pages/        XxxPage.jsx（PlatformManagePage / UsersPage / RolesPage / AuditLogPage / DomainConfigPage / SettingsPage …）
  services/     api.js（按 认证/系统管理/资源/监控 分组）+ mock/（统一 mock，可整体删除）
  store/        useStore.js（user / permissions / dataScopes / theme / brand / 列表状态缓存）
  styles/       index.css（CSS Variables：浅色 :root + [data-theme="dark"]）
  hooks/ utils/ data/   useCan / useListQuery / useAsync … 、theme / format / mask / validators、字典与权限码
```

## 本地运行

```bash
cd frontend
npm install
cp .env.example .env        # VITE_USE_MOCK=hybrid（默认）| true | false
npm run dev                 # http://localhost:3000
npm run build
npm run lint:rules          # 规则扫描（见下）
```

**演示账号**（仅 mock，密码 `CloudWatch@2026`）：`admin`（超管）· `zhangwei`（云平台运维）· `wangfang`（只读）· `liuyang`（审计员）。
可用 `zhaolei`（已锁定）、`chenjie`（已禁用）体验 423 / 403 登录分支。

### mock 模式（`VITE_USE_MOCK`）
- `hybrid`（默认）：认证 / 系统配置 / 审计日志 / 图片资源 / 登录页信息 / 未读告警走**真实后端**，平台/用户/角色/概览仍为 mock；**域名配置走真实后端**；`vite dev/preview` 把 `/api` 代理到 `127.0.0.1:8080`（`VITE_PROXY_TARGET` 可改）。
- `true`：全部 mock，无需后端。`false`：全部真实后端。

### 对接真实后端
1. `.env` 设 `VITE_USE_MOCK=false`；前端只用相对路径 `/api`（IP / 域名访问均可），由 nginx / vite 代理。
2. 删除 `frontend/src/services/mock/`（统一开关，代码里以 `TODO(mock)` 标记）。
3. 接口契约见 `frontend/src/services/api.js`（统一响应 `{code,message,data}`；401 自动刷新一次；导出返回 Blob）。

## 铁律（评审 / CI 必查，`lint:rules` 自动阻断）

1. 所有参数必须在页面录入，禁止写进后端配置文件。
2. 禁止硬编码颜色、禁止 `dark:` 前缀，颜色一律走 CSS Variables，主色运行时可配置。
3. **禁止毛玻璃风格**：不得使用 `glass` / `backdrop-blur` / `backdrop-filter` / 半透明浮层底色；弹窗、下拉、用户菜单、Toast、图表 Tooltip、登录卡片、KPI 卡片一律实色 `bg-card + border + shadow`（`.surface` / `.card-pop`）。（此条取代早期“毛玻璃”要求）
4. **输入框聚焦无彩色高亮**：`input / textarea / CustomSelect 触发器 / SearchInput / PasswordInput / SecretInput / 分页跳转 / Checkbox` 聚焦时禁止 `ring`、彩色边框、`outline`，仅允许中性色边框加深；登录页及所有页面统一使用 `.field`。键盘焦点环只保留给按钮、链接等非输入控件。

## 规范自检（`npm run lint:rules`）

自动扫描并阻断：原生 `<select>` · `window.confirm/alert/prompt` · 硬编码颜色（`#fff` / `bg-white` / `gray-*`…）· `dark:` 前缀 ·
`role === 'admin'` 硬编码 · 页面内直接 `fetch/axios` · emoji 当图标 · 页面文件 > 400 行 · **毛玻璃类名/`backdrop-*`** · **输入聚焦彩色 ring / 彩色边框**。当前 **97 个文件全部通过**。

## 关键设计说明

- **主题**：颜色为 `R G B` 三元组变量，Tailwind 用 `rgb(var(--c-x) / <alpha-value>)` 映射；主色由 `applyBrandColor()` 写入 `:root`，并为暗色单独派生可读强调色。图表色板 `getChartPalette(isDark)` 读取变量，切主题/主色即时刷新。
- **权限**：菜单来自后端权限树（`/auth/me`），前端 `hasPermission(code)` 二次过滤；路由守卫无权限渲染 403；数据权限仅用于 UI，真实拦截在后端。
- **密码/密钥**：保存后一律显示 `******`（`SecretInput`），任何位置不回显；审计详情对 `password/token/secret` 递归脱敏。
- **写操作开关**：生产平台关闭后，`useWriteGuard()` 让全站创建/删除类按钮置灰并给出原因。
- **接入约定**（来自《ES云平台相关接口文档》）：每朵云独立根域名，五组件端点 `<keystone|nova|neutron|cinder|glance>.<根域名>`，需在**后端所在机器**做 hosts 映射；项目名对应云平台 project；容量口径 Ceph `pool_bytes_used / pool_max_avail`，vCPU/内存 `domain_usage` 配额，节点指标 `node_cpu_utilization_total` 等。

## 安全提示

接口文档中含各环境管理员账号/密码，**未写入本仓库**；mock 数据只保留云管标识 / IP / 根域名。文档里 `brces.cheryfs,cn` 的逗号按笔误处理为 `.cn`（请确认）。

## 提交规范

`feat(scope):` / `fix(scope):`，一功能一分支一 PR。
