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
| 平台概览（KPI · 容量水位 · 使用率趋势 · 各平台概况 · 高负载节点 · 活跃告警 · 优化建议；真实后端） | ✅ |
| **平台管理**（三步向导：基本信息 / 认证信息 / 高级 · 认证填完才可「验证连接」 · 真实验证六组件域名 HTTP 连通 + Keystone Token · 同步入库 · 自动同步 · 写操作开关 · 影响范围删除） | ✅ 真实后端 |
| 用户管理（含单个/批量删除，权限码 `user:delete`；不可删自己与最后一个超级管理员）/ 角色管理（功能权限树 + 数据权限三级 allow/deny）/ 审计日志 / 域名配置 / 系统配置 | ✅ |
| 统一资源管理 / 资源视图（已隐藏，见第43轮） / 巡检 / 监控中心 / 容量 / 告警 / 拓扑 / 运营中心 | ⏳ 菜单与权限码已预留（占位页），待接口文档 |
| **后端（Go + MariaDB/MySQL）** | 🟡 已实现：认证 / 系统配置（5 组）/ 审计日志 / 图片资源 / 数据保留清理；**域名配置（hosts 映射 / 内置 DNS / Docker 注入）**；**平台管理（providers / tasks）**；**平台概览（/dashboard）与全局搜索（/search）**；其余模块（用户/角色）暂为 mock（角色数据范围的平台列表已读真实库） |

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

- **映射**：可多条（每个根域名唯一）；新增映射默认勾选 keystone/neutron/nova/cinder/glance/gnocchi/coaster/emla 共 8 个组件（后端 `DefaultComponents` 与前端 `DEFAULT_COMPONENTS` 一致），也可取消勾选或自定义组件名；支持启用/停用、编辑、删除；「校验」逐项检查 本机 hosts / 内置 DNS / Docker / 控制台连通性（`IP:探测端口`）。
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
- `hybrid`（默认）：认证 / 系统配置 / 审计日志 / 图片资源 / 登录页信息 / 未读告警走**真实后端**，用户/角色仍为 mock；平台概览、全局搜索走真实后端；**域名配置走真实后端**；`vite dev/preview` 把 `/api` 代理到 `127.0.0.1:8080`（`VITE_PROXY_TARGET` 可改）。
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
- **控制台 IP 超链接**：平台管理列表、详情抽屉、平台概览页的控制台 IP 可点击，新标签页打开 `https://<IP>`（若录入值自带 http(s):// 则原样使用）。
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

### 第21轮（配置中心，对接《接口补充文档》第6章）
- **入口**：菜单「配置中心」→ `/capacity`（权限 `capacity:view`；立即采集 `capacity:collect`）。页签：**总览 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 集群存储**，页签上显示条目总数；聚合**全部已对接云平台**，可按「所属云平台」「状态」筛选。
- **全部列表**：服务端关键字搜索（命中接口返回的全部字段，含中文状态词，多个关键字空格分隔需同时命中）+ 列头排序（数值按大小、文本按自然序、空值恒排最后）+ 分页（默认 **10 条/页**，可选 10/20/50/100，与告警中心一致）。
- **虚拟机 / 云硬盘 / 虚拟网卡（及计算节点）**：必显 **UUID**、**所属云平台**（平台名 + 控制台 IP 超链接，新标签页打开）；点击行弹出详情抽屉：基本信息（中文分组）/ 全部字段（原始 JSON 打平为 路径→值）/ 原始 JSON，即接口返回的全量信息。
- **集群存储**（`scheduler-stats/get_pools`）：存储池名称、总容量、剩余容量、已分配容量、精简置备总容量、使用率、供应商（`vendor_name`）、存储协议（`storage_protocol`）、后端状态（`backend_state`）、后端名称（`volume_backend_name`）等，状态/协议/供应商均中文显示（如 `ceph`→Ceph（RBD）、`up`→正常、`Easystack`→易捷行云（EasyStack））。
- **总览**：全平台 KPI（云平台/节点/虚拟机/云硬盘/网卡/存储池）、vCPU / 内存 / 存储使用率、存储池容量四项合计、各资源状态分布、各云平台容量汇总表（搜索/排序/分页）、采集明细（每个接口的结果/条数/耗时/错误）。
- **接口（第6章）**：Nova `GET /v2.1/os-hypervisors/detail`、`GET /v2.1/servers/detail?all_tenants=true`；Cinder `GET /v3/{project_id}/volumes/detail`（失败回退 `/volumes` + 逐个详情）、`GET /v3/{project_id}/scheduler-stats/get_pools?detail=True`；Neutron `GET /v2.0/ports`（并取 `/networks`、`/subnets` 解析网络名与网段）。均自动分页（limit=500 + marker）。
- **本平台接口**：`GET /api/capacity/overview`、`GET /api/capacity/{nodes|vms|volumes|ports|pools}?keyword&providerId&status&sortKey&sortOrder&page&pageSize`、`GET /api/capacity/{kind}/{providerId}/{id}`、`POST /api/capacity/collect[?providerId=]`。
- **采集与存储**：后台 30 秒巡检，到期（取「平台同步间隔」与 5 分钟的较大值）即采集；结果按平台 gzip 压缩落库（迁移 0008 `capacity_snapshots`），某个接口失败只影响该类数据（保留上次成功数据，错误在总览「采集明细」显示）。
- **口径说明**：① 文档示例卷接口为 `/v2/{project_id}/volumes`，而存储池接口为 `/v3/...`，实现按服务目录 `volumev3`（v3）调用，与 v2 响应结构一致；② 计算节点 vCPU / 内存「容量」= 物理量 × 分配比（`cpu_allocation_ratio` / `ram_allocation_ratio`），详情中同时给出物理值；③ 容量单位：Cinder `*_gb` 按 GiB、Nova `memory_mb` 按 MiB 显示；④ 存储池文档仅列出部分字段，其余 capabilities 一并展示。

### 第22轮（容量管理改名「配置中心」+ 列表精简/详情增强 + 物理节点）
- **改名**：菜单/页面标题/权限名/权限页文案「容量管理」→「配置中心」（路由 `/capacity` 与权限码 `capacity:*` 不变，保证已有授权不失效）。
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

### 第22轮修复（配置中心列精简 / 带外地址 / Keystone 项目 403）
- **虚拟机**：列表只保留 名称/UUID/所属云平台/状态/所在节点/项目名称/IP/规格名称/创建时间；vCPU、内存、挂载云盘、可用区、电源状态、安全组仅在详情查看；规格自带的「系统盘（规格）」不再输出（真实系统盘见详情「关联的系统盘」）。
- **虚拟网卡**：列表去掉「子网」「绑定主机」，仅在详情查看。
- **物理节点**：新增列「带外地址」（`ipmi_ip`），支持搜索与排序。
- **Keystone 403（identity:list_projects）**：经在测试环境实测，项目范围 Token 调用 `GET /v3/projects` 被默认策略拒绝（403），同账号（admin/cloud_admin）换取**域范围 Token**后返回 200（运维环境 19 个、产品环境 7 个项目）。现采集在 403 时自动用同一账号换域范围 Token 重试（Token 仅内存使用，不落库），项目名称即可正常解析；仍失败时保持原有回退（当前登录项目名/ID）。

