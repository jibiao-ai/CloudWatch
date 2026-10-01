package provider

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Item 单项验证结果：key 为 token 或八个组件之一。
type Item struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	Host      string `json:"host,omitempty"`
	OK        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Message   string `json:"message,omitempty"`
	Error     string `json:"error,omitempty"`
}

type TokenInfo struct {
	User      string   `json:"user"`
	Project   string   `json:"project"`
	ExpiresAt string   `json:"expiresAt"`
	Roles     []string `json:"roles"`
}

// VerifyResult 验证结论：八个组件域名的 HTTP 连通性 + Keystone 是否签发 Token。
type VerifyResult struct {
	OK     bool       `json:"ok"`
	Status string     `json:"status"` // online / warning / error
	At     time.Time  `json:"at"`
	Items  []Item     `json:"items"`
	Token  *TokenInfo `json:"token,omitempty"`
}

// Creds 一次验证 / 同步所需的接入凭据。
type Creds struct {
	RootDomain    string
	Username      string
	Password      string
	ProjectName   string
	UserDomain    string
	ProjectDomain string
	Timeout       time.Duration
	ConsoleIP     string
}

// Client 与 OpenStack 通信。BaseURL 可被测试覆盖（默认 <scheme>://<host>）。
type Client struct {
	BaseURL func(scheme, host string) string
}

func NewClient() *Client {
	return &Client{BaseURL: func(scheme, host string) string { return scheme + "://" + host }}
}

func (c *Client) http(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy:             nil, // 内网域名一律直连，不走环境代理
			DialContext:       (&net.Dialer{Timeout: timeout}).DialContext,
			TLSClientConfig:   &tls.Config{InsecureSkipVerify: true}, // 内网自签证书环境
			DisableKeepAlives: true,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func ms(t time.Time) int64 { return time.Since(t).Milliseconds() }

// probe 对 <组件>.<根域名> 做 HTTP 连通性检测：先 http，连接失败再 https。任何 HTTP 响应（含 401/404）都表示服务可达。
func (c *Client) probe(ctx context.Context, hc *http.Client, key, label, host, consoleIP string) (Item, string) {
	it := Item{Key: key, Label: label, Host: host}
	t0 := time.Now()
	ips, derr := net.DefaultResolver.LookupHost(ctx, host)
	if derr != nil {
		it.LatencyMs = ms(t0)
		it.Error = fmt.Sprintf("域名 %s 无法解析：请在「域名配置」中添加 %s %s 的映射", host, consoleIP, host)
		return it, ""
	}
	var lastErr error
	for _, scheme := range []string{"http", "https"} {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL(scheme, host)+"/", nil)
		req.Header.Set("User-Agent", "CloudWatch-Verify/1.0")
		t1 := time.Now()
		resp, err := hc.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		it.OK, it.LatencyMs = true, ms(t1)
		it.Message = fmt.Sprintf("%s 可达，HTTP %d（解析到 %s）", strings.ToUpper(scheme), resp.StatusCode, strings.Join(ips, ","))
		if consoleIP != "" && !contains(ips, consoleIP) {
			it.Message += fmt.Sprintf("；注意：与控制台 IP %s 不一致", consoleIP)
		}
		return it, scheme
	}
	it.LatencyMs = ms(t0)
	it.Error = "HTTP 连接失败：" + shortErr(lastErr)
	return it, ""
}

func contains(a []string, s string) bool {
	for _, x := range a {
		if x == s {
			return true
		}
	}
	return false
}

func shortErr(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if i := strings.Index(s, "\": "); i > 0 && strings.HasPrefix(s, "Get") {
		s = s[i+3:]
	}
	if len(s) > 300 {
		s = s[:300] + "…"
	}
	return s
}

type tokenResp struct {
	Token struct {
		ExpiresAt string                    `json:"expires_at"`
		User      struct{ Name string }     `json:"user"`
		Project   struct{ ID, Name string } `json:"project"`
		Roles     []struct{ Name string }   `json:"roles"`
		Catalog   []struct {
			Type      string `json:"type"`
			Endpoints []struct {
				Interface string `json:"interface"`
				URL       string `json:"url"`
			} `json:"endpoints"`
		} `json:"catalog"`
	} `json:"token"`
}

