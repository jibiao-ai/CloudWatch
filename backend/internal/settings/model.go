// Package settings 实现「系统配置」五个分组：基础信息 / 品牌 / 安全策略 / 数据保留 / 告警渠道。
// 全部入库（settings 表存 JSON，告警渠道独立建表且密钥 AES-GCM 加密），并在服务端做与前端一致的校验。
package settings

import (
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

type Basic struct {
	PlatformName string `json:"platformName"`
	Subtitle     string `json:"subtitle"`
	Copyright    string `json:"copyright"`
	SupportEmail string `json:"supportEmail"`
}

type Brand struct {
	LogoURL      string `json:"logoUrl"`
	LoginBgURL   string `json:"loginBgUrl"`
	PrimaryColor string `json:"primaryColor"`
}

type Security struct {
	MinLength         int  `json:"minLength"`
	RequireUpper      bool `json:"requireUpper"`
	RequireLower      bool `json:"requireLower"`
	RequireDigit      bool `json:"requireDigit"`
	RequireSpecial    bool `json:"requireSpecial"`
	ExpireDays        int  `json:"expireDays"`
	SessionTimeoutMin int  `json:"sessionTimeoutMin"`
	MaxSessions       int  `json:"maxSessions"`
	CaptchaEnabled    bool `json:"captchaEnabled"`
	LockThreshold     int  `json:"lockThreshold"`
	LockMinutes       int  `json:"lockMinutes"`
}

type Retention struct {
	AuditDays      int `json:"auditDays"`
	MetricDays     int `json:"metricDays"`
	InspectionDays int `json:"inspectionDays"`
	AlertDays      int `json:"alertDays"`
}

// ChannelIn 前端提交的渠道；Secret 为空表示沿用已保存密钥。
type ChannelIn struct {
	ID      string         `json:"id"`
	Type    string         `json:"type"`
	Name    string         `json:"name"`
	Enabled bool           `json:"enabled"`
	Config  map[string]any `json:"config"`
	Secret  string         `json:"secret"`
}

// ChannelOut 返回给前端的渠道：永不包含密钥，只有 secretSet。
type ChannelOut struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Name      string         `json:"name"`
	Enabled   bool           `json:"enabled"`
	Config    map[string]any `json:"config"`
	SecretSet bool           `json:"secretSet"`
}

type All struct {
	Basic         Basic        `json:"basic"`
	Brand         Brand        `json:"brand"`
	Security      Security     `json:"security"`
	Retention     Retention    `json:"retention"`
	AlertChannels []ChannelOut `json:"alertChannels"`
}

const DefaultPrimary = "#C6242A"

func DefaultBasic() Basic {
	return Basic{PlatformName: "CloudWatch", Subtitle: "私有云可观测平台", Copyright: "© 2026 CloudWatch", SupportEmail: ""}
}
func DefaultBrand() Brand { return Brand{PrimaryColor: DefaultPrimary} }
func DefaultSecurity() Security {
	return Security{MinLength: 8, RequireUpper: true, RequireLower: true, RequireDigit: true, RequireSpecial: true,
		ExpireDays: 90, SessionTimeoutMin: 60, MaxSessions: 3, CaptchaEnabled: false, LockThreshold: 5, LockMinutes: 15}
}
func DefaultRetention() Retention {
	return Retention{AuditDays: 180, MetricDays: 90, InspectionDays: 365, AlertDays: 180}
}

// FieldErrors 字段级校验错误，key 形如 "security.minLength"。
type FieldErrors map[string]string

func (e FieldErrors) Error() string {
	for _, v := range e {
		return v
	}
	return "校验失败"
}

var hexRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func between(v, a, b int) bool { return v >= a && v <= b }