### 第22轮修复（配置中心列重排 / 默认排序 / 平台 IP 链接按钮）
- **页签**：「采集明细」（原总览底部「采集明细（第 6 章接口）」）独立为页签，排在「集群存储」之后。
- **列顺序**：物理节点＝序列号、型号、CPU 型号、CPU 核数、内存大小、网卡数量、所属云平台、主机名、状态、管理 IP、带外 IP；计算节点＝管理 IP、节点名称、所属云平台、CPU 核数、vCPU（已用/容量）、内存（已用/容量）、运行虚拟机数、运行状态、服务状态、虚拟化类型；虚拟机＝主机 IP、虚拟机名称、规格名称、UUID、状态、项目名称、所属云平台、计算节点、创建时间；虚拟网卡＝网卡名称、IP 地址、MAC 地址、UUID、状态、所属网络、所属云平台、项目名称、挂载虚拟机（原「所属设备」）、创建时间。
- **默认排序**：各资源页签默认按「所属云平台」升序（仍可点列头改排序）。
- **所属云平台**：控制台 IP 改为普通文字，仅保留其后的外链图标按钮，点击按钮才在新标签页打开控制台（不触发行详情）；总览平台汇总、采集明细同步。`ConsoleLink` 新增 `plain` 模式。
- **使用率**：计算节点 vCPU/内存、集群存储「使用率」去掉“使用率”文字与百分比，只保留进度条（`CapacityBar` 新增 `barOnly`，无障碍名称保留）。

### 第23轮修复（配置中心：平台链接按钮同行 / 使用率悬停百分比）
- **所属云平台**：外链图标按钮与平台名称放在同一行，控制台 IP 作为普通文字在下一行（新增 `ConsoleIconLink`；配置中心 6 个页签、总览、采集明细，以及仪表盘、监控列表/详情弹窗同步）。
- **使用率悬停**：计算节点「vCPU / 内存（已用 / 容量）」、集群存储「存储使用率」进度条鼠标悬停显示具体百分比（如「vCPU 使用率：7.8%」，一位小数）；`Usage` 组件使用 Portal `Tooltip`。
- **集群存储**：列名「使用率」→「存储使用率」，详情字段、总览 KPI 同步改名。

### 第24轮修复（配置中心：列顺序 / 虚机 IP / 浮动 IP 网卡排除 / N/A 状态）
- **计算节点**：「管理 IP」移到「节点名称」之后。
- **虚拟机**：「主机 IP」改名「虚机 IP」（即虚拟机自身 IP），并移到「虚拟机名称」之后；搜索提示同步。
- **虚拟网卡**：设备类型（`device_owner`）为 `network:floatingip`（浮动 IP）的端口不再作为虚拟网卡采集/显示（采集入库与读取旧快照两处过滤，列表数量、总览 KPI 同步）；状态为 `N/A` 的显示为「未知」。附单元测试。

### 第25轮修复（虚拟网卡仅保留云主机类型）
- 虚拟网卡只显示设备类型（`device_owner`）为云主机（`compute:*`，如 `compute:nova`）的端口；DHCP、路由器接口/网关、浮动 IP、未使用等其他类型一律过滤（采集入库与读取旧快照两处过滤，列表数量、总览 KPI 同步）。VM 详情中的网卡接口信息不受影响。

### 第26轮修复（监控中心：采集明细表头 / 虚拟机 vCPU·内存）
- **采集明细**：表头与配置中心「采集明细」一致 —— 所属云平台 / 接口 / 请求路径 / 结果 / 条数 / 耗时 / 错误信息。后端 `monitor.Step` 新增 `path`、`count`；旧快照读取时按接口标识回填请求路径（条数在下次采集后出现）。
- **虚拟机 vCPU / 内存**：Nova `servers/detail` 的规格只有 ID（或仅 original_name），原来取不到 vCPU/内存。新增采集步骤「云主机规格（Nova）」`GET /v2.1/flavors/detail?is_public=None`，按规格 ID（回退按名称）补齐规格名称 / vCPU / 内存 / 磁盘；列表中 vCPU 与内存合并为一列「vCPU / 内存」（如 `2 核 / 4 GB`，悬停显示规格名称）。南京运维环境实测 61 台云主机全部补齐。

### 第27轮新增（资源拓扑：全链路分层拓扑）
- **入口**：侧栏「资源拓扑」（`/topology`，权限 `topology:view`，原“规划中”占位已替换）。后端 `GET /api/topology/overview`（全部平台摘要）、`GET /api/topology/{providerId}`（单平台完整拓扑）。只读聚合**已落库**数据，不额外访问云平台接口；新增 `backend/internal/topology` 包（`capacity.Store.Rows` 读取资产行）。
- **数据来源整合**：平台管理（平台、环境类型、验证状态）＋ 配置中心（物理节点 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 集群存储）＋ 监控中心（节点与云主机 CPU / 内存使用率、采集状态）＋ 告警中心（未恢复告警，按云主机 UUID / 节点名 / 主机 IP 关联到具体资源）。
- **第 0 层 全局总览**：KPI（平台数 / 物理·计算节点 / 虚拟机 / 未恢复告警）＋ 每个平台一张卡片（健康度、各类资源数量与异常数、vCPU / 内存 / 存储使用率、资产与监控采集状态、告警数），点击「查看拓扑」下钻。
- **第 1 层 平台分层拓扑**：平台头部（采集状态、容量使用率、告警汇总、各类型数量，可点击按类型过滤）＋ 5 个层级：物理层 → 计算层 → 实例层 → 挂载层（云硬盘 / 虚拟网卡）→ 后端层（集群存储 / 网络）。节点卡片带健康度色点（异常 / 告警 / 正常 / 已停止 / 未知）、CPU·内存迷你条、告警角标；每组超过 18 个自动折叠，异常优先排序。
- **关系与下钻**：选中任一节点高亮其上下游全链路并绘制连线（承载＝实线；挂载 / 网卡 / 存储＝虚线），可「仅看关联链路」；右侧告警面板点击即定位到关联资源；节点详情抽屉含健康度判定依据、使用率、关联告警、上下游、属性，并可「查看资产详情」打开配置中心详情抽屉。支持关键词 / 健康度 / 资源类型筛选与平台切换。
- **健康度规则**：资产状态异常 → 异常；严重告警 → 异常、其他告警 → 告警；CPU / 内存 / 存储使用率 ≥85% 异常、≥70% 告警；计算节点承载异常云主机 → 告警；已关机 / 停止 → 已停止；状态未知 → 未知。平台健康度另含验证状态与采集失败。
- **后端单元测试**：告警关联（UUID / 节点名 / IP / 计算节点优先）、负载阈值、自然排序、存储后端匹配。

