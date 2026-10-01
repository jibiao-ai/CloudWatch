// Package provider 平台管理：纳管 OpenStack 平台的接入信息（加密存库）、真实连通性/Keystone 取 Token 验证、
// 资源同步（Nova/Cinder/Neutron）与按「同步间隔」自动同步。
package provider

import (
	"net"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jibiao-ai/cloudwatch/internal/hosts"
)

// Components 需验证的六个组件，域名为 <组件>.<根域名>。
var Components = []struct{ Key, Label string }{
	{"keystone", "Keystone（认证）"},
	{"neutron", "Neutron（网络）"},
	{"nova", "Nova（计算）"},
	{"cinder", "Cinder（块存储）"},
	{"glance", "Glance（镜像）"},
	{"emla", "EMLA（监控）"},
}

var (
	envTypes = map[string]bool{"dev": true, "prod": true, "dr": true}
	archs    = map[string]bool{"X86（Intel）": true, "X86（AMD）": true, "ARM（鲲鹏）": true, "ARM（飞腾）": true}
)

type Auth struct {
	Username      string `json:"username"`
	Password      string `json:"password,omitempty"`
	ProjectName   string `json:"projectName"`
	UserDomain    string `json:"userDomain"`
	ProjectDomain string `json:"projectDomain"`
	PasswordSet   bool   `json:"passwordSet"`
}

type Advanced struct {
	TimeoutSec       int    `json:"timeoutSec"`
	SyncIntervalMin  int    `json:"syncIntervalMin"`
	AlertIntervalSec int    `json:"alertIntervalSec"`
	Remark           string `json:"remark"`
}

// Input 新增 / 编辑 / 验证草稿的请求体。Password 为空 = 沿用已保存密码。
type Input struct {
	Name       string   `json:"name"`
	EnvType    string   `json:"envType"`
	ConsoleIP  string   `json:"consoleIp"`
	RootDomain string   `json:"rootDomain"`
	Arch       string   `json:"arch"`
	NodeCount  int      `json:"nodeCount"`
	Auth       Auth     `json:"auth"`
	Advanced   Advanced `json:"advanced"`
}

type Stats struct {
	VMCount      int `json:"vmCount"`
	VolumeCount  int `json:"volumeCount"`
	NetworkCount int `json:"networkCount"`
}

type Provider struct {
	ID           string         `json:"id"`
	Type         string         `json:"type"`
	Name         string         `json:"name"`
	EnvType      string         `json:"envType"`
	ConsoleIP    string         `json:"consoleIp"`
	RootDomain   string         `json:"rootDomain"`
	Arch         string         `json:"arch"`
	NodeCount    int            `json:"nodeCount"`
	Auth         Auth           `json:"auth"`
	Advanced     Advanced       `json:"advanced"`
	WriteEnabled bool           `json:"writeEnabled"`
	Status       string         `json:"status"`
	LastVerifyAt *time.Time     `json:"lastVerifyAt"`
	LastVerify   *VerifyResult  `json:"lastVerify"`
	LastSyncAt   *time.Time     `json:"lastSyncAt"`
	LastSyncErr  string         `json:"lastSyncError"`
	Stats        Stats          `json:"stats"`
	Zones        []string       `json:"zones"`
	Hosts        []ComponentRef `json:"components"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	UpdatedBy    string         `json:"updatedBy"`
}

type ComponentRef struct {
	Key  string `json:"key"`
	Host string `json:"host"`
}

// ComponentHosts 由根域名派生六个组件域名。
func ComponentHosts(root string) []ComponentRef {
	out := make([]ComponentRef, 0, len(Components))
	for _, c := range Components {
		out = append(out, ComponentRef{Key: c.Key, Host: c.Key + "." + root})
	}
	return out
}

type FieldErrors map[string]string

func runeLen(s string) int { return utf8.RuneCountInString(s) }

// Normalize 规范化并校验输入。needPassword：新增（或草稿无已存密码）时密码必填。
func Normalize(in *Input, needPassword bool) FieldErrors {
	e := FieldErrors{}
	in.Name = strings.TrimSpace(in.Name)
	if n := runeLen(in.Name); n == 0 || n > 40 {
		e["name"] = "请输入云管标识（1~40 个字符）"
	}
	if !envTypes[in.EnvType] {
		e["envType"] = "环境类型不合法"
	}
	in.ConsoleIP = strings.TrimSpace(in.ConsoleIP)
	ip := net.ParseIP(in.ConsoleIP)
	switch {
	case ip == nil || ip.To4() == nil:
		e["consoleIp"] = "控制台 IP 需为 IPv4 地址，例如 192.168.27.150"
	case ip.IsUnspecified() || ip.IsMulticast():
		e["consoleIp"] = "不能使用 0.0.0.0 / 组播地址"
	default:
		in.ConsoleIP = ip.String()
	}
	in.RootDomain = strings.ToLower(strings.Trim(strings.TrimSpace(in.RootDomain), "."))
	if !hosts.ValidRootDomain(in.RootDomain) {
		e["rootDomain"] = "根域名格式不正确，例如 openstack.svc.cluster.local"
	}
	if in.Arch == "" {
		in.Arch = "X86（Intel）"
	}
	if !archs[in.Arch] {
		e["arch"] = "芯片架构不合法"
	}
	if in.NodeCount < 0 || in.NodeCount > 10000 {
		e["nodeCount"] = "节点数需在 0~10000 之间"
	}
	a := &in.Auth
	a.Username, a.ProjectName = strings.TrimSpace(a.Username), strings.TrimSpace(a.ProjectName)
	a.UserDomain, a.ProjectDomain = strings.TrimSpace(a.UserDomain), strings.TrimSpace(a.ProjectDomain)
	for k, v := range map[string]string{"username": a.Username, "projectName": a.ProjectName, "userDomain": a.UserDomain, "projectDomain": a.ProjectDomain} {
		if v == "" {
			e[k] = "必填"
		} else if runeLen(v) > 64 {
			e[k] = "不超过 64 个字符"
		}
	}
	if a.Password == "" && needPassword {
		e["password"] = "请输入密码"
	} else if len(a.Password) > 256 {
		e["password"] = "密码过长"
	}
	if in.Advanced.TimeoutSec == 0 {
		in.Advanced.TimeoutSec = 30
	}
	if in.Advanced.SyncIntervalMin == 0 {
		in.Advanced.SyncIntervalMin = 10
	}
	if in.Advanced.AlertIntervalSec == 0 {
		in.Advanced.AlertIntervalSec = 60
	}
	if t := in.Advanced.TimeoutSec; t < 3 || t > 300 {
		e["timeoutSec"] = "请求超时需在 3~300 秒之间"
	}
	if s := in.Advanced.SyncIntervalMin; s < 1 || s > 1440 {
		e["syncIntervalMin"] = "同步间隔需在 1~1440 分钟之间"
	}
	if a := in.Advanced.AlertIntervalSec; a < 10 || a > 3600 {
		e["alertIntervalSec"] = "告警同步间隔需在 10~3600 秒之间"
	}
	in.Advanced.Remark = strings.TrimSpace(in.Advanced.Remark)
	if runeLen(in.Advanced.Remark) > 255 {
		e["remark"] = "备注不超过 255 个字符"
	}
	return e
}