func (b *Basic) Normalize() FieldErrors {
	e := FieldErrors{}
	b.PlatformName, b.Subtitle, b.Copyright, b.SupportEmail = strings.TrimSpace(b.PlatformName), strings.TrimSpace(b.Subtitle), strings.TrimSpace(b.Copyright), strings.TrimSpace(b.SupportEmail)
	if b.PlatformName == "" {
		e["basic.platformName"] = "请输入平台名称"
	} else if utf8.RuneCountInString(b.PlatformName) > 24 {
		e["basic.platformName"] = "不超过 24 个字符"
	}
	if utf8.RuneCountInString(b.Subtitle) > 64 {
		e["basic.subtitle"] = "不超过 64 个字符"
	}
	if utf8.RuneCountInString(b.Copyright) > 128 {
		e["basic.copyright"] = "不超过 128 个字符"
	}
	if b.SupportEmail != "" {
		if a, err := mail.ParseAddress(b.SupportEmail); err != nil || a.Address != b.SupportEmail {
			e["basic.supportEmail"] = "邮箱格式不正确"
		}
	}
	return e
}

func (b *Brand) NormalizeColor() FieldErrors {
	e := FieldErrors{}
	if !hexRe.MatchString(b.PrimaryColor) {
		e["brand.primaryColor"] = "主色必须是 6 位 HEX 色值，如 #C6242A"
	} else {
		b.PrimaryColor = strings.ToUpper(b.PrimaryColor)
	}
	return e
}

func (s *Security) Validate() FieldErrors {
	e := FieldErrors{}
	chk := func(k string, v, a, b int) {
		if !between(v, a, b) {
			e["security."+k] = itoa(a) + "~" + itoa(b)
		}
	}
	chk("minLength", s.MinLength, 6, 64)
	chk("expireDays", s.ExpireDays, 0, 3650)
	chk("sessionTimeoutMin", s.SessionTimeoutMin, 5, 1440)
	chk("maxSessions", s.MaxSessions, 1, 20)
	chk("lockThreshold", s.LockThreshold, 3, 20)
	chk("lockMinutes", s.LockMinutes, 1, 1440)
	return e
}

func (r *Retention) Validate() FieldErrors {
	e := FieldErrors{}
	for k, v := range map[string]int{"auditDays": r.AuditDays, "metricDays": r.MetricDays, "inspectionDays": r.InspectionDays, "alertDays": r.AlertDays} {
		if !between(v, 7, 3650) {
			e["retention."+k] = "7~3650 天"
		}
	}
	return e
}

func itoa(i int) string { return strconv.Itoa(i) }

// ValidateChannel 校验渠道入参（与前端 validateChannel 对齐），并清洗 config 仅保留各类型允许的字段。
func ValidateChannel(c *ChannelIn, key string) FieldErrors {
	e := FieldErrors{}
	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" {
		e[key+".name"] = "请输入渠道名称"
	} else if utf8.RuneCountInString(c.Name) > 64 {
		e[key+".name"] = "不超过 64 个字符"
	}
	if c.Config == nil {
		c.Config = map[string]any{}
	}
	str := func(k string) string {
		v, _ := c.Config[k].(string)
		return strings.TrimSpace(v)
	}
	switch c.Type {
	case "email":
		host, user, to := str("host"), str("username"), str("to")
		port := toInt(c.Config["port"])
		if host == "" {
			e[key+".host"] = "请输入 SMTP 服务器"
		}
		if !between(port, 1, 65535) {
			e[key+".port"] = "端口 1~65535"
		}
		if to == "" {
			e[key+".to"] = "请输入收件邮箱"
		} else {
			for _, x := range splitList(to) {
				if a, err := mail.ParseAddress(x); err != nil || a.Address != x {
					e[key+".to"] = "请输入合法的收件邮箱（多个用逗号分隔）"
					break
				}
			}
		}
		c.Config = map[string]any{"host": host, "port": port, "username": user, "to": strings.Join(splitList(to), ",")}
	case "webhook":
		u := str("url")
		if !IsHTTPURL(u) {
			e[key+".url"] = "请输入合法的 Webhook 地址（http/https）"
		}
		c.Config = map[string]any{"url": u}
	default:
		e[key+".type"] = "不支持的渠道类型"
	}
	return e
}

func IsHTTPURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func splitList(s string) []string {
	f := func(r rune) bool { return r == ',' || r == ';' || r == '，' || r == '；' }
	var out []string
	for _, x := range strings.FieldsFunc(s, f) {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}

func toInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case string:
		x := 0
		for _, ch := range strings.TrimSpace(n) {
			if ch < '0' || ch > '9' {
				return 0
			}
			x = x*10 + int(ch-'0')
			if x > 1<<30 {
				return 0
			}
		}
		return x
	}
	return 0
}