### 第28轮新增（运营中心：6 个页面）
- **入口**：侧栏「运营中心」分组 —— 总览 `/analytics`、基础资源分析 `/analytics/base`、云主机分析 `/analytics/vm`、磁盘分析 `/analytics/disk`、云主机优化 `/analytics/optimize`、优化策略 `/analytics/policy`。权限 `analytics:view`（查看）、`analytics:ignore`（忽略 / 取消忽略建议）、`analytics:policy_update`（修改策略）、`analytics:export`（导出 Excel）；迁移 `0011_analytics.sql` 按角色补齐权限并预置 3 条策略。
- **口径约定**：不涉及计费 / 组织 / 工作空间 / 区域 —— 页面里没有付费方式、组织架构分布；「区域 / 数据中心」直接用所属云平台名称，不单独成列；**集群** = 物理节点上报的 `cluster_id`（显示为「集群 N」，没有则「默认集群」）。
- **总览**：所属云平台 / 云主机 / 磁盘 / 宿主机 / 存储器计数；资源明细（按所属云平台，每页 5 条）；基础资源**分配率**（3 个仪表盘）与**使用率**（3 个水球）；云主机趋势（近 7 天 / 30 天 / 半年 / 一年）；优化建议卡片（建议降配 / 升配 / 回收，点击进入对应建议）。
- **基础资源分析**：标签「资源分析 / 宿主机明细 / 存储器明细」；筛选 所属云平台 → 集群 → 宿主机 / 存储器（级联）；基础资源分布环形图（宿主机 / 存储器切换）；宿主机上云主机分布（运行中 / 已停止堆叠）；按使用率分布折线（日期范围 + CPU / 内存 / 存储器切换，5 个区间 0-20% … 80-100%）。
- **云主机分析**：所属云平台分布 / 运行状态环形图、云主机趋势、按使用率分布（CPU / 内存）；「资源明细」支持按名称或 IP 搜索、IP 多个时「更多」展开、列设置、刷新、导出 Excel。
- **磁盘分析**：所属云平台分布 / 挂载状态（空闲 / 已挂载 / 其他）/ 磁盘类型环形图，单位可切「数量(块) / 容量(G)」；磁盘趋势；明细列 名称 / 所属云平台 / 集群·可用区 / 所属云主机 / 状态 / 大小(G)。
- **云主机优化 + 优化策略**：3 类建议（降配 / 升配 / 回收）卡片可选，卡片右上角设置图标直达对应策略编辑；「优化资源 / 已忽略资源」切换，忽略 / 取消忽略（单个或批量，ConfirmModal 二次确认，落审计）；建议原因显示命中的实际值。策略可编辑：名称、启用、统计周期、条件（字段 + 运算符 + 取值，条件间 并且 / 或者，**并且优先于或者**），后端 422 字段级校验。默认策略：升配＝CPU 或内存最大值 ≥90%；降配＝CPU 或内存最大值 ≤1%；回收＝持续关机 ≥30 天 或 实例状态为待回收。
- **数据来源与历史积累**：只读已落库的资产 / 监控快照，**不增加云平台接口调用**。后台采样器（每分钟）把云主机数量、磁盘数量 / 容量、各云主机 CPU / 内存使用率（日均 / 日最大）、云主机开关机状态起点写入 `analytics_*` 表（`analytics_counts / analytics_vm_usage / analytics_vm_state / analytics_state / analytics_policies / analytics_ignores`），存储器使用率写入 `metric_samples`。**趋势、使用率分布、关机 / 运行时长、优化建议都从部署之后开始积累**；低负载类条件（≤）需积满完整统计周期（默认 10 天）才会生效，避免数据不足时误报。
- **后端**：新增 `backend/internal/analytics`（engine / analysis / optimize / policy / store / sampler），路由 `GET /api/analytics/{overview,trend,base,base/bands,vm,vm/bands,disk,list/{hosts|pools|vms|disks},export/{hosts|pools|vms|disks|opt},optimize/summary,optimize/list,policies}`、`POST /api/analytics/optimize/ignore`、`PUT /api/analytics/policies/{kind}`。单元测试覆盖策略求值（AND 先于 OR、低负载窗口、关机 / 运行门控）、校验、原因文案、使用率区间、分页、日期范围。
- **前端**：新增 `components/analytics/`（Panel / Seg、Gauge、WaterCircle、Donut、BarDist、HostVmChart、TrendArea、BandsChart、BandsPanel、DonutPanel、DateRange、DetailTable、PolicyModal 等）与 6 个 `Analytics*Page.jsx`；图表配色全部取自 `useChartPalette()`（新增 `inverse` 色供水球文字使用）。

### 第29轮修复（运营中心：布局参照「配置中心」重新设计 + 「云账号」改为「所属云平台」）
- **统一外壳**：新增 `components/analytics/Shell.jsx`（`AnalyticsShell`），6 个页面全部采用与「配置中心」相同的结构 —— 页头（标题 / 说明 / 刷新）→ **状态条卡片**（采集正常 / N 个平台采集异常 / 尚未采集 · 已对接云平台 N 个 · 最近采集时间）→ **页签**（带 `idPrefix` 与数量）→ `role="tabpanel"` 面板；加载时骨架屏、出错时 `ErrorState`。
- **总览**：页签「总览 / 所属云平台」；总览页为 5 张 KPI 卡（已对接云平台 / 云主机 / 磁盘 / 宿主机 / 存储器）＋ 分配率 / 使用率 ＋ 云主机趋势 ＋ 优化建议；「所属云平台」页签为各平台资源数量与资产采集状态汇总表（搜索 / 排序 / 分页，列风格同配置中心总览）。
- **明细表**：「宿主机明细 / 存储器明细 / 云主机资源明细 / 磁盘资源明细」与配置中心资源页一致 —— 工具栏内放「全部所属云平台」等筛选 + 搜索，右侧「共 N 项」+ 列设置 + 导出 Excel；「所属云平台」列显示平台名 + 控制台 IP + 控制台链接（复用 `PlatCell`）；页签上显示资源数量。
- **云主机优化**：原先的 3 张可选卡片改为页签「建议降配 / 建议升配 / 建议回收」（带建议数量，忽略后数量同步刷新）；列表工具栏新增「所属云平台」筛选（后端 `optimize/list` 与导出支持 `providerId`）；页头新增「优化策略」按钮直达当前类型策略编辑。
- **优化策略**：同样使用统一外壳；列表固定按 降配 / 升配 / 回收 展示。
- **术语调整**：「云账号」统一改为「所属云平台」—— 页面标签 / 筛选 / 表头 / 环形图标题（所属云平台分布）/ 空态文案 / 导出 Excel 列标题；API 字段随之改名（`accounts`→`platforms`，`account`→`platform`，`accounts_opt`→`platforms_opt`，总览 `totals.accounts`→`totals.platforms`）。
- **其他修复**：侧栏「运营中心」分组内路径互为前缀（`/analytics` 与 `/analytics/base`）时，原来「总览」会在所有子页同时高亮、面包屑也始终显示「总览」，现改为精确匹配 / 最长匹配。

## 第30轮：运营中心合并为单一菜单（Bug 修复）

- 问题：运营中心在侧栏展开为 6 个子菜单（总览 / 基础资源分析 / 云主机分析 / 磁盘分析 / 云主机优化 / 优化策略），与「配置中心」（一个菜单、功能为页内页签）不一致。
- 修复：菜单树（后端 `perm.go` + 前端 mock 菜单）中 `analytics` 组只保留 1 个入口 `/analytics`；新增 `AnalyticsPage`，六个功能作为同一页面的页签：总览 / 资源分析 / 云主机分析 / 磁盘分析 / 云主机优化 / 优化策略（页签内的「宿主机明细 / 存储器明细 / 资源明细」「建议降配 / 升配 / 回收」为页内分段切换）。
- 页签与优化类型同步到地址栏：`/analytics?tab=base|vm|disk|optimize|policy`、`&kind=downgrade|upgrade|recycle`；旧路径 `/analytics/base` 等自动重定向到对应页签。
- 导出审计中的跳转链接同步改为 `/analytics?tab=…`；权限码与后端接口不变。
- 页面文件：`pages/AnalyticsPage.jsx` + `components/analytics/tabs/{Home,Base,VM,Disk,Optimize,Policy}Tab.jsx`（原 6 个 `Analytics*Page.jsx` 已删除）。

