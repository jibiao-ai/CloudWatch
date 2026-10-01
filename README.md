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
| **平台管理**（三步向导：基本信息 / 认证信息 / 高级 · 认证填完才可「验证连接」 · 真实验证六组件域名 HTTP 连通 + Keystone Token · 同步入库 · 自动同步 · 写操作开关 · 影响范围删除） | ✅ 真实后端 |
| 用户管理（含单个/批量删除，权限码 `user:delete`；不可删自己与最后一个超级管理员）/ 角色管理（功能权限树 + 数据权限三级 allow/deny）/ 审计日志 / 域名配置 / 系统配置 | ✅ |
| 统一资源管理 / 资源视图 / 巡检 / 监控中心 / 容量 / 告警 / 拓扑 / 运营分析 | ⏳ 菜单与权限码已预留（占位页），待接口文档 |
| **后端（Go + MariaDB/MySQL）** | 🟡 已实现：认证 / 系统配置（5 组）/ 审计日志 / 图片资源 / 数据保留清理；**域名配置（hosts 映射 / 内置 DNS / Docker 注入）**；**平台管理（providers / tasks）**；其余模块（用户/角色/概览指标）暂为 mock（概览与角色数据范围的平台列表已读真实库） |

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
- **明细折叠与分页**：每条映射默认只显示控制台 IP / 根域名 / 端口，hosts 明细点击「查看域名映射明细（N 条）」才展开；映射超过 10 条自动分页（默认 10 条/页，可选 20/50）。
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

## 平台管理（真实后端）

- **向导三步**：① 基本信息（云贯标 / 环境类型 / 控制台 IP / 根域名 / 架构 / 节点数）→ ② 认证信息（用户名 / 密码 / 项目 / 用户域 / 项目域）→ ③ 高级（仅 请求超时 3~300 秒、同步间隔 1~1440 分钟、备注）。已移除「五端点配置」「资源类型约定」。
- **验证连接**：认证信息填完整后才可点击并高亮（编辑态已存密码可直接用）；按「根域名」自动补全 6 个组件域名 `keystone/neutron/nova/cinder/glance/emla.<根域名>`，后端逐个 DNS 解析 + HTTP 探测（先 http 后 https，任何 HTTP 响应即视为可达），并向 Keystone v3 发起密码认证（项目范围），以 `201 + X-Subject-Token` 判定拿到 Token。结果：Token 失败 → 异常；Token 成功但有组件不通 → 告警；全部通过 → 在线。结果落库 `providers.last_verify`。
- **同步**：用 Token 与服务目录调用 Nova / Cinder / Neutron（分页）统计云主机 / 云硬盘 / 网络数及可用域，落库；后台每 30 秒检查，到期（`sync_interval_min`）自动验证并同步（`started_by=system`），进度存 `tasks` 表；服务重启会把遗留运行中任务置失败。
- **安全**：密码 AES-256-GCM 加密入库（`password_enc`），接口永不回显（`******`）；修改接入信息会重置状态并清除旧验证结果；所有变更写入审计日志（密码字段脱敏）。
- **API**：`GET|POST /api/providers` · `GET|PUT|DELETE /api/providers/{id}` · `GET /api/providers/{id}/impact` · `PUT /api/providers/{id}/write` · `POST /api/providers/verify`（草稿或已保存）· `POST /api/providers/{id}/sync` · `GET /api/tasks/{id}` · `GET /api/providers/export`。
- **数据**：迁移 `0003_providers.sql`（`providers`、`tasks`）。
- **已验证范围**：对**模拟 OpenStack**（Keystone/Nova/Cinder/Neutron，含分页与错误密码 401）完成接口 + 浏览器端到端 34 项；真实 OpenStack 的非标准目录/自签证书/代理场景上线前请复测。

## Docker 部署（生产）

