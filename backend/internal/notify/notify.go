// Package notify 真实发送告警通知：邮件（SMTP：465 隐式 TLS / 587·25 STARTTLS / 明文）与 Webhook
// （企业微信 / 钉钉 / 飞书 / 通用 JSON，支持签名密钥）。「发送测试消息」与后续告警外发共用同一实现。
package notify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Message struct {
	Title string
	Body  string
}

// Spec 发送所需的完整信息（Secret 为明文，仅在内存里存在）。
type Spec struct {
	Type   string
	Config map[string]any
	Secret string
}

func str(m map[string]any, k string) string { v, _ := m[k].(string); return strings.TrimSpace(v) }
func num(m map[string]any, k string) int {
	switch n := m[k].(type) {
	case float64:
		return int(n)
	case int:
		return n
	case string:
		x, _ := strconv.Atoi(strings.TrimSpace(n))
		return x
	}
	return 0
}

// Send 发送一条消息；返回人类可读的结果说明，失败返回带原因的 error。
func Send(ctx context.Context, sp Spec, m Message) (string, error) {
	switch sp.Type {
	case "email":
		return sendEmail(ctx, sp, m)
	case "webhook":
		return sendWebhook(ctx, sp, m)
	}
	return "", errors.New("不支持的渠道类型")
}

/* ------------------------------- SMTP ------------------------------- */

func sendEmail(ctx context.Context, sp Spec, m Message) (string, error) {
	host, port := str(sp.Config, "host"), num(sp.Config, "port")
	user := str(sp.Config, "username")
	var to []string
	for _, x := range strings.FieldsFunc(str(sp.Config, "to"), func(r rune) bool { return r == ',' || r == ';' }) {
		if x = strings.TrimSpace(x); x != "" {
			to = append(to, x)
		}
	}
	if host == "" || port <= 0 {
		return "", errors.New("SMTP 服务器或端口未配置")
	}
	if len(to) == 0 {
		return "", errors.New("未配置收件人")
	}
	from := user
	if from == "" {
		from = "cloudwatch@" + host
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	dl, ok := ctx.Deadline()
	if !ok {
		dl = time.Now().Add(15 * time.Second)
	}
	d := net.Dialer{Deadline: dl}
	tlsCfg := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}

	var conn net.Conn
	var err error
	if port == 465 {
		conn, err = tls.DialWithDialer(&d, "tcp", addr, tlsCfg)
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return "", fmt.Errorf("连接 SMTP 服务器失败：%s", cleanErr(err))
	}
	_ = conn.SetDeadline(dl)
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return "", fmt.Errorf("SMTP 握手失败：%s", cleanErr(err))
	}
	defer c.Close()

	secure := port == 465
	if !secure {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(tlsCfg); err != nil {
				return "", fmt.Errorf("STARTTLS 协商失败：%s", cleanErr(err))
			}
			secure = true
		}
	}
	if sp.Secret != "" || user != "" {
		ok, mechs := c.Extension("AUTH")
		if !ok {
			if sp.Secret != "" {
				return "", errors.New("SMTP 服务器不支持认证，但已配置授权码")
			}
		} else {
			if !secure {
				return "", errors.New("服务器未启用 TLS，出于安全考虑不会以明文发送账号密码")
			}
			var au smtp.Auth
			if strings.Contains(strings.ToUpper(mechs), "PLAIN") {
				au = smtp.PlainAuth("", user, sp.Secret, host)
			} else {
				au = loginAuth{user, sp.Secret, host}
			}
			if err := c.Auth(au); err != nil {
				return "", fmt.Errorf("SMTP 认证失败：%s", cleanErr(err))
			}
		}
	}
	if err := c.Mail(from); err != nil {
		return "", fmt.Errorf("发件人被拒绝：%s", cleanErr(err))
	}
	for _, r := range to {
		if err := c.Rcpt(r); err != nil {
			return "", fmt.Errorf("收件人 %s 被拒绝：%s", r, cleanErr(err))
		}
	}
	w, err := c.Data()
	if err != nil {
		return "", fmt.Errorf("发送失败：%s", cleanErr(err))
	}
	if _, err := w.Write(buildMIME(from, to, m)); err != nil {
		return "", fmt.Errorf("发送失败：%s", cleanErr(err))
	}
	if err := w.Close(); err != nil {
		return "", fmt.Errorf("发送失败：%s", cleanErr(err))
	}
	_ = c.Quit()
	return fmt.Sprintf("测试邮件已发送至 %s", strings.Join(to, "、")), nil
}

func buildMIME(from string, to []string, m Message) []byte {
	var b bytes.Buffer
	enc := func(s string) string { return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?=" }
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + strings.Join(to, ", ") + "\r\n")
	b.WriteString("Subject: " + enc(clean(m.Title)) + "\r\n")
	b.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
	body := base64.StdEncoding.EncodeToString([]byte(m.Body))
	for len(body) > 76 {
		b.WriteString(body[:76] + "\r\n")
		body = body[76:]
	}
	b.WriteString(body + "\r\n")
	return b.Bytes()
}