## 第31轮：运营中心「优化策略」改为四类建议（Bug 修复）

- 新增并默认启用 4 条可编辑策略（统计周期 10 天），替换原「建议降配 / 升配 / 回收」：
  1. **僵尸型虚拟机**（`zombie`）：实例状态为开机，且最近 10 天平均写 I/O 速率 < 1 KiB/s；建议关机观察或回收。
  2. **资源过剩虚拟机**（`excess`）：最近 10 天 CPU 使用率持续 < 10% **或** 内存使用率持续 < 10%（取日最大值）；建议降低计算资源分配。
  3. **资源不足虚拟机**（`shortage`）：最近 10 天 CPU 使用率持续 > 90% **或** 内存使用率持续 > 90%（取日最小值）；建议提高计算资源分配。
  4. **长期关机虚机**（`longoff`）：持续关机 ≥ 30 天 **或** 实例状态为待回收；建议删除以释放计算、存储资源。
- 策略引擎：新增字段 `cpuMin` / `memMin`（统计周期内日最小使用率）、`writeAvg`（平均写 I/O，KiB/s）；「持续」类条件（`<`、`<=` 或 `*Min` 的 `>`）必须积满完整统计周期的数据才生效；使用率 / 写 I/O 条件仅对「开机」云主机生效，关机天数仅对「已关机」生效。
- 数据采集：监控读取 Gnocchi `disk.write.bytes.rate`（失败不影响其它指标），采样器按日累计写入 `analytics_vm_usage`（新增 `cpu_min / mem_min / w_sum / w_n` 列）。
- 迁移 `0012_analytics_policies_v2.sql`：加列；已有「忽略」记录按 降配→过剩、升配→不足、回收→长期关机 映射；删除旧 3 条策略并写入新 4 条。
- 页面：云主机优化页签 4 个分段（带数量），各类型列不同（僵尸：写 I/O 平均速率；过剩 / 不足：CPU / 内存平均使用率；长期关机：实例状态 + 持续关机天数）；总览建议卡片 4 列；导出新增「写I/O平均速率(KiB/s)」「持续关机(天)」。URL：`/analytics?tab=optimize&kind=zombie|excess|shortage|longoff`。
- 注意：新增指标（最小值、写 I/O）自部署后开始积累，过剩 / 不足 / 僵尸需积满 10 天才会出结果；长期关机立即生效。

## 第32轮：运营中心、监控中心、配置中心串联（Bug 修复）

- **优化策略扩展为 12 条内置（迁移 `0013_analytics_policies_v3.sql`，替换第31轮的 4 条）**
  - 虚拟机侧 7 条（第37轮起，原「磁盘空间高风险」已去掉）：vCPU过剩（30天 vCPU 平均<15%）、内存过剩（<20%）、vCPU紧张（30天 vCPU 平均>80% 且 CPU 就绪时间占比>10% 且 电源状态=运行中）、内存不足（30天内存平均>85% 且 电源状态=运行中，已取消 Swap 条件与建议）、长期关机（关机>30天）、IO 性能压力异常（磁盘读/写时延>20ms）、僵尸型（磁盘平均写 I/O<1 KiB/s）；除长期关机外均附带「电源状态=运行中」。
  - 物理侧 4 条：物理机 CPU 水位过高（>85%）、物理机内存水位过高（>85%）、存储容量临近耗尽（裸容量已使用>85%）、存在孤立磁盘（无关联虚拟机）。
  - 阈值均可在「优化策略」页调整；`/analytics?tab=optimize&kind=<策略ID>`。
- **创建优化策略**：「优化策略」页新增「创建优化策略」，字段：名称、资源类型（虚拟机 / 物理机 / 集群存储 / 云硬盘）、范围（所有受支持的集群 / 部分集群，虚拟机与物理机按集群，集群存储与云硬盘按云平台）、筛选条件（过去 N 天 + 选择指标，多条件「并且」优先于「或者」）、处置建议、启用开关；编辑框内含「忽略项」（按名称 / ID 精确查找后添加，可移除）。自定义策略可删除，内置策略不可删除。接口：`POST /api/analytics/policies`、`PUT|DELETE /api/analytics/policies/{kind}`、`GET /api/analytics/resolve`、`GET /api/analytics/policies/{kind}/ignores`。新增自绘 `Radio` 组件。
- **资源分析 UI 拆分**：去掉「宿主机明细」「存储器明细」；「存储器」统一改为「集群存储」，按后端名称显示；基础资源使用率新增「集群存储（后端）」面板，每套存储后端都单独显示分配率 / 使用率；分配率与使用率环形图统一保留 1 位小数。
- **明细迁到监控中心**：监控中心页签「物理节点」之后新增「宿主机」（无集群列，样式同物理节点）；「虚拟机」之后新增「集群存储」（后端名称在首列，字段合并配置中心中的集群存储）；虚拟机页新增「CPU 最大使用率（30天）」「内存最大使用率（30天）」。支持 `/monitor?tab=hosts|pools|vms`；配置中心支持 `/capacity?tab=…`。接口：`GET /api/monitor/{id}/hosts|pools|vm-usage`。
- **三处串联**：运营中心的资源分析 / 云主机分析 / 磁盘分析页提供「查看明细」跳转到监控中心或配置中心对应页签。
- **指标可得性（重要）**：Gnocchi 文档中的 `cpu_util`、`memory.util`、`disk.read/write.bytes.rate` 稳定可用；CPU 就绪占比、Swap、磁盘时延、虚拟机内文件系统使用率不在文档范围内，系统按若干候选指标名「尽力采集」，**平台不提供时，对应策略（vCPU紧张 / IO压力）无结果**，不会误报。
- **30 天窗口**：首次访问及此后每 7 天，从 Gnocchi 回填最近 30 天历史（`INSERT IGNORE`，不覆盖已有数据）；持续类条件要求数据天数 ≥ 统计周期才生效。

## 第33轮：运营中心 Bug 修复（日历 / 优化建议下拉 / 全局搜索 / 规格库）

- **自绘日历 `DatePicker`**（`components/DatePicker.jsx`）：替换原生 `input[type=date|datetime-local]`，交互参照 CustomSelect（Portal 实色弹层、年/月切换、今天高亮、min/max 禁用、可选时间、Esc/点外部关闭、空间不足自动上翻）。「使用率分布」日期范围与监控中心「自定义时间范围」均已改用。
- **铁律新增**：`lint:rules` 禁止原生 `input[type=date|datetime-local|time|month|week]`，统一使用 `DatePicker`（仅 `DatePicker.jsx` 自身豁免）。
- **资源分析**：去掉「集群」筛选；筛选栏保留「所属云平台 / 宿主机 / 集群存储」，同一行右侧为「在监控中心查看宿主机信息」「在监控中心查看集群存储信息」。
- **优化建议**：
  - 「虚拟机侧」「物理侧」做成两个下拉，选项为「全部（命中总数）」+ 各策略（带命中数）；默认虚拟机侧「全部」；与「优化策略」入口同一行；去掉「请输入名称搜索」与搜索字段下拉。
  - 选「全部」时按侧汇总所有策略（表格新增「优化策略」列，物理侧为「资源类型」列）；URL：`/analytics?tab=optimize&side=vm|phys` 或 `&kind=<策略ID>`。接口 `GET /api/analytics/optimize/list` 在 `kind` 为空时支持 `side=vm|phys`（空=全部），导出 `GET /api/analytics/export/opt` 同步支持。
  - **排查「其他策略没有数据」**：`/api/analytics/overview`、`/optimize/summary` 的每条 0 命中策略新增 `hint`，页面「暂无命中的策略」卡片逐条说明原因：平台未采集到某指标 / 历史数据未积累满（显示「已积累 X/N 天」）/ 已评估无命中。
