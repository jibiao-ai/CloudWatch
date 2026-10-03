# 后端范式

```go
// 注册
mux.Handle("GET /api/analytics/optimize/list", s.guard("analytics:view", s.analyticsOptList))
// handler
func (s *Server) x(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
    ps, err := s.plats(r); if err != nil { return err }
    ...
    httpx.OK(w, out); return nil
}
```
- 错误：`httpx.Err(404,"策略不存在")`；业务错误映射集中在 `policyErr(err)`。
- 审计：写操作与导出都调用 `s.rec(r, p, module, action, target, link, body, err, t0)`；`link` 指向前端页面（如 `/analytics?tab=optimize&kind=…`）。
- 导出：excelize 生成 xlsx，最多 50000 行；列定义放在领域包（如 `analytics.OptCols`）；导出参数 = 当前筛选条件。
- 查询参数：`anQuery(r)` 统一解析 `kind/side/ignored/keyword/field/providerId/page/pageSize/sortKey/sortOrder`。
- 数据库：`database/sql` 参数化查询；时间统一 UTC 存储，按天汇总用东八区 `analytics.CST`。
- 迁移文件示例命名：`0013_analytics_policies_v3.sql`；内置数据用 `INSERT … ON DUPLICATE KEY` 或先删后写，保证可重复执行。
- 采集：`monitor.Sampler` 定时采样写 `metric_samples`；`analytics` 采样器按日累计写 `analytics_vm_usage`；首次及每 7 天从 Gnocchi 回填 30 天历史（`INSERT IGNORE`）。
- 测试：纯函数优先（`Policy.Eval`、`noHitHint`、`matchAny`、`Paginate`），表驱动。
