# 运营中心 · 优化策略引擎

## 概念
- 资源类型：`vm / host / pool / disk`（虚拟机侧 = vm；物理侧 = host+pool+disk）。
- 策略 `Policy{Kind, Name, ResourceType, Enabled, WindowDays, Conds[], Scope, Advice, Builtin}`。内置策略 ID 固定英文：
  `cpu_excess mem_excess cpu_tight mem_short longoff io_pressure zombie`（虚拟机侧 7；disk_full 已于迁移 0015 删除，Swap 指标已取消）、`host_cpu host_mem pool_full orphan_disk`（物理侧 4）；自定义 `c_`+8位hex。
- 条件 `Cond{Field, Op, Value, Join}`：`AND` 优先于 `OR`；分组内全部命中才算该组命中。
- **持续型条件**：使用率类字段 + `<`/`<=`，或字段以 `Min` 结尾 → 必须 `Facts.Days[field] >= WindowDays` 才生效（避免刚开始采样就误判）；使用率类条件只对「运行中(active)」虚拟机生效。
- 评估：`Engine.evaluate()` → `(policies, map[kind][]cand, map[kind]*polDiag)`；`cand.matched` / `isIgn`（已忽略）；忽略键 `providerId/resId`。
- 汇总：`Suggest{Kind,Name,ResourceType,Enabled,Count,Hint}`；`Hint` 仅在「启用且 0 命中」时给出原因。

## 接口
`GET /api/analytics/optimize/summary` · `GET /api/analytics/optimize/list?kind=|side=vm|phys&ignored=0|1&keyword=&providerId=&page=&pageSize=` · `POST /api/analytics/optimize/ignore {kind, ignore, items:[{providerId,resId}]}` · `GET|POST /api/analytics/policies` · `PUT|DELETE /api/analytics/policies/{kind}` · `GET /api/analytics/policies/{kind}/ignores` · `GET /api/analytics/resolve` · `GET /api/analytics/export/opt`。
kind 为空时按 side 汇总全部策略，每行带 `kind / policy / key=kind|provider/res`；同一资源命中多条策略各占一行；忽略操作按行内 `kind` 分组提交。

## 「为什么这条策略没有数据」排查顺序（`noHitHint` 已内置前三项）
1. **指标未采集到**：条件里的使用率字段在所有资源上都没有值 → 平台未提供该指标（见下表）。
2. **历史未积累满**：持续型条件的最大已积累天数 < 统计周期 → 提示「已积累 X/N 天」。
3. **已评估无命中**：数据齐全但没有资源满足阈值。
4. **采集链路**：服务器到 OpenStack 管理网不通（`docker logs cloudwatch-backend` 出现「Keystone 域名…不可达」；`analytics_state.last_backfill_at` 为 NULL）→ 先修网络/VPN 路由，再等回填。
5. 数据表自查：`analytics_vm_usage`（按天累计，看 `day` 的数量）、`metric_samples`（计算节点 `node_cpu_percent/node_mem_percent`）。

| 指标 | 来源 | 可得性 |
|---|---|---|
| vCPU/内存使用率、磁盘读写速率 | Gnocchi `cpu_util / memory.util / disk.read|write.bytes.rate` | 文档内，稳定 |
| CPU 就绪占比、磁盘时延、虚机内文件系统使用率 | 候选指标名「尽力采集」(`monitor.ExtMetrics`) | 平台不提供则对应策略（vCPU紧张/IO压力）恒无结果，不误报 |
| 计算节点 CPU/内存 | 监控采集 `metric_samples` | 非持续型，立即生效 |
| 集群存储 / 孤立磁盘 | 资产快照 | 立即生效 |
