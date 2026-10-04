// Package api HTTP 路由、鉴权/权限中间件与各处理器。
package api

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/audit"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/hosts"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/inspection"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
	"github.com/jibiao-ai/cloudwatch/internal/retention"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

type Server struct {
	DB         *sql.DB
	Settings   *settings.Store
	Auth       *auth.Service
	Audit      *audit.Service
	Retention  *retention.Job
	Hosts      *hosts.Manager
	Providers  *provider.Manager
	Monitor    *monitor.Manager
	Capacity   *capacity.Manager
	Analytics  *analytics.Engine
	Inspection *inspection.Manager
}

const maxBody = 8 << 20 // 设置里可能带 Logo / 背景图（base64），放宽到 8MB

type authed func(w http.ResponseWriter, r *http.Request, p *auth.Principal) error

// guard 鉴权 + 权限码校验。need 为空表示只要登录即可。
// 强制改密状态下只放行 /auth/me、/auth/change-password、/auth/logout。
func (s *Server) guard(need string, h authed) http.Handler {
	return httpx.Wrap(func(w http.ResponseWriter, r *http.Request) error {
		tok := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
		p, err := s.Auth.Authenticate(r.Context(), tok)
		if err != nil {
			return err
		}
		if p.User.MustChangePassword {
			switch r.URL.Path {
			case "/api/auth/me", "/api/auth/change-password", "/api/auth/logout":
			default:
				return httpx.ErrData(403, 40301, "请先修改初始/过期密码", map[string]any{"mustChangePassword": true})
			}
		}
		if need != "" && !p.Can(need) {
			return httpx.Err(403, "缺少权限："+need)
		}
		return h(w, r, p)
	})
}

func public(h httpx.Handler) http.Handler { return httpx.Wrap(h) }