```bash
cp deploy/env.example .env      # 修改 DB_ROOT_PASSWORD / DB_PASSWORD，可指定 CW_ADMIN_PASSWORD、WEB_PORT
docker compose up -d --build    # mariadb + cloudwatch-backend + cloudwatch-web(nginx)
docker compose logs cloudwatch-backend | grep admin   # 未指定 CW_ADMIN_PASSWORD 时查看随机初始密码
```
- 数据库迁移随后端启动自动执行；数据存于 volume `db-data`。
- 国内网络：Docker Hub 不通时在 `/etc/docker/daemon.json` 配置 `registry-mirrors`；后端镜像构建默认 `GOPROXY=https://goproxy.cn`，前端镜像默认 npmmirror。
- 后端挂载宿主机 `/etc/hosts` 与 `docker.sock`，用于「域名配置」；不需要可在 compose 中删去。
- 公网部署请放行 `WEB_PORT`，并建议前置 HTTPS（反向代理/证书）。

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

接口文档中含各环境管理员账号/密码，**未写入本仓库**；mock 数据只保留云贯标 / IP / 根域名。文档里 `brces.cheryfs,cn` 的逗号按笔误处理为 `.cn`（请确认）。

## 提交规范

`feat(scope):` / `fix(scope):`，一功能一分支一 PR。

## 监控中心与告警中心（第13轮，对接 EMLA 文档第4/5章；第20轮「性能监控」更名为「监控中心」）
- **监控中心** `/monitor`（权限 `monitor:view`，立即采集 `monitor:collect`）：总览 KPI、容量、虚机状态、IOPS、趋势图（1h/6h/24h/7d/30d）、计算节点、磁盘、服务状态、采集明细。
- **告警中心** `/alerts`（`alert:view`；确认 `alert:ack`、同步 `alert:sync`、导出 `alert:export`）：统计卡片、筛选、排序分页、详情抽屉、单条/批量确认、xlsx 导出；顶栏铃铛跳转至此，未读数 = 告警中且未确认。
- **接口**：`GET /api/monitor/overview|{id}|{id}/trend`、`POST /api/monitor/{id}/collect`；`GET /api/alerts|stats|export|{id}`、`POST /api/alerts/ack|sync`。
- **数据表**（迁移 0004）：`monitor_snapshots`、`metric_samples`、`alert_events`（新增指纹/状态/确认等字段）。
- **同步机制**：按平台「同步间隔」定时采集；按 (平台,指纹,触发时间) 幂等入库；成功拉取后未再出现的告警自动恢复；EMLA 不可达时不会误恢复；新增告警经已启用通知渠道推送。
- **说明/假设**：未找到“原始开发设计文档”，按项目既有设计 + 文档第4/5章实现；云主机内存 usage/total 文档未标注单位，按 MiB 换算展示（依据：示例 584704=571×1024，与 Nova memory_mb 同量纲；需以真实 EMLA 复核）；未对接真实 EMLA 验证（使用模拟服务）。

### 告警中心修复（第14轮）
- 告警列表默认每页 **10 条**（可选 10/20/50/100）。
- **告警独立同步间隔**：平台「高级设置」新增「告警同步间隔（秒）」（10~3600，默认 60），独立于资源同步间隔（分钟）；后台每 30 秒扫描，到期即拉取告警并立刻推送。迁移 0005 新增 `providers.alert_interval_sec`。
- **推送改为“待发队列”**：新增告警、告警恢复均推送到「系统配置 → 告警渠道」；全部渠道失败则保留待发、下个周期自动重试；告警恢复后又复发会再次推送；恢复通知超过 6 小时不再补发。迁移 0005 新增 `alert_events.resolve_notified`。
- **推送模板**（每条告警一块，单条消息最多 10 条）：平台 / 项目 / 状态（告警中｜已恢复）/ 时间（北京时间，恢复取恢复时间）/ 名称 / 对象 / 级别 / 摘要 / 建议 / 规则ID。

### 第15轮修复
- **域名配置**：新增映射默认组件增加 `gnocchi`（`<gnocchi>.<根域名>`）；迁移 0006 为已有映射补上 gnocchi，启动时自动同步 hosts。
- **平台管理**：自动补全并验证的组件增至 7 个（keystone / neutron / nova / cinder / glance / **gnocchi** / emla），验证连接逐个检测 gnocchi 域名的解析与 HTTP 连通性。
- **控制台 IP 超链接**：平台管理列表、详情抽屉、概览页的控制台 IP 可点击，新标签页打开 `https://<IP>`（若录入值自带 http(s):// 则原样使用）。
- **文案**：「云管标识」统一改为「云贯标」。