// Session 取得 Token 之后的会话。
type Session struct {
	Token     string
	Info      TokenInfo
	ProjectID string
	catalog   map[string]string
}

// Auth Keystone v3 密码认证（项目域 scope），返回 X-Subject-Token。
func (c *Client) Auth(ctx context.Context, hc *http.Client, scheme string, cr Creds) (*Session, error) {
	body, _ := json.Marshal(map[string]any{"auth": map[string]any{
		"identity": map[string]any{"methods": []string{"password"}, "password": map[string]any{"user": map[string]any{
			"name": cr.Username, "domain": map[string]string{"name": cr.UserDomain}, "password": cr.Password}}},
		"scope": map[string]any{"project": map[string]any{"name": cr.ProjectName, "domain": map[string]string{"name": cr.ProjectDomain}}},
	}})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL(scheme, "keystone."+cr.RootDomain)+"/v3/auth/tokens", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 Keystone 失败：%s", shortErr(err))
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("Keystone 返回 HTTP %d：%s", resp.StatusCode, upstreamMsg(raw))
	}
	tok := resp.Header.Get("X-Subject-Token")
	if tok == "" {
		return nil, fmt.Errorf("Keystone 返回 201 但响应头缺少 X-Subject-Token")
	}
	var tr tokenResp
	_ = json.Unmarshal(raw, &tr)
	s := &Session{Token: tok, ProjectID: tr.Token.Project.ID, catalog: map[string]string{}}
	s.Info = TokenInfo{User: tr.Token.User.Name, Project: tr.Token.Project.Name, ExpiresAt: tr.Token.ExpiresAt, Roles: []string{}}
	for _, r := range tr.Token.Roles {
		s.Info.Roles = append(s.Info.Roles, r.Name)
	}
	for _, svc := range tr.Token.Catalog {
		for _, ep := range svc.Endpoints {
			if ep.Interface == "public" && ep.URL != "" {
				u := strings.NewReplacer("%(tenant_id)s", tr.Token.Project.ID, "$(tenant_id)s", tr.Token.Project.ID, "%(project_id)s", tr.Token.Project.ID).Replace(ep.URL)
				s.catalog[svc.Type] = strings.TrimRight(u, "/")
			}
		}
	}
	return s, nil
}

func upstreamMsg(raw []byte) string {
	var e struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &e) == nil && e.Error.Message != "" {
		return e.Error.Message
	}
	s := strings.TrimSpace(string(raw))
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	if s == "" {
		return "（无响应内容）"
	}
	return s
}

// Verify 并发探测八个组件域名，再用 Keystone 取 Token。
func (c *Client) Verify(ctx context.Context, cr Creds) *VerifyResult {
	res := &VerifyResult{At: time.Now().UTC(), Items: []Item{}}
	hc := c.http(cr.Timeout)
	items := make([]Item, len(Components))
	schemes := make([]string, len(Components))
	var wg sync.WaitGroup
	for i, comp := range Components {
		wg.Add(1)
		go func() {
			defer wg.Done()
			items[i], schemes[i] = c.probe(ctx, hc, comp.Key, comp.Label, comp.Key+"."+cr.RootDomain, cr.ConsoleIP)
		}()
	}
	wg.Wait()

	tokenItem := Item{Key: "token", Label: "Keystone 认证 Token", Host: "keystone." + cr.RootDomain}
	if schemes[0] == "" {
		tokenItem.Error = "Keystone 域名不可达，无法获取 Token"
	} else {
		t0 := time.Now()
		sess, err := c.Auth(ctx, hc, schemes[0], cr)
		tokenItem.LatencyMs = ms(t0)
		if err != nil {
			tokenItem.Error = err.Error()
		} else {
			tokenItem.OK = true
			tokenItem.Message = fmt.Sprintf("已获取 Token（用户 %s，项目 %s）", sess.Info.User, sess.Info.Project)
			res.Token = &sess.Info
		}
	}
	res.Items = append(res.Items, tokenItem)
	res.Items = append(res.Items, items...)
	allReach := true
	for _, it := range items {
		if !it.OK {
			allReach = false
		}
	}
	switch {
	case !tokenItem.OK:
		res.Status = "error"
	case allReach:
		res.Status = "online"
	default:
		res.Status = "warning"
	}
	res.OK = res.Status == "online"
	return res
}
