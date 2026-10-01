package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/notify"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

func (s *Server) publicSettings(w http.ResponseWriter, r *http.Request) error {
	v, err := s.Settings.Public(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, v)
	return nil
}

// portalInfo 登录页品牌区：平台名称 + 纳管规模（均来自平台管理已落库的真实数据，不含 IP / 账号等敏感信息）。
func (s *Server) portalInfo(w http.ResponseWriter, r *http.Request) error {
	v, err := s.Settings.Public(r.Context())
	if err != nil {
		return err
	}
	pc, nodes, vms, zones, err := s.Providers.Store.Counts(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"platformName": v.PlatformName, "subtitle": v.Subtitle,
		"providerCount": pc, "hostCount": nodes, "vmCount": vms, "clusterCount": zones})
	return nil
}

func (s *Server) asset(w http.ResponseWriter, r *http.Request) {
	a, err := s.Settings.GetAsset(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, settings.ErrNotFound) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "error", 500)
		return
	}
	h := w.Header()
	h.Set("Content-Type", a.Mime)
	h.Set("Cache-Control", "public, max-age=31536000, immutable") // id 随内容变化，可长缓存
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox") // SVG 内脚本不执行
	_, _ = w.Write(a.Data)
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	v, err := s.Settings.Get(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, v)
	return nil
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, maxBody)
	if err != nil {
		return err
	}
	var patch settings.Patch
	if err := httpx.DecodeJSON(b, &patch); err != nil {
		return err
	}
	var generic map[string]any
	_ = httpx.DecodeJSON(b, &generic)
	all, err := s.Settings.Update(r.Context(), p.User.Username, &patch)
	s.rec(r, p, "settings", "update", "系统配置（"+strings.Join(patch.Touched(), "、")+"）", "/system/settings", generic, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, all)
	return nil
}

func (s *Server) resetSettings(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 4<<10)
	if err != nil {
		return err
	}
	var body struct {
		Group string `json:"group"`
	}
	if err := httpx.DecodeJSON(b, &body); err != nil {
		return err
	}
	all, err := s.Settings.Reset(r.Context(), p.User.Username, body.Group)
	s.rec(r, p, "settings", "update", "恢复默认（"+body.Group+"）", "/system/settings", body, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, all)
	return nil
}

// testChannel 真实发送一条测试消息。密钥优先取本次输入；未输入且渠道已保存时取库里加密保存的密钥。
func (s *Server) testChannel(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in settings.ChannelIn
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	var generic map[string]any
	_ = httpx.DecodeJSON(b, &generic)

	run := func() (string, error) {
		if in.Name == "" {
			in.Name = "测试"
		}
		if fe := settings.ValidateChannel(&in, "ch"); len(fe) > 0 {
			for _, v := range fe {
				return "", httpx.Err(400, v)
			}
		}
		secret := in.Secret
		if secret == "" && in.ID != "" && !strings.HasPrefix(in.ID, "new_") {
			if secret, err = s.Settings.ChannelSecret(r.Context(), in.ID); err != nil {
				return "", err
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		plat := "CloudWatch"
		if pub, e := s.Settings.Public(ctx); e == nil {
			plat = pub.PlatformName
		}
		msg, err := notify.Send(ctx, notify.Spec{Type: in.Type, Config: in.Config, Secret: secret}, notify.Message{
			Title: "【" + plat + "】告警渠道测试",
			Body:  fmt.Sprintf("这是一条来自 %s 的测试消息。\n触发人：%s\n时间：%s\n收到此消息说明告警渠道配置正确。", plat, p.User.Username, time.Now().Format("2006-01-02 15:04:05")),
		})
		if err != nil {
			return "", httpx.Err(400, "发送失败："+err.Error())
		}
		return msg, nil
	}
	msg, err := run()
	s.rec(r, p, "settings", "test", "告警渠道测试（"+in.Type+"："+in.Name+"）", "/system/settings", generic, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"ok": true, "message": msg})
	return nil
}