// rec 写审计（失败不影响主流程）。
func (s *Server) rec(r *http.Request, p *auth.Principal, module, action, target, link string, body any, err error, t0 time.Time) {
	e := audit.Entry{
		IP: httpx.ClientIP(r), Module: module, Action: action, Target: target, TargetLink: link,
		Err: err, Duration: time.Since(t0), Method: r.Method, Path: r.URL.Path, Body: body,
	}
	if p != nil {
		e.Operator, e.OperatorName = p.User.Username, p.User.Name
	}
	s.Audit.Record(r.Context(), e)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /healthz", public(func(w http.ResponseWriter, r *http.Request) error {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := s.DB.PingContext(ctx); err != nil {
			return httpx.Err(503, "数据库不可用")
		}
		httpx.OK(w, map[string]any{"status": "ok"})
		return nil
	}))

	// 公开
	mux.Handle("GET /api/settings/public", public(s.publicSettings))
	mux.Handle("GET /api/public/portal-info", public(s.portalInfo))
	mux.Handle("GET /api/assets/{id}", http.HandlerFunc(s.asset))
	mux.Handle("GET /api/auth/captcha", public(s.captcha))
	mux.Handle("POST /api/auth/login", public(s.login))
	mux.Handle("POST /api/auth/refresh", public(s.refresh))

	// 登录后
	mux.Handle("POST /api/auth/logout", s.guard("", s.logout))
	mux.Handle("GET /api/auth/me", s.guard("", s.me))
	mux.Handle("POST /api/auth/change-password", s.guard("", s.changePassword))
	mux.Handle("GET /api/alerts/unread-count", s.guard("", s.unreadAlerts))
	mux.Handle("GET /api/dashboard/overview", s.guard("dashboard:view", s.dashboardOverview))
	mux.Handle("GET /api/dashboard/trend", s.guard("monitor:view", s.dashboardTrend))
	mux.Handle("GET /api/search", s.guard("", s.searchGlobal)) // 全局搜索：按各分组权限过滤结果

	// 系统配置
	mux.Handle("GET /api/settings", s.guard("settings:view", s.getSettings))
	mux.Handle("PUT /api/settings", s.guard("settings:update", s.putSettings))
	mux.Handle("POST /api/settings/reset", s.guard("settings:update", s.resetSettings))
	mux.Handle("POST /api/settings/alert-channels/test", s.guard("settings:update", s.testChannel))

	// 审计日志
	mux.Handle("GET /api/audit-logs", s.guard("audit:view", s.auditList))
	mux.Handle("GET /api/audit-logs/export", s.guard("audit:export", s.auditExport))
	mux.Handle("GET /api/audit-logs/{id}", s.guard("audit:view", s.auditGet))
	mux.Handle("POST /api/audit-logs/clean", s.guard("audit:clean", s.auditClean))

	// 域名配置
	mux.Handle("GET /api/domain-config", s.guard("domain:view", s.getDomain))
	mux.Handle("POST /api/domain-config/mappings", s.guard("domain:update", s.saveMapping(false)))
	mux.Handle("PUT /api/domain-config/mappings/{id}", s.guard("domain:update", s.saveMapping(true)))
	mux.Handle("DELETE /api/domain-config/mappings/{id}", s.guard("domain:update", s.deleteMapping))
	mux.Handle("POST /api/domain-config/mappings/{id}/verify", s.guard("domain:verify", s.verifyMapping))
	mux.Handle("PUT /api/domain-config/sync", s.guard("domain:update", s.putSync))
	mux.Handle("POST /api/domain-config/apply", s.guard("domain:update", s.postApply))

	// 平台管理
	mux.Handle("GET /api/providers", s.guard("provider:view", s.providerList))
	mux.Handle("GET /api/providers/export", s.guard("provider:export", s.providerExport))
	mux.Handle("POST /api/providers/verify", s.guard("provider:verify", s.providerVerify))
	mux.Handle("POST /api/providers", s.guard("provider:create", s.providerSave(false)))
	mux.Handle("GET /api/providers/{id}", s.guard("provider:view", s.providerGet))
	mux.Handle("PUT /api/providers/{id}", s.guard("provider:update", s.providerSave(true)))
	mux.Handle("DELETE /api/providers/{id}", s.guard("provider:delete", s.providerDelete))
	mux.Handle("GET /api/providers/{id}/impact", s.guard("provider:view", s.providerImpact))
	mux.Handle("PUT /api/providers/{id}/write-switch", s.guard("provider:write_switch", s.providerWriteSwitch))
	mux.Handle("POST /api/providers/{id}/sync", s.guard("provider:sync", s.providerSync))
	// 配置中心（对接接口文档第 6 章）
	mux.Handle("GET /api/capacity/overview", s.guard("capacity:view", s.capacityOverview))
	mux.Handle("POST /api/capacity/collect", s.guard("capacity:collect", s.capacityCollect))
	mux.Handle("GET /api/capacity/{kind}", s.guard("capacity:view", s.capacityList))
	mux.Handle("GET /api/capacity/{kind}/export", s.guard("capacity:export", s.capacityExport))
	mux.Handle("GET /api/capacity/{kind}/{providerId}/{id}", s.guard("capacity:view", s.capacityDetail))
	// 资源拓扑（聚合 平台管理 / 配置中心 / 监控中心 / 告警中心 已落库数据）
	// 自动巡检
	mux.Handle("GET /api/inspection/reports", s.guard("inspection:view", s.inspectionList))
	mux.Handle("GET /api/inspection/reports/{id}", s.guard("inspection:view", s.inspectionGet))
	mux.Handle("GET /api/inspection/reports/{id}/export", s.guard("inspection:export", s.inspectionExport))
	mux.Handle("DELETE /api/inspection/reports/{id}", s.guard("inspection:delete", s.inspectionDelete))
	mux.Handle("POST /api/inspection/run", s.guard("inspection:run", s.inspectionRun))
	mux.Handle("GET /api/inspection/tasks/{id}", s.guard("inspection:view", s.inspectionTask))
	mux.Handle("GET /api/inspection/config", s.guard("inspection:view", s.inspectionConfig))
	mux.Handle("PUT /api/inspection/config", s.guard("inspection:config", s.inspectionSaveConfig))
	mux.Handle("GET /api/analytics/overview", s.guard("analytics:view", s.analyticsOverview))
	mux.Handle("GET /api/analytics/trend", s.guard("analytics:view", s.analyticsTrend))
	mux.Handle("GET /api/analytics/base", s.guard("analytics:view", s.analyticsBase))
	mux.Handle("GET /api/analytics/base/bands", s.guard("analytics:view", s.analyticsBaseBands))
	mux.Handle("GET /api/analytics/vm", s.guard("analytics:view", s.analyticsVM))
	mux.Handle("GET /api/analytics/vm/bands", s.guard("analytics:view", s.analyticsVMBands))
	mux.Handle("GET /api/analytics/disk", s.guard("analytics:view", s.analyticsDisk))
	mux.Handle("GET /api/analytics/export/{kind}", s.guard("analytics:export", s.analyticsExport))
	mux.Handle("GET /api/analytics/optimize/summary", s.guard("analytics:view", s.analyticsOptSummary))
	mux.Handle("GET /api/analytics/optimize/list", s.guard("analytics:view", s.analyticsOptList))
	mux.Handle("POST /api/analytics/optimize/ignore", s.guard("analytics:ignore", s.analyticsIgnore))
	mux.Handle("GET /api/analytics/policies", s.guard("analytics:view", s.analyticsPolicies))
	mux.Handle("GET /api/analytics/resolve", s.guard("analytics:view", s.analyticsResolve))
	mux.Handle("GET /api/analytics/policies/{kind}/ignores", s.guard("analytics:view", s.analyticsPolicyIgnores))
	mux.Handle("POST /api/analytics/policies", s.guard("analytics:policy_update", s.analyticsPolicyCreate))
	mux.Handle("PUT /api/analytics/policies/{kind}", s.guard("analytics:policy_update", s.analyticsPolicyUpdate))
	mux.Handle("DELETE /api/analytics/policies/{kind}", s.guard("analytics:policy_update", s.analyticsPolicyDelete))
	mux.Handle("GET /api/topology/overview", s.guard("topology:view", s.topologyOverview))
	mux.Handle("GET /api/topology/{providerId}", s.guard("topology:view", s.topologyGraph))
	// 监控中心
	mux.Handle("GET /api/monitor/overview", s.guard("monitor:view", s.monitorOverview))
	mux.Handle("GET /api/monitor/{id}", s.guard("monitor:view", s.monitorSnapshot))
	mux.Handle("GET /api/monitor/{id}/hosts", s.guard("monitor:view", s.monitorHosts))
	mux.Handle("GET /api/monitor/{id}/pools", s.guard("monitor:view", s.monitorPools))
	mux.Handle("GET /api/monitor/{id}/vm-usage", s.guard("monitor:view", s.monitorVMUsage))
	mux.Handle("GET /api/monitor/{id}/trend", s.guard("monitor:view", s.monitorTrend))
	mux.Handle("GET /api/monitor/{id}/vms/{vmId}/metrics", s.guard("monitor:view", s.monitorVMMetrics))
	mux.Handle("POST /api/monitor/export-log", s.guard("monitor:export", s.monitorExportLog))
	mux.Handle("POST /api/monitor/{id}/collect", s.guard("monitor:collect", s.monitorCollect))

	// 告警中心
	mux.Handle("GET /api/alerts", s.guard("alert:view", s.alertList))
	mux.Handle("GET /api/alerts/stats", s.guard("alert:view", s.alertStats))
	mux.Handle("GET /api/alerts/export", s.guard("alert:export", s.alertExport))
	mux.Handle("POST /api/alerts/ack", s.guard("alert:ack", s.alertAck))
	mux.Handle("POST /api/alerts/sync", s.guard("alert:sync", s.alertSync))
	mux.Handle("GET /api/alerts/{id}", s.guard("alert:view", s.alertGet))
	mux.Handle("GET /api/alerts/{id}/related", s.guard("alert:view", s.alertRelated))

	mux.Handle("GET /api/tasks/{id}", s.guard("", s.taskGet))

	mux.Handle("/api/", public(func(w http.ResponseWriter, r *http.Request) error {
		return httpx.Err(404, "接口不存在："+r.Method+" "+r.URL.Path)
	}))

	return httpx.Recover(httpx.SecurityHeaders(mux))
}

func itoa(n int) string { return strconv.Itoa(n) }
