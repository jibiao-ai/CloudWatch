// Package api HTTP 路由、鉴权/权限中间件与各处理器。
package api

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/audit"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/hosts"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
	"github.com/jibiao-ai/cloudwatch/internal/retention"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

type Server struct {
	DB        *sql.DB
	Settings  *settings.Store
	Auth      *auth.Service
	Audit     *audit.Service
	Retention *retention.Job
	Hosts     *hosts.Manager
	Providers *provider.Manager
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
	mux.Handle("GET /api/tasks/{id}", s.guard("", s.taskGet))

	mux.Handle("/api/", public(func(w http.ResponseWriter, r *http.Request) error {
		return httpx.Err(404, "接口不存在："+r.Method+" "+r.URL.Path)
	}))

	return httpx.Recover(httpx.SecurityHeaders(mux))
}

func itoa(n int) string { return strconv.Itoa(n) }
