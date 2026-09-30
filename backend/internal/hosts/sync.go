package hosts

import (
	"net"
	"path/filepath"
	"strconv"
	"strings"
)

// LocalHostsPath 本机 hosts 文件固定为 /etc/hosts（不再提供路径配置）。
const LocalHostsPath = "/etc/hosts"

// Sync 同步配置（页面录入并存库，不走环境变量）。
// 本机 hosts 固定 /etc/hosts；Docker 注入固定作用于「所有运行中的容器」，因此只保留开关与 socket。
type Sync struct {
	LocalEnabled  bool     `json:"localEnabled"`
	DNSEnabled    bool     `json:"dnsEnabled"`
	DNSListen     string   `json:"dnsListen"`
	DNSUpstreams  []string `json:"dnsUpstreams"`
	DockerEnabled bool     `json:"dockerEnabled"`
	DockerSocket  string   `json:"dockerSocket"`
}

func DefaultSync() Sync {
	return Sync{
		LocalEnabled: true,
		DNSListen:    "0.0.0.0:53", DNSUpstreams: []string{},
		DockerSocket: "/var/run/docker.sock",
	}
}

// ValidatePath 限制只能管理名为 hosts / *.hosts 的文件，避免被滥用为任意文件写入。
func ValidatePath(p string) bool {
	if p == "" || len(p) > 255 || strings.ContainsRune(p, 0) || !filepath.IsAbs(p) || filepath.Clean(p) != p {
		return false
	}
	b := filepath.Base(p)
	return b == "hosts" || strings.HasSuffix(b, ".hosts")
}

func validSocket(p string) bool {
	return p != "" && len(p) <= 255 && !strings.ContainsRune(p, 0) && filepath.IsAbs(p) && filepath.Clean(p) == p && strings.HasSuffix(p, ".sock")
}

func normAddr(a string, defPort string) (string, bool) {
	a = strings.TrimSpace(a)
	if a == "" {
		return "", false
	}
	if _, _, err := net.SplitHostPort(a); err != nil {
		if ip := net.ParseIP(strings.Trim(a, "[]")); ip != nil {
			return net.JoinHostPort(ip.String(), defPort), true
		}
		return "", false
	}
	h, p, _ := net.SplitHostPort(a)
	if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 {
		return "", false
	}
	if h != "" && net.ParseIP(h) == nil {
		return "", false
	}
	return a, true
}

// NormalizeSync 校验同步配置。
func NormalizeSync(s *Sync) FieldErrors {
	e := FieldErrors{}
	if strings.TrimSpace(s.DNSListen) == "" {
		s.DNSListen = "0.0.0.0:53"
	}
	if l, ok := normAddr(s.DNSListen, "53"); ok {
		s.DNSListen = l
	} else {
		e["dnsListen"] = "监听地址格式为 IP:端口，例如 0.0.0.0:53"
	}
	ups := make([]string, 0, len(s.DNSUpstreams))
	for _, u := range s.DNSUpstreams {
		if strings.TrimSpace(u) == "" {
			continue
		}
		if a, ok := normAddr(u, "53"); ok && !strings.HasPrefix(a, ":") {
			ups = append(ups, a)
		} else {
			e["dnsUpstreams"] = "上游 DNS 格式为 IP 或 IP:端口（如 114.114.114.114）"
			break
		}
	}
	s.DNSUpstreams = ups
	s.DockerSocket = strings.TrimSpace(s.DockerSocket)
	if s.DockerSocket == "" {
		s.DockerSocket = "/var/run/docker.sock"
	}
	if !validSocket(s.DockerSocket) {
		e["dockerSocket"] = "需为绝对路径的 unix socket，如 /var/run/docker.sock"
	}
	return e
}