### 第16轮修复（前端布局）
- **告警中心 / 审计日志**：关键字与筛选条件并入表格工具栏，「导出 Excel」与关键字同一行（与平台管理、用户管理一致）。
- **系统配置**：去掉 1100px 宽度上限与固定列数，基础信息/品牌信息/安全策略/数据保留/告警渠道均随屏幕宽度自适应铺满（auto-fill 栅格）。
- **告警渠道**：「新增渠道」移到页头「恢复默认」之后、「保存」之前。

### 第17轮修复（告警渠道表格化）
- **一渠道一行**：列为 渠道名称 / 类型 / 收件人或 Webhook 地址 / 操作。
- **操作列**：测试、编辑、启用开关、删除；新增 / 编辑在弹窗中填写，点「保存」即校验并写入数据库；启用开关与删除即时写库。
- **类型**只显示「邮件」「Webhook」（不再带括号说明）。
- **地址**在表格中截断显示，鼠标悬停显示完整内容（Tooltip）。

### 第18轮修复（告警详情抽屉）
- 告警中心点击条目弹出的详情抽屉，纵向范围限定在「表格工具栏（关键字 / 导出 Excel 所在行）」至「分页栏上沿」之间，不再遮挡页头、统计卡片与分页；内容超出时在抽屉内部滚动（鼠标滚轮），头部标题与底部「确认告警」固定。
- `Drawer` 组件新增可选 `anchor` 属性（返回 `{top,bottom}` 视口坐标），窗口缩放 / 页面滚动时自动重新定位；未传 `anchor` 的其它抽屉保持整屏高度。

### 第19轮修复（抽屉 / 弹窗关闭按钮高亮）
- 抽屉、弹窗打开后不再把焦点放到右上角「×」上（改为聚焦内容区），「×」不再出现彩色焦点框；键盘 Tab 聚焦时也不显示高亮框。Esc 关闭与焦点循环不受影响。

### 第20轮（监控中心，对接《接口补充文档》）
- **更名**：「性能监控」→「监控中心」（菜单 / 权限 / 页头），页签：总览、服务状态、物理节点、磁盘状态、虚拟机、采集明细；每个列表都有关键字搜索，总览顶部有「全局搜索」可跨 节点/虚拟机/磁盘/服务/采集明细 查找并跳转。
- **统一列表**：所有明细表 10 行/页分页（页大小 10/20/50/100，与告警中心一致）+ 列头排序（空值始终排最后）。
- **物理节点**：去掉 用户态/内核态/IO 等待；新增 所属云平台（平台名 + 控制台 IP 超链接，新标签页打开）、总核数、使用核数（Nova `GET /v2.1/os-hypervisors/detail` 的 `vcpus` / `vcpus_used`，即已分配 vCPU；节点名 `node-1.domain.tld` 去域名后与 EMLA 节点名匹配，亦按 IP 匹配）、磁盘 I/O 使用率；末列「监控详情」弹窗：CPU 使用率、内存使用率、网络接收/发送流量、磁盘 I/O 使用率 4 张趋势图（来自后台周期采集落库的历史样本）。
- **磁盘状态**：「使用」改为使用率条（同内存使用率；`disk_usage` 为容量串时与 `disk_capacity` 相除）；HDD / 接口返回「-」的已用寿命显示「—」；「OSD」→「OSD编号」。
- **虚拟机**（新）：列表取自 Nova `GET /v2.1/servers/detail?all_tenants=true`（自动翻页），CPU / 内存使用率取自 Gnocchi `cpu_util` / `memory.util` 最近值；样式与物理节点一致；「监控详情」弹窗实时调用 Gnocchi `/v1/resource/generic/{vm_id}/metric/{metric}/measures`，绘制 CPU、内存、磁盘读/写速率（`disk.read|write.bytes.rate`）。后端 `GET /api/monitor/{id}/vms/{vmId}/metrics?range=`。
- **服务状态**：按《接口补充文档》对照表友好命名（35 项；表外指标兜底显示去前后缀的名称），并增加 分类、状态、实例数、服务指标、附加信息、指标时间；顶部统计卡与 状态/分类 筛选。
- **数据库**：迁移 0007 为 `monitor_snapshots` 增加 `vms` 列。
- **口径说明**（文档未给出确切指标名，需以真实环境为准）：节点网络流量用 `series/query` 的 `irate(node_network_receive|transmit_bytes_total{物理网卡}[5m])`（旧文档给出）；磁盘 I/O 使用率用 `max by (node_name)(rate(node_disk_io_time_seconds_total[5m]))*100`；若真实环境不支持，采集明细会显示对应步骤失败原因，其余功能不受影响。

