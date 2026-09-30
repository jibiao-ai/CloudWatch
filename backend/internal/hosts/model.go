// Package hosts 域名配置：按「云平台控制台 IP + 根域名」生成各组件（keystone/neutron/nova/cinder/glance…）的 hosts 映射，
// 并真实地同步到：本机 hosts 文件、内置 DNS 服务（供 docker --dns 使用）、运行中的 Docker 容器（/etc/hosts）。
package hosts

import (
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"
)

const (
	BeginMark = "# BEGIN CloudWatch managed hosts (do not edit)"
	EndMark   = "# END CloudWatch managed hosts"
)

// DefaultComponents 与接口文档一致：<组件>.<根域名>。
var DefaultComponents = []string{"keystone", "neutron", "nova", "cinder", "glance"}

type HostLine struct {
	IP   string `json:"ip"`
	Host string `json:"host"`
}

type Mapping struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	ConsoleIP  string     `json:"consoleIp"`
	RootDomain string     `json:"rootDomain"`
	Components []string   `json:"components"`
	Enabled    bool       `json:"enabled"`
	ProbePort  int        `json:"probePort"`
	Remark     string     `json:"remark"`
	UpdatedAt  time.Time  `json:"updatedAt"`
	UpdatedBy  string     `json:"updatedBy"`
	Hosts      []HostLine `json:"hosts"`
}

type Input struct {
	Name       string   `json:"name"`
	ConsoleIP  string   `json:"consoleIp"`
	RootDomain string   `json:"rootDomain"`
	Components []string `json:"components"`
	Enabled    *bool    `json:"enabled"`
	ProbePort  int      `json:"probePort"`
	Remark     string   `json:"remark"`
}

type FieldErrors map[string]string

var (
	labelRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
)

// Lines 由映射生成 hosts 行：<IP> <组件>.<根域名>（单空格分隔）。
func (m *Mapping) Lines() []HostLine {
	out := make([]HostLine, 0, len(m.Components))
	for _, c := range m.Components {
		out = append(out, HostLine{IP: m.ConsoleIP, Host: c + "." + m.RootDomain})
	}
	return out
}

func validRootDomain(d string) bool {
	if len(d) == 0 || len(d) > 190 || strings.Contains(d, "..") {
		return false
	}
	parts := strings.Split(d, ".")
	if len(parts) < 2 {
		return false
	}
	for _, p := range parts {
		if !labelRe.MatchString(p) {
			return false
		}
	}
	return d != "localhost.localdomain"
}

// Normalize 校验并规范化输入（域名转小写、去空白、去重），返回字段级错误。
func Normalize(in *Input) FieldErrors {
	e := FieldErrors{}
	in.Name = strings.TrimSpace(in.Name)
	if n := len([]rune(in.Name)); n == 0 || n > 64 {
		e["name"] = "请输入名称（1~64 个字符）"
	}
	in.ConsoleIP = strings.TrimSpace(in.ConsoleIP)
	ip := net.ParseIP(in.ConsoleIP)
	switch {
	case ip == nil:
		e["consoleIp"] = "IP 地址格式不正确，例如 192.168.27.150"
	case ip.IsUnspecified() || ip.IsMulticast():
		e["consoleIp"] = "不能使用 0.0.0.0 / 组播地址"
	default:
		in.ConsoleIP = ip.String()
	}
	in.RootDomain = strings.ToLower(strings.Trim(strings.TrimSpace(in.RootDomain), "."))
	if !validRootDomain(in.RootDomain) {
		e["rootDomain"] = "根域名格式不正确，例如 openstack.svc.cluster.local（至少两段，仅字母数字与连字符）"
	}
	if len(in.Components) == 0 {
		in.Components = append([]string(nil), DefaultComponents...)
	}
	seen := map[string]bool{}
	comps := make([]string, 0, len(in.Components))
	for _, c := range in.Components {
		c = strings.ToLower(strings.TrimSpace(c))
		if c == "" || seen[c] {
			continue
		}
		if !labelRe.MatchString(c) {
			e["components"] = fmt.Sprintf("组件名「%s」不合法（仅小写字母、数字与连字符，不含点）", c)
			break
		}
		seen[c] = true
		comps = append(comps, c)
	}
	if e["components"] == "" {
		if len(comps) == 0 {
			e["components"] = "至少选择一个组件"
		} else if len(comps) > 30 {
			e["components"] = "组件数量不能超过 30 个"
		}
	}
	in.Components = comps
	if in.ProbePort == 0 {
		in.ProbePort = 443
	}
	if in.ProbePort < 1 || in.ProbePort > 65535 {
		e["probePort"] = "端口需为 1~65535"
	}
	in.Remark = strings.TrimSpace(in.Remark)
	if len([]rune(in.Remark)) > 255 {
		e["remark"] = "备注不能超过 255 个字符"
	}
	return e
}

// Block 生成受管 hosts 段（含起止标记）；无启用映射时返回空串。
func Block(ms []Mapping) string {
	var sb strings.Builder
	n := 0
	for i := range ms {
		m := &ms[i]
		if !m.Enabled {
			continue
		}
		if n == 0 {
			sb.WriteString(BeginMark + "\n")
		}
		n++
		fmt.Fprintf(&sb, "# %s（%s）\n", oneLine(m.Name), m.RootDomain)
		for _, l := range m.Lines() {
			sb.WriteString(l.IP + " " + l.Host + "\n")
		}
	}
	if n == 0 {
		return ""
	}
	sb.WriteString(EndMark + "\n")
	return sb.String()
}

func oneLine(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' {
			return ' '
		}
		return r
	}, s)
}

// Table 生成 FQDN(小写、无尾点) → IP 的解析表（仅启用的映射）。
func Table(ms []Mapping) map[string]string {
	t := map[string]string{}
	for i := range ms {
		if !ms[i].Enabled {
			continue
		}
		for _, l := range ms[i].Lines() {
			t[l.Host] = l.IP
		}
	}
	return t
}