- **全局搜索**：运营中心「刷新」右侧新增搜索框（占位文字随页签变化）。总览→过滤云平台汇总表；资源分析 / 云主机分析 / 磁盘分析→出现「搜索结果」卡片，匹配云平台 / 宿主机 / 集群存储，点击即作为筛选；优化建议→按资源名称 / IP / 云平台 / 策略名称过滤；优化策略→按名称 / 条件 / 范围过滤。切换页签自动清空。
- **页头布局**：`PageHeader` 的操作区靠右、描述自动换行，避免描述过长时按钮被挤到下一行。
- **规格库 skills**：`docs/skills/cloudwatch-dev-spec/`（SKILL.md + references：铁律、前端/后端范式、策略引擎与无数据排查、部署验证、检查清单）。
- **生产环境「无数据」根因（运维现场）**：① 服务器 110.42.103.186 到 OpenStack 管理网（192.168.3.204 / 100.100.13.20）不通，30 天历史回填一直失败；② 目前只有约 2 天使用率数据，`<` 类持续型策略（vCPU/内存过剩、僵尸）要求满 30 天；③ vCPU紧张 / 内存不足 / IO压力 / 磁盘空间高风险依赖平台暂未提供的指标（CPU 就绪、Swap、磁盘时延、文件系统使用率）。

## 第34轮：监控中心页签角标 + 系统管理菜单拆平

- 监控中心「宿主机」「集群存储」页签右侧补上数量角标（与服务状态、物理节点一致）：`PerformancePage` 统一请求 `/monitor/{id}/hosts`、`/pools`，页签角标与列表共用同一份数据（`HostsTab`/`PoolsTab` 通过 `q` 属性接收，不再各自请求）。
- 去掉「系统管理」分组及折叠：平台管理、用户管理、角色管理、审计日志、域名配置、系统配置均为侧栏独立入口（后端 `perm.tree` 与前端 mock 菜单同步调整；路径、权限码不变，Sidebar/Breadcrumb 去掉对 `system` 分组的特判）。

## 第35轮：标签页图标跟随主色 / 平台概览重做 / 全局搜索 / 角色管理分页

**1. 浏览器标签页图标（Bug 修复）**
- 根因：`public/favicon.svg` 是写死的红色静态文件，主题代码从未改动过它。
- 现在 `utils/theme.js` 的 `applyBrandColor()` 同时生成 SVG data URI 图标（底色 = 当前主色，线条按主色亮度自动选深/白），写入 `<link id="app-favicon">`；系统配置里换主色（含预览）、换 logo 都会同步更新。
- 配色缓存到 localStorage(`cw_fav`)，`index.html` 在首屏绘制前就读取，刷新不会先闪一下红色。
- 后端 `primaryColor` 是唯一来源；登录页同样生效。

**2. 平台概览（原「概览 / 运维概览」改名并重做，接真实后端）**
- 菜单、权限字典、页面标题统一为「平台概览」（权限码 `dashboard:view` 不变）。
- 后端：`GET /api/dashboard/overview`（汇总资产、监控、告警、优化建议；按 `capacity/monitor/alert/analytics:view` 分区块返回，无权限的区块不返回）、`GET /api/dashboard/trend?range=6h|24h|7d|30d&providerId=`（来自监控历史样本，按时间桶取平均）。
- 前端：KPI（平台在线/总数、计算节点、虚拟机、活跃告警、平台服务、资产采集）→ 容量水位（vCPU/内存分配、存储使用）→ 使用率趋势 + 高负载节点 TOP6 → 各平台概况表 → 最新活跃告警 + 优化建议；所有指标可点击跳转到对应功能；顶部可按平台筛选。已删除 mock 的概览数据。
- 组件拆分在 `components/dashboard/*`，页面远小于 400 行。

**3. 全局搜索（顶栏 Ctrl/⌘ + K）**
- 后端 `GET /api/search?q=&limit=`：覆盖云平台、虚拟机、物理节点、计算节点、云硬盘、虚拟网卡、集群存储、监控节点 / 磁盘 / 服务、告警、域名映射（主机地址）；多个关键词空格分隔需同时命中；按名称 / IP / MAC / 序列号等字段匹配，并告诉前端「命中了哪个字段」；按用户权限逐组过滤；`internal/search` 有单测。
- 前端 `components/search/GlobalSearch.jsx`：250ms 防抖、分组结果、命中高亮、↑↓ 选择 / Enter 跳转 / Esc 关闭、弹层走 Portal 实色卡片。
- 跳转：资产类 → `/capacity?tab=&keyword=&providerId=&open=`（自动打开详情抽屉）；监控类 → `/monitor?tab=&pid=&kw=`；告警 → `/alerts?open=<id>`（直接打开详情）；平台 → `/system/providers?keyword=`；域名映射 → `/system/domain#mappings`。
- `useListQuery` 新增第 4 个参数 `override`（URL 预填，覆盖已保存的筛选并回到第 1 页）；`useClientTable` 的关键字改为多词 AND。

**4. 角色管理分页**
- 角色列表接入 `useListQuery` + `DataTable` 分页（与用户管理一致：10/20/50 条每页、跳页、状态保持），新增「名称/编码/描述」搜索与「内置/自定义」筛选；删除当前页最后一条自动回上一页。
- `roleApi.getRolePage`（带分页参数）；`getRoleList()` 仍返回全量，供用户管理的角色下拉使用。

## 第36轮：物理节点列顺序 / 监控中心物理节点排除 Nova 虚拟机 / 平台概览高负载 TOP5 拆分

1. **配置中心 → 物理节点**：列顺序调整为「主机名」第一列、「所属云平台」第二列，其余列顺序不变（`components/capacity/columns.jsx`）。
2. **监控中心 → 物理节点**：与配置中心同口径，排除型号含「OpenStack Nova」的虚拟机。
   - `capacity.Store` 加载快照时记录被排除的 Nova 行的标识（短主机名 / 完整主机名 / FQDN / IP），通过 `NovaKeys()` 对外提供；`api.visibleNodes()` 按「短主机名或 IP」过滤 `monitor.Snapshot.Nodes`。
   - 作用范围：`GET /api/monitor/{id}`（页签角标数量与列表同步变化）、平台概览高负载统计、全局搜索的「监控 · 节点」。配置中心没有该平台物理节点数据（或没有被排除项）时不做过滤。
   - 单测：`capacity/phys_test.go` 新增 `TestNovaKeys`。
3. **平台概览**
   - 「高负载节点 TOP 6」拆分为「CPU 使用率 TOP 5」「内存使用率 TOP 5」两张卡片，每张上方柱状图、下方列表（排名 / 节点 / 平台 / 使用率条 / 百分比，点击进入监控中心物理节点并带搜索词）；数据来自 `GET /api/dashboard/overview` 的 `topCpu` / `topMem`（各 5 条，已排除 Nova 虚拟机，原 `topNodes` 字段移除）；柱色取自 `useChartPalette()`。
   - 「资源使用率趋势」与两张 TOP5 卡片统一高度（`DASH_CARD_H`，`components/dashboard/TopLoad.jsx`）。
   - 版面顺序：KPI → 容量水位 → 趋势 → CPU / 内存 TOP5 → 最新活跃告警 + 优化建议 → **各平台概况（置底）**。

