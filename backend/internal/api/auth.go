package api

import (
	"net/http"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/audit"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

func (s *Server) captcha(w http.ResponseWriter, r *http.Request) error {
	id, img := s.Auth.NewCaptcha()
	httpx.OK(w, map[string]any{"id": id, "image": img})
	return nil
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var req auth.LoginReq
	if err := httpx.DecodeJSON(b, &req); err != nil {
		return err
	}
	tk, u, err := s.Auth.Login(r.Context(), req, httpx.ClientIP(r), r.UserAgent())
	// 审计：只记账号，不记密码（Mask 会兜底）
	e := audit.Entry{IP: httpx.ClientIP(r), Module: "auth", Action: "login", Target: req.Username, Err: err,
		Duration: time.Since(t0), Method: r.Method, Path: r.URL.Path, Body: map[string]any{"username": req.Username}, Operator: req.Username}
	if u != nil {
		e.OperatorName = u.Name
	}
	s.Audit.Record(r.Context(), e)
	if err != nil {
		return err
	}
	httpx.OK(w, tk)
	return nil
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) error {
	b, err := httpx.ReadBody(r, 16<<10)
	if err != nil {
		return err
	}
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := httpx.DecodeJSON(b, &body); err != nil {
		return err
	}
	tk, err := s.Auth.Refresh(r.Context(), body.RefreshToken)
	if err != nil {
		return err
	}
	httpx.OK(w, tk)
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	s.Auth.Logout(r.Context(), p.SessionID)
	s.rec(r, p, "auth", "logout", p.User.Username, "", nil, nil, t0)
	httpx.OK(w, nil)
	return nil
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	m, err := s.Auth.Me(r.Context(), p)
	if err != nil {
		return err
	}
	httpx.OK(w, m)
	return nil
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 16<<10)
	if err != nil {
		return err
	}
	var body struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if err := httpx.DecodeJSON(b, &body); err != nil {
		return err
	}
	err = s.Auth.ChangePassword(r.Context(), p, body.OldPassword, body.NewPassword)
	s.rec(r, p, "auth", "update", p.User.Username+"（修改密码）", "", body, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, nil)
	return nil
}

func (s *Server) unreadAlerts(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	var n int
	if err := s.DB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM alert_events WHERE status='firing' AND acked=0`).Scan(&n); err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"count": n})
	return nil
}