### 第21轮（资产管理，对接《接口补充文档》第6章）
- **入口**：菜单「资产管理」→ `/capacity`（权限 `capacity:view`；立即采集 `capacity:collect`）。页签：**总览 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 集群存储**，页签上显示条目总数；聚合**全部已对接云平台**，可按「所属云平台」「状态」筛选。
- **全部列表**：服务端关键字搜索（命中接口返回的全部字段，含中文状态词，多个关键字空格分隔需同时命中）+ 列头排序（数值按大小、文本按自然序、空值恒排最后）+ 分页（默认 **10 条/页**，可选 10/20/50/100，与告警中心一致）。
- **虚拟机 / 云硬盘 / 虚拟网卡（及计算节点）**：必显 **UUID**、**所属云平台**（平台名 + 控制台 IP 超链接，新标签页打开）；点击行弹出详情抽屉：基本信息（中文分组）/ 全部字段（原始 JSON 打平为 路径→值）/ 原始 JSON，即接口返回的全量信息。
- **集群存储**（`scheduler-stats/get_pools`）：存储池名称、总容量、剩余容量、已分配容量、精简置备总容量、使用率、供应商（`vendor_name`）、存储协议（`storage_protocol`）、后端状态（`backend_state`）、后端名称（`volume_backend_name`）等，状态/协议/供应商均中文显示（如 `ceph`→Ceph（RBD）、`up`→正常、`Easystack`→易捷行云（EasyStack））。
- **总览**：全平台 KPI（云平台/节点/虚拟机/云硬盘/网卡/存储池）、vCPU / 内存 / 存储使用率、存储池容量四项合计、各资源状态分布、各云平台容量汇总表（搜索/排序/分页）、采集明细（每个接口的结果/条数/耗时/错误）。
- **接口（第6章）**：Nova `GET /v2.1/os-hypervisors/detail`、`GET /v2.1/servers/detail?all_tenants=true`；Cinder `GET /v3/{project_id}/volumes/detail`（失败回退 `/volumes` + 逐个详情）、`GET /v3/{project_id}/scheduler-stats/get_pools?detail=True`；Neutron `GET /v2.0/ports`（并取 `/networks`、`/subnets` 解析网络名与网段）。均自动分页（limit=500 + marker）。
- **本平台接口**：`GET /api/capacity/overview`、`GET /api/capacity/{nodes|vms|volumes|ports|pools}?keyword&providerId&status&sortKey&sortOrder&page&pageSize`、`GET /api/capacity/{kind}/{providerId}/{id}`、`POST /api/capacity/collect[?providerId=]`。
- **采集与存储**：后台 30 秒巡检，到期（取「平台同步间隔」与 5 分钟的较大值）即采集；结果按平台 gzip 压缩落库（迁移 0008 `capacity_snapshots`），某个接口失败只影响该类数据（保留上次成功数据，错误在总览「采集明细」显示）。
- **口径说明**：① 文档示例卷接口为 `/v2/{project_id}/volumes`，而存储池接口为 `/v3/...`，实现按服务目录 `volumev3`（v3）调用，与 v2 响应结构一致；② 计算节点 vCPU / 内存「容量」= 物理量 × 分配比（`cpu_allocation_ratio` / `ram_allocation_ratio`），详情中同时给出物理值；③ 容量单位：Cinder `*_gb` 按 GiB、Nova `memory_mb` 按 MiB 显示；④ 存储池文档仅列出部分字段，其余 capabilities 一并展示。

