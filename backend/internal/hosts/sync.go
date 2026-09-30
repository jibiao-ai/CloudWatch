package hosts

import (
	"net"
	"path/filepath"
	"strconv"
	"strings"
)

// Sync 同步配置（页面录入并存库，不走环境变量）。
type Sync struct {
	LocalEnabled     bool     `json:"localEnabled"`
	LocalPath        string   `json:"localPath"`
	DNSEnabled       bool     `json:"dnsEnabled"`
	DNSListen        string   `json:"dnsListen"`
	DNSUpstreams     []string `json:"dnsUpstreams"`
	DockerEnabled    bool     `json:"dockerEnabled"`
	DockerSocket     string   `json:"dockerSocket"`
	DockerMode       string   `json:"dockerMode"` // all | selected
	DockerContainers []string `json:"dockerContainers"`
}

func DefaultSync() Sync {
	return Sync{
		LocalEnabled: true, LocalPath: "/etc/hosts",
		DNSListen: "0.0.0.0:53", DNSUpstreams: []string{},
		DockerSocket: "/var/run/docker.sock", DockerMode: "selected", DockerContainers: []string{},
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
	s.LocalPath = strings.TrimSpace(s.LocalPath)
	if s.LocalPath == "" {
		s.LocalPath = "/etc/hosts"
	}
	if !ValidatePath(s.LocalPath) {
		e["localPath"] = "需为绝对路径，且文件名为 hosts 或以 .hosts 结尾（如 /etc/hosts）"
	}
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
	if s.DockerMode != "all" && s.DockerMode != "selected" {
		e["dockerMode"] = "注入范围只能是「全部运行中容器」或「指定容器」"
	}
	seen := map[string]bool{}
	cs := []string{}
	for _, c := range s.DockerContainers {
		c = strings.TrimSpace(strings.TrimPrefix(c, "/"))
		if c == "" || seen[c] {
			continue
		}
		seen[c] = true
		cs = append(cs, c)
	}
	s.DockerContainers = cs
	if s.DockerEnabled && s.DockerMode == "selected" && len(cs) == 0 && e["dockerMode"] == "" {
		e["dockerContainers"] = "请至少选择一个容器，或将注入范围改为「全部运行中容器」"
	}
	return e
}