### 第36轮补充：平台概览横向轮播

- 新增通用组件 `components/Carousel.jsx`：横向滑动切换，默认每 **60 秒**自动轮播到下一页（循环），支持「上一页 / 下一页」按钮、点击页签、←/→ 键翻页；顶部细进度条展示距下次切换的倒计时；鼠标悬停或键盘聚焦在内容上时暂停，离开后重新计时；容器高度跟随当前页；非当前页 `inert`，不会被 Tab 聚焦；系统开启「减少动画」时无过渡。
- 平台概览（KPI 与容量水位保持固定）下方分 4 页：**资源使用率趋势** → **CPU / 内存 TOP 5** → **告警与优化建议** → **各平台概况**；无对应权限的页自动不出现。
- TOP5 卡片高度调为 480px（趋势卡同步），列表 5 行完整显示；同名节点在图表标签后附 IP 尾段。

### 第36轮补充：监控中心「宿主机」更名为「计算节点」

- 监控中心页签、表头（首列）、搜索框占位、空状态、页面说明，以及物理节点页「使用核数」提示、采集明细步骤名、运营中心里指向监控中心的跳转文案，统一由「宿主机」改为「计算节点」。
- 仅调整展示文案：路由参数 `?tab=hosts`、接口 `/monitor/{id}/hosts`、数据结构均不变，已保存的书签 / 链接继续有效。运营中心内部「宿主机」维度（筛选、图表）保持原名，本轮未改。

### 第36轮补充：运营中心「宿主机」同步更名为「计算节点」

- 运营中心全部页签（总览平台表列头与统计卡、资源分析筛选与「基础资源分布」切换、「计算节点上云主机分布」图表、云主机分析筛选、页头搜索占位与说明、全局搜索结果分类）统一为「计算节点」；代码注释与开发规范文档同步。
- 新增迁移 `0014_rename_host_to_compute_node.sql`：把内置优化策略建议文案里的「宿主机」更新为「计算节点」（仅内置策略）。
- 内部标识（接口字段 `hosts`/`hostVms`、`?tab=hosts`、筛选参数 `host`、资源类型码 `host`）不变，保证兼容。「本机 hosts 注入」模块里指 Docker 所在机器的「宿主机」是另一概念，保持原样。

## 第37轮补充（6 项问题修复）

1. **监控中心默认「全部云平台」**：去掉页头「选择平台」下拉与"默认选第一朵云"逻辑；总览、服务状态、物理节点、计算节点、磁盘状态、虚拟机、集群存储、采集明细全部默认汇总所有云平台，每个列表工具栏与配置中心一致：`搜索框 + 可清除的「全部云平台」(所属云平台) 下拉 + 共 N 项（全部 M）`；各表新增/保留「所属云平台」列（磁盘状态、服务状态本轮新增该列），详情弹窗按行所属平台取数。总览 KPI 按所选范围汇总（容量/使用量求和后重算使用率、云主机状态求和、健康取最差、IOPS 求和），趋势图多平台按时间桶合并；「立即采集」对当前范围内所有平台并发采集。`?pid=` 仍可带入平台筛选。涉及 `PerformancePage.jsx`、`components/monitor/*`、`utils/monitorAgg.js`。
2. **运营中心 · 总览**：云主机趋势 / 优化建议 / 各云平台资源汇总改为横向轮播（复用 `components/Carousel.jsx`，每 60 秒自动切换，悬停暂停）。
3. **运营中心 · 资源分析**：基础资源分布 / 计算节点上云主机分布 / 基础资源按使用率分布改为横向轮播（每 60 秒）。
4. **运营中心 · 优化策略**：列表增加分页（默认 10 条/页，可选 10/20/50/100，规则同优化建议），搜索后回到第 1 页。
5. **策略规则更新**（迁移 `0015_policy_rules_update.sql`）：vCPU紧张虚机 = 过去 30 天 vCPU 平均使用率>80% 且 CPU 就绪时间占比>10% 且 电源状态=运行中；内存不足虚机 = 过去 30 天内存平均使用率>85% 且 电源状态=运行中（取消 Swap 条件、Swap 指标字段与「内存交换」列）；删除「磁盘空间高风险虚拟机」策略及其忽略项。后端 `parseConds` 会丢弃历史自定义策略中残留的 swap 条件。
6. **角色管理**：首列增加勾选框（表头全选当前页），选中后出现「已选 N 项」条与「批量删除」（含内置角色或仍有用户的角色时置灰并提示原因），交互参考用户管理。

## 第38轮补充
- **域名配置 → 新增域名映射**：默认组件勾选新增 `emla`（共 8 个：keystone / neutron / nova / cinder / glance / gnocchi / coaster / emla）。前端 `DEFAULT_COMPONENTS`、后端 `hosts.DefaultComponents`（接口未传组件时的兜底）同步；已有映射不受影响。
- **服务器网络**：`docker-compose.yml` 固定容器网段 `192.129.11.128/25`（docker0 用 `192.129.11.0/25`，需在 `/etc/docker/daemon.json` 配置 `bip` 与 `default-address-pools`），避免与隧道路由 `172.0.0.0/8` 冲突。

## 第39轮补充（监控中心 4 项问题修复）
- **服务状态**：只展示对照表中的 35 项服务（后端 `monitor/service_rules.go` 白名单，旧快照读取时同样过滤）；去掉「附加信息」「实例数」两列。线上真实取值口径与文档（0 健康）不一致，已按指标分类判定：`check_*`/`mysql_up`/`probe_success`/`hostha` 为 1 正常；`*_up_total` >0 正常；`*_down_percent` 为 0 正常；compute / compute_management / compute_scheduler / block_storage / virtualization_management 为「异常个数」，0 正常；control_* / rabbitmq / log_collection / event_mesh / data_protection 为可用百分比，100 正常；time_synchronization / automation_center ≥1 正常（后两者口径待平台方确认）。判定结果输出为 `healthy` 字段，总览/搜索/仪表盘的异常数统一用它。
- **物理节点总核数/使用核数**：Nova hypervisors 只覆盖计算节点，控制/存储节点原先为空。现按主机名 / IP 匹配配置中心的物理机 `cpuCores` 补全总核数；无 Nova 分配数据的节点，使用核数按 CPU 使用率 × 总核数估算并取整，直接显示整数核数（不带「≈」，已去掉 `coresEst`）。Nova 有值的节点仍以 Nova 为准。
- **总览**：「虚拟机（Nova）」卡片改为「计算节点」（取计算节点数），「云主机总数」改为「虚拟机」。
- **采集明细 /ecms/dashboard 失败**：定位为平台侧 EMLA 故障，而非我方超时或网络不可用。北京生产环境对 `dashboard_instances_vcpu_usage` / `dashboard_instances_memory_usage` 返回 HTTP 200，但 `results[].error` 内是平台内部 HTTP 500；不带 `metrics_filter` 的整体请求会一直挂起直至我方 30 秒超时；其余 dashboard 指标正常。现在采集步骤改为按指标过滤请求（路径含 `metrics_filter`），并在步骤错误中显示平台返回的原始错误。

## 第40轮补充（Bug 修复 + 自动巡检）

### Bug 修复
- **配置中心 · 物理节点状态分布**：`unmaintain_error` 显示为「恢复失败」（`capacity/labels.go`）。

