#!/usr/bin/env bash
# CloudWatch 离线安装脚本：导入镜像 -> 生成 .env -> 启动
# 用法：./install.sh [镜像包路径，默认 ./CloudWatch-7.1-x86.tar.gz]
set -euo pipefail
cd "$(dirname "$0")"
PKG="${1:-./CloudWatch-7.1-x86.tar.gz}"

command -v docker >/dev/null || { echo "未检测到 docker，请先安装 Docker（离线安装见 README）"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "未检测到 docker compose 插件（需要 Compose v2）"; exit 1; }
[ -f "$PKG" ] || { echo "找不到镜像包：$PKG"; exit 1; }

if [ -f SHA256SUMS ]; then
  echo ">> 校验镜像包完整性..."
  want=$(awk -v f="$(basename "$PKG")" '$2==f || $2=="*"f {print $1}' SHA256SUMS)
  if [ -n "$want" ]; then
    got=$(sha256sum "$PKG" | awk '{print $1}')
    [ "$want" = "$got" ] || { echo "校验失败（期望 $want，实际 $got），文件可能损坏，请重新传输"; exit 1; }
    echo "   校验通过"
  fi
fi

echo ">> 导入镜像（约需 1 分钟）..."
docker load -i "$PKG"

if [ ! -f .env ]; then
  cp env.example .env
  rnd() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20; }
  sed -i "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$(rnd)|; s|^DB_PASSWORD=.*|DB_PASSWORD=$(rnd)|" .env
  echo ">> 已生成 .env（数据库密码已随机生成）。如需修改端口 / 管理员密码 / 演示数据，请编辑 .env 后重新执行 docker compose up -d"
fi

echo ">> 启动服务..."
docker compose up -d
echo
docker compose ps
echo
PORT=$(grep -E '^WEB_PORT=' .env | cut -d= -f2); PORT=${PORT:-80}
echo "访问：http://<本机IP>:${PORT}    账号：admin"
if ! grep -qE '^CW_ADMIN_PASSWORD=.+' .env; then
  echo "初始 admin 密码（仅首次启动打印）："; sleep 5
  docker compose logs cloudwatch-backend 2>&1 | grep -i admin | head -3 || true
fi
