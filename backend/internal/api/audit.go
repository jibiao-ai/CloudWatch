package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/audit"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

func (s *Server) auditList(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	q := audit.ParseQuery(r.URL.Query().Get)
	pg, err := s.Audit.List(r.Context(), q)
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

func (s *Server) auditGet(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	l, err := s.Audit.Get(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		return httpx.Err(404, "日志不存在")
	}
	if err != nil {
		return err
	}
	httpx.OK(w, l)
	return nil
}

func (s *Server) auditExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	q := audit.ParseQuery(r.URL.Query().Get)
	data, n, err := s.Audit.Export(r.Context(), q)
	s.rec(r, p, "audit", "export", fmt.Sprintf("导出审计日志（%d 条）", n), "", nil, err, t0)
	if err != nil {
		return err
	}
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	h.Set("Content-Disposition", `attachment; filename="audit-logs.xlsx"`)
	_, _ = w.Write(data)
	return nil
}

func (s *Server) auditClean(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 4<<10)
	if err != nil {
		return err
	}
	var body struct {
		BeforeDays int `json:"beforeDays"`
	}
	if err := httpx.DecodeJSON(b, &body); err != nil {
		return err
	}
	if body.BeforeDays < 1 || body.BeforeDays > 3650 {
		return httpx.Err(400, "beforeDays 需在 1~3650 之间")
	}
	n, err := s.Audit.Clean(r.Context(), body.BeforeDays)
	s.rec(r, p, "audit", "clean", fmt.Sprintf("清理 %d 天前日志（%d 条）", body.BeforeDays, n), "", body, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"removed": n})
	return nil
}
