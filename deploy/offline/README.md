# CloudWatch 离线部署指南（Docker 镜像包）

适用于**不能联网拉取镜像 / 不能在目标机编译**的环境：在能联网的机器下载镜像包，拷贝到目标机，导入后一键启动。

- 镜像包：`cloudwatch-images.tar.gz`（约 126 MB，`linux/amd64`），内含 3 个镜像
  - `cloudwatch-backend`（Go 后端，alpine 基础镜像，静态编译）
  - `cloudwatch-web`（nginx + 前端静态文件，已含 `/api` 反代配置）
  - `mariadb:10.11`（数据库，官方镜像原样打包）
- 因超过 GitHub 仓库单文件 100 MB 限制，镜像包发布在 **GitHub Release**（不在 git 历史中）：
  <https://github.com/jibiao-ai/CloudWatch/releases/tag/offline-demo-v1>
- 对应源码提交：`c294317`。仅支持 x86_64 / amd64；ARM 服务器需另行构建。

## 一、准备（在能联网的机器上）

下载 3 个文件到同一目录：

| 文件 | 来源 |
|---|---|
| `cloudwatch-images.tar.gz` | Release 附件 |
| `SHA256SUMS` | Release 附件（校验用） |
| `docker-compose.yml` `env.example` `install.sh` | 仓库 `deploy/offline/` 目录 |

```bash
# 示例：命令行下载
BASE=https://github.com/jibiao-ai/CloudWatch
mkdir cloudwatch-offline && cd cloudwatch-offline
curl -LO $BASE/releases/download/offline-demo-v1/cloudwatch-images.tar.gz
curl -LO $BASE/releases/download/offline-demo-v1/SHA256SUMS
for f in docker-compose.yml env.example install.sh; do curl -LO https://raw.githubusercontent.com/jibiao-ai/CloudWatch/main/deploy/offline/$f; done
chmod +x install.sh
sha256sum -c SHA256SUMS      # 应输出 cloudwatch-images.tar.gz: OK
```

## 二、上传到目标机

```bash
scp -r cloudwatch-offline root@<目标机IP>:/opt/
```

（U 盘 / 堡垒机文件传输均可，保持 5 个文件在同一目录。）

## 三、一键安装

目标机需已安装 **Docker 20.10+ 与 Compose v2 插件**（`docker compose version` 可用）。

```bash
cd /opt/cloudwatch-offline
./install.sh
```

脚本会依次：校验 SHA256 → `docker load` 导入镜像 → 生成 `.env`（数据库密码随机）→ `docker compose up -d` → 打印**初始 admin 密码**（仅首次启动输出一次）。

访问 `http://<目标机IP>`（默认 80 端口），账号 `admin`，**首次登录会强制修改密码**。

### 手动安装（等价步骤）

```bash
docker load -i cloudwatch-images.tar.gz
cp env.example .env && vi .env          # 至少修改 DB_ROOT_PASSWORD / DB_PASSWORD
docker compose up -d
docker compose logs cloudwatch-backend | grep admin     # 取初始 admin 密码
```

## 四、常用配置（`.env`）

| 变量 | 说明 |
|---|---|
| `WEB_PORT` | 对外端口，默认 80；被占用时改为如 `8080` |
| `CW_ADMIN_PASSWORD` | 指定初始 admin 密码；留空则随机生成并打印一次 |
| `CW_SEED_DEMO` | `true` 写入演示账号与演示数据（admin 密码 `CloudWatch@2026`），**仅用于 demo**；需在**首次启动前**设置，已初始化的库不会补写 |
| `DB_ROOT_PASSWORD` / `DB_PASSWORD` | 数据库密码 |
| `CW_IMAGE_TAG` | 镜像标签，默认 `latest`，也可用 `c294317` |

修改 `.env` 后执行 `docker compose up -d` 生效。

## 五、运维

```bash
docker compose ps                         # 状态
docker compose logs -f cloudwatch-backend # 日志
docker compose restart                    # 重启
docker compose down                       # 停止（保留数据）
docker compose down -v                    # 停止并删除数据库数据（不可恢复）
```

升级：下载新版本 Release 的镜像包，`docker load -i 新包` 后执行 `docker compose up -d`，数据库迁移随后端启动自动执行，数据保留在 volume `db-data`。

## 六、注意事项

- **端口**：需放行 `WEB_PORT`（默认 80）。
- **「域名配置」**：后端容器挂载了宿主机 `/etc/hosts` 与 `/var/run/docker.sock`，用于把云平台域名写入 hosts 并注入其他容器。不需要时可删除 compose 中这两行；但纳管云平台时域名解析依赖该能力（或自行在宿主机配置 hosts）。
- **网络**：后端需能访问被纳管的 OpenStack 平台（Keystone 等）；离线环境请确保与云平台网络互通。
- **HTTPS**：公网部署建议前置反向代理 / 证书。
- **目标机没有 Docker**：可在联网机器下载静态包 `https://download.docker.com/linux/static/stable/x86_64/`（`docker-xx.tgz`）与 Compose 插件（`docker-compose-linux-x86_64`，放到 `/usr/local/lib/docker/cli-plugins/docker-compose`），拷贝到目标机安装；还需系统具备 `iptables`。

## 七、重新生成镜像包（维护者）

镜像包由源码编译产物叠加到官方基础镜像上生成（无需 Docker 守护进程）：后端 `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build ./cmd/server`，前端 `npm run build`（`VITE_USE_MOCK=hybrid`），再把产物写入 `alpine:3.20` / `nginx:1.27-alpine` 基础镜像并与 `mariadb:10.11` 一起导出为 `docker save` 兼容的 tar。有 Docker 的机器也可直接：

```bash
docker compose build
docker save cloudwatch-cloudwatch-backend cloudwatch-cloudwatch-web mariadb:10.11 | gzip > cloudwatch-images.tar.gz
```

（此时镜像名为 compose 默认的 `cloudwatch-cloudwatch-*`，需在离线 compose 中相应调整 `image:`。）
