<p align="center"><img src="docs/logo.svg" width="84" alt="CloudWatch logo" /></p>

<h1 align="center">CloudWatch · 私有云可观测平台</h1>

<p align="center">
  面向 SRE 与云平台运维人员的<strong>多云 / 私有云统一运维控制台</strong><br/>
  一个界面纳管多套 OpenStack（易捷行云 ES 等）平台，打通 <strong>监控 · 配置 · 告警 · 拓扑 · 运营分析 · 自动巡检</strong>
</p>

<p align="center">
  <img alt="Go" src="https://img.shields.io/badge/Go-1.22-00ADD8?logo=go&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" />
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="MariaDB" src="https://img.shields.io/badge/MariaDB-10.11-003545?logo=mariadb&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
</p>

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [快速开始（Docker 部署）](#快速开始docker-部署)
- [本地开发](#本地开发)
- [配置说明](#配置说明)
- [权限与角色](#权限与角色)
- [项目结构](#项目结构)
- [开发规范](#开发规范)
- [文档](#文档)

## 项目简介

CloudWatch 把多个 OpenStack 私有云平台纳管到同一个控制台，只读采集资源、监控指标与告警，帮助运维人员：

- **一眼看清全局**：平台 → 集群 → 计算节点 → 虚拟机 → 存储 / 网络的全链路状态与容量水位；
- **快速定位问题**：监控、告警、拓扑互相串联，告警可直接关联到具体资源；
- **做出运营决策**：基于历史使用率给出降配 / 升配 / 回收建议；
- **自动化巡检**：定时对各平台做健康检查并生成 Word 报告。

设计原则：

- **所有参数只在页面填写**——业务配置（平台接入、通知渠道、安全策略、品牌等）一律入库，不改后台配置文件；后端仅用少量环境变量做启动引导。
- **只读采集**——对云平台只做查询，不改动被纳管环境（「写操作开关」默认关闭）。
- **安全默认**——密码 / 密钥 AES-256-GCM 加密入库且接口永不回显；登录支持验证码、失败锁定、会话超时、密码有效期；全部变更写入审计日志。

## 功能特性

| 模块 | 说明 |
|---|---|
| **平台概览** | KPI（平台 / 节点 / 虚拟机 / 告警）、容量分配与水位；底部 10 秒轮播：各平台概况 → CPU / 内存 TOP 5 → 资源使用率趋势 → 告警与优化建议；支持全屏、按平台筛选，点击指标直达对应模块 |
| **监控中心** | 总览 KPI 与趋势（1h / 6h / 24h / 7d / 30d）；服务状态、物理节点、计算节点、磁盘状态、虚拟机（含规格名称、CPU / 内存 30 天最大使用率）、集群存储、采集明细 8 个页签；按平台同步间隔定时采集，也可手动立即采集；支持 Excel 导出 |
| **配置中心** | 物理节点 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 集群存储 六类资产台账，列表精简、详情抽屉、使用率悬停百分比、平台控制台一键直达；按筛选条件导出 Excel（最多 5 万行） |
| **告警中心** | 对接 EMLA 告警：统计卡片、筛选排序、详情抽屉、单条 / 批量确认、Excel 导出；**已恢复告警自动置为已确认**，复发自动撤销；基于指纹展示同一对象的**关联记录**；新增 / 恢复告警经邮件（SMTP）、Webhook 渠道推送，失败自动重试 |
| **资源拓扑** | 全局总览 + 单平台分层拓扑（物理层 → 计算层 → 实例层 → 挂载层 → 后端层）；节点健康度着色、选中高亮上下游链路、告警面板联动定位、详情抽屉下钻到配置中心 |
| **运营中心** | **总览**（资源数量、分配率 / 使用率、虚拟机趋势、优化建议）· **资源分析**（存储后端分配率 / 使用率、基础资源分布、计算节点上虚拟机分布、按使用率分布）· **虚拟机分析** · **磁盘分析** · **优化建议**（忽略 / 批量忽略）· **优化策略**（11 条内置策略阈值可调，支持新建自定义策略与批量删除）；图表以横向轮播展示 |
| **自动巡检** | 21 个检查项（平台服务、节点与计算、存储集群、磁盘、性能、告警、虚拟机、数据采集），加权健康评分；支持立即巡检与每日 / 每周 / 每月定时；一键导出 Word 巡检报告；阈值可在页面调整 |
| **平台管理** | 三步向导接入平台（基本信息 / 认证信息 / 高级）；验证连接（域名解析 + HTTP 探测 + Keystone Token）；同步入库、自动同步、写操作开关、删除影响范围预览 |
| **用户 / 角色** | 用户增删改、批量删除（保护自己与最后一个超管）；角色功能权限树 + 平台级数据权限（allow / deny） |
| **审计日志** | 登录与所有变更操作留痕，敏感字段递归脱敏，支持检索与导出 |
| **域名配置** | 录入「控制台 IP + 根域名」自动生成组件域名，同步到本机 hosts、内置 DNS、Docker 容器 `/etc/hosts` 三种通道 |
| **系统配置** | 基础信息 / 品牌（Logo、登录背景、**主色运行时生效，含暗色**）/ 安全策略 / 数据保留 / 告警渠道，分组独立保存、撤销、恢复默认 |

通用能力：浅色 / 暗色主题、全局搜索、列表排序分页、Excel 导出、权限驱动菜单与按钮、桌面与移动端自适应布局。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 · Vite 5 · Tailwind CSS 3（JSX，无 TypeScript）· Recharts · zustand · axios · React Router 6 · lucide-react · SheetJS(xlsx) |
| 后端 | Go 1.22（标准库 `net/http`，无 Web 框架）· `database/sql` + go-sql-driver/mysql · excelize（Excel）· bcrypt · 内嵌 SQL 迁移 |
| 数据库 | MariaDB 10.11 / MySQL（启动时自动迁移，`schema_migrations` 记录版本） |
| 部署 | Docker Compose（MariaDB + Go API + Nginx 静态站点 / `/api` 反代） |
| 对接对象 | OpenStack Keystone / Nova / Neutron / Cinder / Glance，Gnocchi、EMLA（监控与告警）、Coaster |

## 系统架构

```
 浏览器 ──► Nginx(cloudwatch-web) ──/api──► Go API(cloudwatch-backend) ──► MariaDB
              静态前端                        │  定时采集 / 告警同步 / 采样 / 巡检 / 数据清理
                                              ▼
                                  各 OpenStack 平台（Keystone / Nova / Cinder / Neutron / EMLA …）
```

- 统一响应 `{code, message, data}`；字段校验失败返回 HTTP 400 / code `40001` + `data.fields`。
- 后端后台任务：平台自动同步、告警同步与推送、运营采样器（每分钟）、定时巡检、数据保留清理（每小时）。
- 权限在后端强制校验，前端仅做菜单与按钮的二次过滤。

## 快速开始（Docker 部署）

前置条件：Docker 与 Docker Compose。

```bash
git clone https://github.com/jibiao-ai/CloudWatch.git
cd CloudWatch

cp deploy/env.example .env      # 修改 DB_ROOT_PASSWORD / DB_PASSWORD，可选 CW_ADMIN_PASSWORD、WEB_PORT
docker compose up -d --build    # MariaDB + cloudwatch-backend + cloudwatch-web(nginx)

# 未指定 CW_ADMIN_PASSWORD 时，随机初始密码仅在首次启动日志输出一次：
docker compose logs cloudwatch-backend | grep admin
```

访问 `http://<服务器IP>:<WEB_PORT>`（默认 80），使用 `admin` 登录，**首次登录强制修改密码**，然后进入「平台管理」接入云平台。

说明：

- 数据库迁移随后端启动自动执行，数据存放于 Docker volume `db-data`。
- 国内网络：Docker Hub 不通时在 `/etc/docker/daemon.json` 配置 `registry-mirrors`；后端构建默认 `GOPROXY=https://goproxy.cn`，前端默认 npmmirror。
- 「域名配置」需要后端挂载宿主机 `/etc/hosts` 与 `/var/run/docker.sock`（compose 已配置，不需要该功能可删除）。云平台域名解析依赖该能力，建议保留。
- 公网部署请放行 `WEB_PORT`，并建议前置 HTTPS（反向代理 / 证书）。

升级：拉取新代码后执行 `docker compose up -d --build cloudwatch-backend cloudwatch-web`，迁移自动应用。

## 本地开发

**后端**（Go 1.22+，MariaDB / MySQL）

```bash
sudo mysql -e "CREATE DATABASE cloudwatch CHARACTER SET utf8mb4;
  CREATE USER 'cloudwatch'@'localhost' IDENTIFIED BY 'cloudwatch_dev';
  GRANT ALL ON cloudwatch.* TO 'cloudwatch'@'localhost';"

cd backend
export CW_ADDR=:8080 CW_DB_DSN='cloudwatch:cloudwatch_dev@tcp(127.0.0.1:3306)/cloudwatch' CW_SEED_DEMO=true
go run ./cmd/server           # 或 go build -o bin/cloudwatch-api ./cmd/server
go test ./...                 # 单元测试（部分用例需 CW_TEST_DSN）
```

**前端**（Node 20+）

```bash
cd frontend
npm install
cp .env.example .env          # VITE_USE_MOCK=hybrid（默认）| true | false
npm run dev                   # http://localhost:3000，/api 代理到 127.0.0.1:8080
npm run build
npm run lint:rules            # 规范扫描（见「开发规范」）
```

`VITE_USE_MOCK`：`false` 全部走真实后端；`true` 纯前端演示、无需后端；`hybrid` 为混合模式（仅用于开发过渡）。

演示账号（仅 `CW_SEED_DEMO=true` 时写入，**生产请勿开启**），密码 `CloudWatch@2026`：`admin`（超管）· `zhangwei`（云平台运维）· `wangfang`（只读观察员）· `liuyang`（安全审计员）。

## 配置说明

后端仅以下**引导项**使用环境变量，其余一切业务参数均在页面配置：

| 变量 | 说明 |
|---|---|
| `CW_ADDR` | 监听地址，默认 `:8080` |
| `CW_DB_DSN` | 数据库 DSN，如 `cloudwatch:pwd@tcp(db:3306)/cloudwatch` |
| `CW_SECRET_KEY` | 密钥加密主密钥；缺省时自动生成并存入数据库 |
| `CW_ADMIN_PASSWORD` | 初始 admin 密码；缺省随机生成，首次启动日志打印一次，且首次登录强制改密 |
| `CW_SEED_DEMO` | `true` 写入演示账号与数据，生产保持 `false` |

Compose 变量见 [`deploy/env.example`](deploy/env.example)：`DB_ROOT_PASSWORD`、`DB_PASSWORD`、`CW_ADMIN_PASSWORD`、`CW_SECRET_KEY`、`WEB_PORT`。

**接入云平台的约定**：每朵云有独立根域名，组件端点形如 `<keystone|nova|neutron|cinder|glance|gnocchi|emla|coaster>.<根域名>`，需要在**后端所在机器**能解析（通过「域名配置」自动维护 hosts 即可）；项目名对应云平台 project。

## 权限与角色

- 菜单与按钮由权限码驱动，如 `monitor:view`、`monitor:export`、`capacity:export`、`alert:ack`、`analytics:ignore`、`analytics:policy_update`、`inspection:run`、`provider:*`、`user:delete` 等；超级管理员为 `*`。
- 内置角色：超级管理员、云平台运维、只读观察员、安全审计员，另预置「生产 SRE」示例角色（仅可访问生产与灾备平台）；可在「角色管理」新建自定义角色，并配置**平台级数据权限**（允许 / 拒绝指定云平台）。
- 新增权限码时，迁移脚本会给内置角色补授；已有自定义角色需手工勾选。

## 项目结构

```
CloudWatch/
├── backend/                  Go 后端
│   ├── cmd/server/           程序入口
│   └── internal/
│       ├── api/              HTTP 路由与处理器
│       ├── auth/ perm/       认证会话 / 权限树与数据范围
│       ├── provider/         云平台接入、验证与同步
│       ├── monitor/          监控采集与告警同步
│       ├── capacity/         配置中心资产
│       ├── analytics/        运营中心（采样、分析、优化策略）
│       ├── inspection/       自动巡检与 Word 报告
│       ├── topology/         资源拓扑聚合
│       ├── hosts/ notify/    域名同步 / 告警渠道推送
│       ├── settings/ audit/ retention/ secrets/ search/ db/ httpx/
│       └── db/migrations/    内嵌 SQL 迁移
├── frontend/                 React 前端
│   └── src/ components/ pages/ services/ store/ hooks/ utils/ styles/
├── deploy/env.example        Compose 环境变量模板
├── docker-compose.yml        一键部署
└── docs/                     Logo、开发日志（DEVLOG.md）
```

## 开发规范

`npm run lint:rules` 在构建前自动扫描并阻断以下问题：

1. 参数必须在页面录入，禁止写进后端配置文件；
2. 禁止硬编码颜色与 `dark:` 前缀，一律使用 CSS Variables（主色运行时可配）；
3. 禁止毛玻璃风格（`backdrop-*`、半透明浮层），弹窗 / 下拉 / Toast 等使用实色卡片；
4. 输入控件聚焦不使用彩色 ring / 边框；
5. 禁止原生 `<select>`、`window.confirm/alert/prompt`、页面内直接 `fetch/axios`、emoji 当图标、页面文件超过 400 行等。

提交规范：`feat(scope):` / `fix(scope):`。

## 文档

- [开发日志 `docs/DEVLOG.md`](docs/DEVLOG.md)：历轮需求、各模块设计细节、接口与数据表、问题根因与修复说明。
- 安全提示：仓库不包含任何云平台账号 / 密码；接入信息均在页面录入并加密存储。