### 第22轮（容量管理改名「资产管理」+ 列表精简/详情增强 + 物理节点）
- **改名**：菜单/页面标题/权限名/权限页文案「容量管理」→「资产管理」（路由 `/capacity` 与权限码 `capacity:*` 不变，保证已有授权不失效）。
- **新增「物理节点」页签**（位于「计算节点」之前）：对接《4.1.11 平台物理节点信息查询接口》`GET http://coaster.<根域名>/v2/nodes`（`X-Auth-Token` 同 Keystone token）。列：主机名、型号（`platform_name`，回退 `meta.system.product`）、序列号、CPU 型号、内存大小（`meta.memory.total`）、CPU 核数、网卡数量、所属云平台、状态；详情含 BMC/硬件元数据。`ipmi_info` 用户名/密码在入库与返回前一律脱敏为 `******`。迁移 0009 为 `capacity_snapshots` 增加 `phys` 列；迁移 0010 与默认组件列表为域名配置增加 `coaster` 域名映射（需在「域名配置」重新同步 hosts）。
- **计算节点**：过滤 `ironic.compute.domain.tld` 开头的 hypervisor；去掉 UUID、本地磁盘使用量、CPU 型号、CPU 拓扑列。
- **虚拟机**：规格显示规格名称（Nova `/flavors/detail`）；项目 ID→项目名称（Keystone `/v3/projects`，失败回退当前登录项目名/ID），列在「所在节点」之后；点击行详情新增：关联系统盘/数据盘、安全组（Neutron `/security-groups`）、vCPU/内存（取自规格）。
- **云硬盘**：项目名称列在「所属云平台」之后；加密/共享/可用区/存储后端移入详情。
- **虚拟网卡**：状态「未连通」→「停止」、「活动」→「运行中」；项目名称列在「所属云平台」之后；设备类型/网卡类型/管理状态/端口安全移入详情。
- **集群存储**：「后端名称」为第一列；存储协议/存储池名称/精简置备/最大超分比/驱动版本移入详情。
- **口径说明**：物理节点列依赖 `meta` 字段，缺失显示空；项目名称解析依赖 Keystone 项目列表权限。

### 第22轮补充（平台管理：组件域名新增 coaster）
- 平台管理「新增/编辑平台」按根域名自动补全的组件域名由 7 个增至 8 个，新增 **coaster**（`coaster.<根域名>`，如根域名 `openstack.svc.cluster.local` → `coaster.openstack.svc.cluster.local`）；「验证连接」同步检测其 HTTP 连通性；已有平台无需迁移，列表/详情/验证按根域名实时派生。后端 `provider.Components`、前端 `OPENSTACK_COMPONENTS`、mock 同步更新。

### 第22轮修复（coaster 接口 HTTP 500：Invalid content type in request: text/plain）
- **根因**：经在用户服务器上用已保存的平台凭据实测，coaster `GET /v2/nodes` 在不带 `Content-Type` 时返回 `500 {"CoasterError":"Invalid content type in request: text/plain"}`，带 `Content-Type: application/json` 则返回 200（文档示例 curl 本就带该头，是我们的 GET 请求漏发）。
- **修复**：`provider.getJSON`（所有平台 GET 请求公共入口）统一增加 `Content-Type: application/json`，对 Nova/Cinder/Neutron/Keystone 无副作用。
- **真实数据核对**：两个平台共 29 个物理节点，`hostname / platform_name / serial / meta.cpu.spec[0].model / meta.cpu.total / meta.memory.total / meta.interfaces` 均存在，字段映射无需调整；`ipmi_info.password` 在真实响应中为明文，已确认入库与返回前被脱敏。

### 第22轮修复（物理节点排除型号为 OpenStack Nova 的记录）
- coaster `/v2/nodes` 中型号（`platform_name`，缺失时回退 `meta.system.product`）为 **OpenStack Nova**（忽略大小写/多余空格）的是虚拟机资源，不属于物理节点，现已排除。
- 两处生效：① 采集入库时不再保存；② 读取已入库快照时同样过滤（无需等待下次采集，部署后即生效，页签数量、总览 KPI（物理节点数/核数/内存）、筛选分页同步）。附单元测试 `capacity/phys_test.go`。