### 自动巡检（菜单「自动巡检 → 巡检报告」，路径 `/inspection`）
对已对接的云平台**只读**巡检，数据来自已落库的监控快照、`metric_samples` 历史样本、告警中心、配置中心与运营中心策略；可选「巡检前先实时采集」（失败自动回退到最近一次数据，并在报告里提示）。

- **21 个检查项**（`inspection/model.go` 的 `Catalog`）：平台控制服务状态、核心服务健康度、节点与计算服务状态、物理节点资源使用率、云资源使用情况、存储集群健康、**集群容量状态**（含按近 7 天增速的耗尽预测）、存储池容量与状态、磁盘健康（SMART）、固态盘寿命、**磁盘容量使用率**、**集群存储 IO 性能**、**磁盘延迟**、**集群正在告警**、云主机运行状态、**长期关机云主机**、**僵尸云主机**、**CPU / 内存使用率偏高的云主机**、云硬盘状态、监控数据时效与采集。长期关机 / 僵尸沿用运营中心的策略定义（`analytics.Engine.Hits`）。
- **不包含**「平台许可与维保」「云产品许可」（按需求去掉，报告与检查项中均无此内容，单元测试会校验）。
- **判定与评分**：每项结果为 正常 / 预警 / 异常 / 未采集；平台健康评分 = 100 − 12×异常项 − 4×预警项（未采集不计分）；综合评估取最差。阈值（固态盘寿命、磁盘/存储/存储池使用率、容量耗尽天数、vCPU/内存/节点 CPU/内存、磁盘 I/O、磁盘延迟、云主机偏高线、数据过期分钟、明细表行数）均可在「巡检设置」中调整并带校验；报告会保存本次使用的阈值快照。
- **执行**：`POST /api/inspection/run` 立即返回任务（`tasks.kind='inspect'`），前端轮询进度；同一时刻只运行一次。定时巡检（每天 / 每周 + 时刻，东八区，触发窗口 30 分钟，按「已执行过」去重）；服务重启时中断的巡检任务置失败。
- **Word 报告**（`inspection/docx*.go`，无第三方依赖，手写 OOXML）：封面（Logo / 品牌名 / 综合评估 / 评分 / 日期）→ 一、巡检结论总览 → 各平台「巡检详情」（环境信息、结果总览、按分组的检查项明细表、结论与建议）→ 巡检记录（含阈值表）；页眉页脚、页码。文件名 `云平台自动巡检报告_yyyymmdd_hhmm.docx`。
- **接口**：`GET /api/inspection/reports`（keyword/overall/trigger/from/to/sortKey/sortOrder/page/pageSize）、`GET /api/inspection/reports/{id}`、`GET /api/inspection/reports/{id}/export`、`DELETE /api/inspection/reports/{id}`、`POST /api/inspection/run`、`GET /api/inspection/tasks/{id}`、`GET|PUT /api/inspection/config`。权限 `inspection:view / run / export / config / delete`（迁移 `0016_inspection.sql` 给内置角色追加；管理员为 `*`），发起 / 导出 / 删除 / 修改设置均写审计日志。
- **保留期**：报告按 `settings.Retention.InspectionDays` 清理（以完成时间计）。
- **前端**：`pages/InspectionPage.jsx` + `components/inspection/*`（立即巡检弹窗 + 进度、报告详情抽屉、巡检设置弹窗、删除确认）。
- **代码结构**：`monitor.VisibleNodes` 从 `api` 抽出，供巡检与监控中心共用「物理节点」口径。
- **验证**：`go test ./...` 通过；本机 2 个演示平台实跑 42 项并导出 15 页 Word（LibreOffice 转 PDF 逐页检查）；Playwright 走通 发起巡检 → 详情 → 导出 Word → 设置。演示环境无 IOPS / 延迟 / 云主机使用率数据，对应项显示「未采集」。

## 第41轮补充（Bug 修复：巡检报告详情按分类横向切换）

- 问题：报告详情抽屉把全部检查项纵向排成一页，内容过长，容易漏看。
- 修复：`ReportDrawer` 改为横向标签页——「总览」+ 各检查分类（平台服务 / 节点与计算 / 存储集群 / 磁盘 / 性能 / 告警 / 云主机 / 数据采集）。每个标签带该分类最严重状态的色点与检查项数量，异常分类一眼可见；标签过多时可横向滚动，支持键盘 ←/→/Home/End 切换。
- 多平台报告：顶部先选云平台，再选分类；切换平台时分类自动回到「总览」。
- 总览页含健康评分、各状态计数、采集提示、环境信息、全部检查项状态一览以及综合结论与处理建议。
- 仅前端改动，无接口 / 数据库变更。

## 第42轮补充（Bug 修复：巡检健康评分为 0）

- 原因：旧算法"每个异常扣 12、预警扣 4"，检查项多、问题多的大平台（如 3 预警 + 11 异常）直接扣成负数，被截断为 0 分，既不合理也无区分度。
- 新算法（`inspection.scoreOf`）：评分 = 已采集检查项的**加权通过率**（正常 100%、预警 65%、异常 15%），**未采集项不参与评分**；并与综合评估保持一致——存在异常项最高 89 分、存在预警项最高 94 分；有采集数据时最低 1 分；全部未采集无法评估时才为 0。多平台报告的总评分为各平台评分的平均值。
- 历史报告：后端启动时自动把评分算法版本低于 2 的历史报告按新算法重算（含列表评分、摘要文字），只执行一次。
- 顺带修复：数据采集时间晚于巡检时间时出现"-1 分钟前"，现按 0 处理。
- 详情页"健康评分"卡片悬停可见评分口径说明；单元测试覆盖各典型场景。

## 第43轮补充（隐藏「统一资源管理」「统一资源视图」）

- 这两个菜单当前只有"规划中"占位页，没有实际功能，按需求先隐藏。
- 已隐藏：侧边栏菜单（后端 `perm.tree` 与前端 mock 菜单）、`/planned/*` 占位路由、角色管理里的"统一资源视图"权限项、`resource:view` 权限码（不再下发）。
- 旧地址 `/planned/resource-mgmt`、`/planned/resource-view` 现为 404；角色库中已有的 `resource:view` 字符串无副作用，登录时会被过滤。
- 未删除：`PlannedPage.jsx` 占位页文件与相关代码均以注释保留（`perm.go`、`menus.js`、`permissions.js`），后续功能开发完成后取消注释并恢复 `App.jsx` 中的占位路由即可上线。

## 第44轮补充（菜单顺序 + 运营中心两条内置策略调整）

- 菜单：「自动巡检」移到「平台管理」上面（顺序：…运营中心 → 自动巡检 → 平台管理 → 用户管理…）。
- 优化策略（迁移 `0017_policy_rules_update2.sql`，仅更新内置策略，用户自建策略不受影响）：
  - **vCPU紧张虚机**：针对过去30天的数据分析，vCPU平均使用率 大于 85% 且 电源状态 等于 运行中，建议增加其 vCPU 配置。（去掉了原有的"CPU 就绪时间占比 > 10%"条件。）
  - **IO性能压力异常虚拟机**：针对过去30天的数据分析，磁盘平均写I/O速率 大于 150MiB/s 且 电源状态 等于 运行中，建议确认其读写是否合理。（原条件为磁盘时延 > 20ms。）