// clean 去掉头部注入用的换行。
func clean(s string) string { return strings.NewReplacer("\r", " ", "\n", " ").Replace(s) }

func cleanErr(err error) string {
	s := err.Error()
	if i := strings.LastIndex(s, ": "); i >= 0 && strings.Contains(s[:i], "dial tcp") {
		return s[i+2:] + "（" + s[:i] + "）"
	}
	return s
}

// loginAuth 实现 AUTH LOGIN（国内邮箱 163/QQ/企业邮箱常用）。
type loginAuth struct{ user, pass, host string }

func (a loginAuth) Start(si *smtp.ServerInfo) (string, []byte, error) {
	return "LOGIN", nil, nil
}
func (a loginAuth) Next(from []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(from))) {
	case "username:":
		return []byte(a.user), nil
	case "password:":
		return []byte(a.pass), nil
	}
	return nil, errors.New("未知的 AUTH LOGIN 挑战")
}

/* ------------------------------ Webhook ------------------------------ */

func sendWebhook(ctx context.Context, sp Spec, m Message) (string, error) {
	raw := str(sp.Config, "url")
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", errors.New("Webhook 地址不合法")
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && (ip.IsLinkLocalUnicast() || ip.IsUnspecified()) {
		return "", errors.New("不允许访问链路本地 / 未指定地址")
	}
	text := m.Title + "\n" + m.Body
	host := strings.ToLower(u.Hostname())
	headers := map[string]string{"Content-Type": "application/json; charset=utf-8"}
	var payload any
	kind := "通用 Webhook"

	switch {
	case strings.Contains(host, "qyapi.weixin.qq.com") || strings.Contains(u.Path, "/cgi-bin/webhook/send"):
		kind = "企业微信"
		payload = map[string]any{"msgtype": "text", "text": map[string]string{"content": text}}
	case strings.Contains(host, "oapi.dingtalk.com"):
		kind = "钉钉"
		if sp.Secret != "" { // 加签：timestamp + "\n" + secret 的 HMAC-SHA256
			ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
			mac := hmac.New(sha256.New, []byte(sp.Secret))
			mac.Write([]byte(ts + "\n" + sp.Secret))
			q := u.Query()
			q.Set("timestamp", ts)
			q.Set("sign", base64.StdEncoding.EncodeToString(mac.Sum(nil)))
			u.RawQuery = q.Encode()
		}
		payload = map[string]any{"msgtype": "text", "text": map[string]string{"content": text}}
	case strings.Contains(host, "open.feishu.cn") || strings.Contains(host, "larksuite.com"):
		kind = "飞书"
		p := map[string]any{"msg_type": "text", "content": map[string]string{"text": text}}
		if sp.Secret != "" {
			ts := strconv.FormatInt(time.Now().Unix(), 10)
			mac := hmac.New(sha256.New, []byte(ts+"\n"+sp.Secret))
			p["timestamp"] = ts
			p["sign"] = base64.StdEncoding.EncodeToString(mac.Sum(nil))
		}
		payload = p
	default:
		payload = map[string]any{"title": m.Title, "content": m.Body, "text": text, "source": "CloudWatch", "time": time.Now().UTC().Format(time.RFC3339)}
	}
	body, _ := json.Marshal(payload)
	if kind == "通用 Webhook" && sp.Secret != "" {
		ts := strconv.FormatInt(time.Now().Unix(), 10)
		mac := hmac.New(sha256.New, []byte(sp.Secret))
		mac.Write([]byte(ts + "." + string(body)))
		headers["X-CloudWatch-Timestamp"] = ts
		headers["X-CloudWatch-Signature"] = "sha256=" + hexEnc(mac.Sum(nil))
	}

	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(body))
	if err != nil {
		return "", errors.New("Webhook 地址不合法")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	cli := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := cli.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求 Webhook 失败：%s", cleanErr(err))
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("Webhook 返回 HTTP %d：%s", resp.StatusCode, snippet(rb))
	}
	// 企业微信 / 钉钉 / 飞书：HTTP 200 但业务码非 0 也算失败
	var biz struct {
		Errcode *int   `json:"errcode"`
		Errmsg  string `json:"errmsg"`
		Code    *int   `json:"code"`
		Msg     string `json:"msg"`
	}
	if json.Unmarshal(rb, &biz) == nil {
		if biz.Errcode != nil && *biz.Errcode != 0 {
			return "", fmt.Errorf("%s 返回错误 %d：%s", kind, *biz.Errcode, biz.Errmsg)
		}
		if biz.Code != nil && *biz.Code != 0 {
			return "", fmt.Errorf("%s 返回错误 %d：%s", kind, *biz.Code, biz.Msg)
		}
	}
	return fmt.Sprintf("测试消息已发送（%s，HTTP %d）", kind, resp.StatusCode), nil
}

func hexEnc(b []byte) string {
	const h = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2], out[i*2+1] = h[v>>4], h[v&15]
	}
	return string(out)
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 160 {
		s = s[:160] + "…"
	}
	if s == "" {
		return "(空响应)"
	}
	return s
}
