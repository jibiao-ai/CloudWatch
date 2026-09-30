package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/hosts"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	m := map[string]bool{}
	for _, x := range a {
		m[x] = true
	}
	for _, x := range b {
		if !m[x] {
			return false
		}
	}
	return true
}

func hostLinesOf(m *hosts.Mapping) []string {
	out := []string{}
	for _, l := range m.Hosts {
		out = append(out, l.IP+" "+l.Host)
	}
	return out
}

// getDomain 一次返回页面所需：映射列表、同步配置、最近一次应用结果、内置 DNS 状态。
func (s *Server) getDomain(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ms, err := s.Hosts.Store.List(r.Context())
	if err != nil {
		return err
	}
	cfg, err := s.Hosts.Store.GetSync(r.Context())
	if err != nil {
		return err
	}
	rep, err := s.Hosts.Store.GetReport(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{
		"mappings": ms, "sync": cfg, "report": rep, "dnsAddr": s.Hosts.DNSAddr(),
		"defaultComponents": hosts.DefaultComponents,
	})
	return nil
}

func (s *Server) applyNow(r *http.Request, p *auth.Principal, trigger string) *hosts.Report {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 90*time.Second)
	defer cancel()
	rep, err := s.Hosts.Apply(ctx, p.User.Username, trigger)
	if err != nil {
		return &hosts.Report{At: time.Now().UTC(), By: p.User.Username, Trigger: trigger,
			Local: hosts.Channel{Status: "failed", Message: err.Error()}}
	}
	return rep
}

func failedChannels(rep *hosts.Report) []string {
	var f []string
	if rep.Local.Status == "failed" {
		f = append(f, "本机 hosts")
	}
	if rep.DNS.Status == "failed" {
		f = append(f, "内置 DNS")
	}
	if rep.Docker.Status == "failed" {
		f = append(f, "Docker 容器")
	}
	return f
}

func (s *Server) saveMapping(update bool) authed {
	return func(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
		t0 := time.Now()
		b, err := httpx.ReadBody(r, 64<<10)
		if err != nil {
			return err
		}
		var in hosts.Input
		if err := httpx.DecodeJSON(b, &in); err != nil {
			return err
		}
		var generic map[string]any
		_ = httpx.DecodeJSON(b, &generic)
		var m *hosts.Mapping
		action := "create"
		if update {
			action = "update"
			m, err = s.Hosts.Store.Update(r.Context(), p.User.Username, r.PathValue("id"), in)
		} else {
			m, err = s.Hosts.Store.Create(r.Context(), p.User.Username, in)
		}
		target := "域名映射 " + in.RootDomain
		if m != nil {
			target = "域名映射 " + m.RootDomain + "（" + strings.Join(hostLinesOf(m), "；") + "）"
		}
		s.rec(r, p, "domain", action, target, "/system/domain", generic, err, t0)
		if err != nil {
			return err
		}
		rep := s.applyNow(r, p, action)
		full, _ := s.Hosts.Store.Get(r.Context(), m.ID)
		if full != nil {
			m = full
		}
		httpx.OK(w, map[string]any{"mapping": m, "report": rep})
		return nil
	}
}

func (s *Server) deleteMapping(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	m, err := s.Hosts.Store.Delete(r.Context(), r.PathValue("id"))
	target := "域名映射 " + r.PathValue("id")
	if m != nil {
		target = "域名映射 " + m.RootDomain + "（移除 " + strings.Join(hostLinesOf(m), "；") + "）"
	}
	s.rec(r, p, "domain", "delete", target, "/system/domain", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"report": s.applyNow(r, p, "delete")})
	return nil
}

func (s *Server) putSync(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in hosts.Sync
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	var generic map[string]any
	_ = httpx.DecodeJSON(b, &generic)
	saved, err := s.Hosts.Store.PutSync(r.Context(), in)
	s.rec(r, p, "domain", "update", "域名同步方式（本机 hosts / 内置 DNS / Docker 容器）", "/system/domain", generic, err, t0)
	if err != nil {
		return err
	}
	rep := s.applyNow(r, p, "sync-config")
	httpx.OK(w, map[string]any{"sync": saved, "report": rep, "dnsAddr": s.Hosts.DNSAddr()})
	return nil
}

func (s *Server) postApply(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	rep := s.applyNow(r, p, "manual")
	var aerr error
	if f := failedChannels(rep); len(f) > 0 {
		aerr = httpx.Err(500, "同步失败："+strings.Join(f, "、"))
	}
	s.rec(r, p, "domain", "sync", "立即同步域名（"+itoa(rep.Lines)+" 条记录）", "/system/domain", nil, aerr, t0)
	httpx.OK(w, map[string]any{"report": rep, "dnsAddr": s.Hosts.DNSAddr()})
	return nil
}

func (s *Server) verifyMapping(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	res, err := s.Hosts.Verify(ctx, r.PathValue("id"))
	var verr error = err
	if err == nil && !res.OK {
		verr = httpx.Err(200, "校验未通过")
	}
	s.rec(r, p, "domain", "verify", "校验域名映射 "+r.PathValue("id"), "/system/domain", nil, verr, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, res)
	return nil
}