- 新增指标 `writeMiB`（磁盘平均写I/O速率，单位 MiB/s）：与原 `writeAvg`（KiB/s）取自同一采样，仅单位换算，策略编辑弹窗中两者可选；僵尸型虚拟机仍用 KiB/s 指标。
- 优化资源列表的"写I/O平均速率"列：≥1MiB/s 时以 MiB/s 展示，否则 KiB/s。
- 注意：该迁移会把线上这两条内置策略重置为上述规则（若曾手工改过内置策略的阈值，会被覆盖）。

## 第45轮补充（菜单更名 + 每月定时巡检 + 三大模块 Excel 导出）

- 更名：资产管理 → **配置中心**（页内「资产总览」同步为「配置总览」）、运营分析 → **运营中心**、自动化巡检 → **自动巡检**。路由、权限编码、接口路径均不变；历史迁移 0009–0017 不改。说明：需求里的「配置管理」代码中并不存在，按「资产管理 → 配置中心」处理。
- 定时巡检新增「每月」：巡检设置 → 定时与数据，可选 每日 / 每周 / 每月；每月需选日期（1–31 日）与时间。当月没有该日期（如 31 日遇到 2 月）时改在当月最后一天执行。配置字段 `schedule.mode=monthly` + `schedule.day`，旧配置缺省按 1 日处理。
- Excel 导出（按钮「导出 Excel」，按筛选条件导出，无数据时禁用，文件名含模块名 + 筛选条件 + 时间）：
  - 监控中心：服务状态 / 物理节点 / 计算节点 / 磁盘状态 / 虚拟机 / 集群存储 / 采集明细 7 个页签，浏览器端按当前排序与筛选生成 xlsx，同时调用 `POST /api/monitor/export-log` 写审计日志。
  - 配置中心：物理节点 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 集群存储 6 类资源，后端 `GET /api/capacity/{kind}/export`（最多 5 万行）。
  - 运营中心：总览 / 资源分析 / 虚拟机分析 / 磁盘分析 / 优化策略，后端 `GET /api/analytics/{kind}/export`（优化建议沿用原导出）。
- 新权限 `monitor:export`、`capacity:export`（角色管理的监控中心、配置中心按钮权限里可勾选）；迁移 `0018_monitor_capacity_export.sql` 给 r2/r3/r5 三个内置角色补授，已有自定义角色需手工勾选。

## 第47轮补充（Bug 修复：告警「已恢复」自动置为已确认 + 关联记录）
- **根因**：`ApplySync` 只更新 `status`（firing→resolved），从未触碰 `acked`，所以恢复后的告警仍显示「未确认」；线上 5981 条已恢复记录里只有 156 条是已确认，其余都是无需处理却挂着「未确认」。
- **修复**（`backend/internal/monitor/alerts.go`）：每次同步事务内 `autoAckResolved`——① 已恢复且未确认 → 置为已确认，确认人 `系统(自动恢复)`、确认时间=恢复时间；人工已确认的保留原确认人；② 复发（同一行恢复后再次告警中）→ 仅撤销「系统自动确认」，人工确认不动。迁移 `0019_alert_auto_ack.sql` 回填存量。
- **关联关系**：云平台告警指纹（`fingerprint` = 标签哈希）+ 平台 ID 即同一告警对象的历次发生；新增 `GET /api/alerts/{id}/related`（`alert:view`），详情抽屉新增「关联记录」，可逐条点击切换，并显示每条的确认方式（自动确认 / 某某确认）。
- **口径**：顶部「告警中 / 未确认」统计、右上角未读角标本就只统计告警中，不受影响；列表「确认」列对自动确认的条目悬浮提示「告警已恢复，系统自动确认」。
- 测试：`go test ./internal/monitor -run AutoAck`（需 `CW_TEST_DSN`，覆盖：恢复自动确认 / 人工确认保留 / 云平台直接返回已恢复 / 复发撤销 / 关联记录）。

## 第48轮补充（Bug 修复：规格名称统一 + 云主机分析更名虚拟机分析）
- **根因**：① 监控中心「虚拟机」页签该列展示的是 `vCPU / 内存` 拆分数据，而非规格名称；② 配置中心「规格名称」列用的是普通截断样式（`clip`），与监控中心不一致；③ 运营中心「优化建议」后端 `flavorText` 一律拼成「NvCPU xGB」，且列名叫「实例规格」，没有展示真实规格名称；④ 运营中心页签仍叫「云主机分析」，与其它模块「虚拟机」口径不一致。
- **修复**：
  - 新增共享组件 `FlavorCell`（`components/monitor/cells.jsx`）：13px、单行省略（最大 140px）、悬浮提示「规格：名称（N 核 / X）」、无数据显示 `—`。监控中心 / 配置中心 / 运营中心优化建议三处统一使用。
  - 监控中心虚拟机：`vCPU / 内存` 列 → `规格名称`（可排序）；Excel 导出新增「规格名称」列（原 vCPU/内存 列保留）。
  - 运营中心：页签与导出标题「云主机分析」→「虚拟机分析」；优化建议列「实例规格」→「规格名称」（含 Excel 导出列），后端优先输出真实规格名称，仅在名称缺失时回退为「NvCPU xGB」，并附带 `vcpus/ramMb` 供悬浮提示。

## 第49轮补充（运营中心：虚拟机趋势 / 策略批量删除 / 内置策略更名）
- 运营中心「总览」轮播与「虚拟机分析」页的趋势面板标题：「云主机趋势」→「虚拟机趋势」。
- 优化策略名称更名（迁移 `0020_policy_rename_vm.sql`，只改内置策略；同步巡检里引用的策略名）：IO性能压力异常虚拟机 → **IO性能压力异常虚机**；长期关机虚拟机 → **长期关机虚机**；僵尸型虚拟机 → **僵尸型虚机**。
- 优化策略列表支持勾选后**批量删除**：仅自定义策略可勾选（内置策略复选框禁用），选中栏出现「批量删除（N）」，二次确认后调用 `POST /api/analytics/policies/batch-delete {kinds:[]}`（权限 `analytics:policy_update`，单次最多 200 条，事务内一并清除对应忽略项；请求含内置策略时整体拒绝，写审计日志）。

## 第50轮补充（平台概览：轮播顺序与间隔）
- 平台概览底部轮播顺序调整为：**各平台概况 → CPU / 内存 TOP 5 → 资源使用率趋势 → 告警与优化建议**（原为 趋势 → TOP5 → 告警 → 各平台概况）；无对应权限的页签仍自动隐藏。
- 平台概览轮播间隔由 60 秒改为 **30 秒**（`DashboardPage` 给 `Carousel` 传 `interval={30000}`）；运营中心总览 / 资源分析的轮播仍为 60 秒。

## 第51轮补充（轮播间隔统一 10 秒 / 资源分析与虚拟机分析轮播 / 更名）
- 轮播间隔改为 **10 秒**：平台概览底部（原 30 秒）、运营中心「资源分析」「虚拟机分析」。运营中心「总览」轮播保持 60 秒。
- 运营中心 · 资源分析：「集群存储分配率 / 使用率（按存储后端）」并入轮播，轮播共 4 页：集群存储分配率 / 使用率 → 基础资源分布 → 计算节点上虚拟机分布 → 基础资源按使用率分布。
- 运营中心 · 虚拟机分析：虚拟机趋势、虚拟机按使用率分布改为横向轮播（2 页）。
- 更名：计算节点上云主机分布 → **计算节点上虚拟机分布**；云主机按使用率分布 → **虚拟机按使用率分布**。
