# 部署与远程验证

目标服务器：`110.42.103.186`（root）。**密码不入库、不写文档**；交付后提醒用户修改 root 密码。远程无 git / go / jq，但有 python3 与 curl。

```bash
# 1 打包（只含已提交内容）
cd /home/user/webapp && git archive HEAD | gzip > /tmp/cw/cloudwatch.tar.gz
# 2 上传并构建（密码经环境变量 SSHPASS 传入）
export SSHPASS='***'
sshpass -e scp -o StrictHostKeyChecking=accept-new /tmp/cw/cloudwatch.tar.gz root@110.42.103.186:/tmp/
sshpass -e ssh root@110.42.103.186 'cd /opt/cloudwatch && tar xzf /tmp/cloudwatch.tar.gz && docker compose up -d --build && rm -f /tmp/cloudwatch.tar.gz'
```
## 远程验证清单
- `docker ps`：backend/db/web 三个容器 Up。
- `curl -s http://127.0.0.1:3000/api/public/portal-info` → 200；未登录 `GET /api/analytics/overview` → 401。
- 前端新版本：`docker exec cloudwatch-web sh -c "grep -l '<本轮新增的ASCII标识>' /usr/share/nginx/html/assets/*.js"`。
- `docker logs cloudwatch-backend --tail 50`：迁移已执行、无 panic。
- 查库：`docker exec cloudwatch-db sh -c 'mysql -ucloudwatch -p"$MARIADB_PASSWORD" --default-character-set=utf8mb4 cloudwatch -e "…"'`。
- 用户侧：浏览器 **Ctrl+F5** 强制刷新。

## 本地开发
- 后端：`export PATH=$PATH:/usr/local/go/bin; cd backend && go build -o bin/cloudwatch-api ./cmd/server && pm2 restart cloudwatch-api`（:8080）。
- 前端：`cd frontend && npm run build && pm2 restart cloudwatch-web`（:3000）。
- 本地无真实 OpenStack 时：用假 OpenStack 服务（监听 80，hosts 把 `*.openstack.svc.local` 指向 127.0.0.1）+ 种子数据做 e2e；结束后删除平台、清理分析表、恢复 `/etc/hosts`。

## 常见故障
| 现象 | 原因 / 处理 |
|---|---|
| 页面仍是旧版 | 浏览器缓存 → Ctrl+F5；确认 web 容器资源哈希已更新 |
| 优化建议全为 0 | 见 `analytics-policy-engine.md` 排查顺序 |
| 回填一直失败 | 服务器 → OpenStack 管理网不通（路由/VPN），属网络问题，非代码问题 |
| `git push` 认证失败 | 重新配置 GitHub 凭据后再推送 |
