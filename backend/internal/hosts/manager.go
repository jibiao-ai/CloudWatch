package hosts

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Target struct {
	Name   string `json:"name"`
	ID     string `json:"id"`
	Status string `json:"status"` // ok | failed
	Method string `json:"method,omitempty"`
	Error  string `json:"error,omitempty"`
}

type Channel struct {
	Status  string   `json:"status"` // ok | failed | disabled
	Message string   `json:"message"`
	Changed bool     `json:"changed,omitempty"`
	Targets []Target `json:"targets,omitempty"`
}

// Report 最近一次「应用」的结果（入库，页面展示）。
type Report struct {
	At      time.Time `json:"at"`
	By      string    `json:"by"`
	Lines   int       `json:"lines"`
	Local   Channel   `json:"local"`
	DNS     Channel   `json:"dns"`
	Docker  Channel   `json:"docker"`
	Trigger string    `json:"trigger"`
}

type Manager struct {
	Store *Store

	mu       sync.Mutex // 串行化 Apply
	dns      *DNSServer
	watchCtx context.CancelFunc
	watchSk  string
	rootCtx  context.Context
}

func NewManager(st *Store) *Manager { return &Manager{Store: st} }

func (m *Manager) Start(ctx context.Context) {
	m.rootCtx = ctx
	go func() {
		c, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		r, err := m.Apply(c, "system", "startup")
		if err != nil {
			log.Printf("hosts: 启动同步失败: %v", err)
			return
		}
		log.Printf("hosts: 启动同步完成（%d 条；本机=%s DNS=%s Docker=%s）", r.Lines, r.Local.Status, r.DNS.Status, r.Docker.Status)
	}()
	go func() { <-ctx.Done(); m.stopAll() }()
}

func (m *Manager) stopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dns != nil {
		m.dns.Close()
		m.dns = nil
	}
	if m.watchCtx != nil {
		m.watchCtx()
		m.watchCtx = nil
	}
}

func short(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

// Apply 把当前全部启用的映射同步到 本机 hosts / 内置 DNS / Docker 容器，并把结果入库。
func (m *Manager) Apply(ctx context.Context, by, trigger string) (*Report, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ms, err := m.Store.List(ctx)
	if err != nil {
		return nil, err
	}
	cfg, err := m.Store.GetSync(ctx)
	if err != nil {
		return nil, err
	}
	block := Block(ms)
	table := Table(ms)
	rep := &Report{At: time.Now().UTC(), By: by, Lines: len(table), Trigger: trigger}

	// 1) 本机 hosts
	if cfg.LocalEnabled {
		if ch, err := WriteLocal(LocalHostsPath, block); err != nil {
			rep.Local = Channel{Status: "failed", Message: err.Error()}
		} else {
			msg := fmt.Sprintf("已写入 %s（%d 条）", LocalHostsPath, len(table))
			if !ch {
				msg = fmt.Sprintf("%s 已是最新（%d 条）", LocalHostsPath, len(table))
			}
			rep.Local = Channel{Status: "ok", Message: msg, Changed: ch}
		}
	} else {
		rep.Local = Channel{Status: "disabled", Message: "未启用"}
		if true {
			if ch, err := WriteLocal(LocalHostsPath, ""); err == nil && ch {
				rep.Local = Channel{Status: "disabled", Message: "已关闭，并清除 " + LocalHostsPath + " 中的受管段", Changed: true}
			}
		}
	}

	// 2) 内置 DNS
	rep.DNS = m.applyDNS(cfg, table)

	// 3) Docker
	rep.Docker = m.applyDocker(ctx, cfg, block)

	_ = m.Store.PutReport(ctx, rep)
	return rep, nil
}

func (m *Manager) applyDNS(cfg Sync, table map[string]string) Channel {
	if !cfg.DNSEnabled {
		if m.dns != nil {
			m.dns.Close()
			m.dns = nil
		}
		return Channel{Status: "disabled", Message: "未启用"}
	}
	if m.dns != nil && !sameListen(m.dns.Addr(), cfg.DNSListen) {
		m.dns.Close()
		m.dns = nil
	}
	if m.dns == nil {
		s, err := StartDNS(cfg.DNSListen)
		if err != nil {
			return Channel{Status: "failed", Message: fmt.Sprintf("监听 %s 失败: %v（53 端口需要 root 或 CAP_NET_BIND_SERVICE，也可改用 5353 等高位端口）", cfg.DNSListen, err)}
		}
		m.dns = s
	}
	m.dns.SetTable(table)
	m.dns.SetUpstreams(cfg.DNSUpstreams)
	up := "未配置上游（仅解析受管域名）"
	if len(cfg.DNSUpstreams) > 0 {
		up = "上游 " + strings.Join(cfg.DNSUpstreams, ", ")
	}
	return Channel{Status: "ok", Message: fmt.Sprintf("DNS 服务运行于 %s，%d 条记录；%s", m.dns.Addr(), len(table), up)}
}

// sameListen 判断已监听地址与配置是否等价（端口相同，且配置为通配或 IP 相同）。
func sameListen(actual, want string) bool {
	ah, ap, e1 := net.SplitHostPort(actual)
	wh, wp, e2 := net.SplitHostPort(want)
	if e1 != nil || e2 != nil {
		return false
	}
	if ap != wp {
		if n, err := strconv.Atoi(wp); err != nil || n != 0 {
			return false
		}
	}
	wi, ai := net.ParseIP(wh), net.ParseIP(ah)
	if wh == "" || (wi != nil && wi.IsUnspecified()) {
		return ai == nil || ai.IsUnspecified()
	}
	return wi != nil && ai != nil && wi.Equal(ai)
}

// DNSAddr 返回内置 DNS 当前监听地址（未运行为空）。
func (m *Manager) DNSAddr() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dns == nil {
		return ""
	}
	return m.dns.Addr()
}

func (m *Manager) applyDocker(ctx context.Context, cfg Sync, block string) Channel {
	if !cfg.DockerEnabled {
		if m.watchCtx != nil {
			m.watchCtx()
			m.watchCtx = nil
		}
		return Channel{Status: "disabled", Message: "未启用"}
	}
	d := NewDocker(cfg.DockerSocket)
	pc, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := d.Ping(pc); err != nil {
		return Channel{Status: "failed", Message: err.Error()}
	}
	m.ensureWatch(cfg)
	cs, err := d.Running(ctx)
	if err != nil {
		return Channel{Status: "failed", Message: err.Error()}
	}
	ch := Channel{Status: "ok"}
	fail := 0
	for _, c := range cs {
		ic, cancel := context.WithTimeout(ctx, 20*time.Second)
		method, err := d.Inject(ic, c.ID, block)
		cancel()
		t := Target{Name: c.Name, ID: short(c.ID), Status: "ok", Method: method}
		switch {
		case errors.Is(err, ErrHostNetwork) && cfg.LocalEnabled:
			t.Method = "共用宿主机 hosts"
		case errors.Is(err, ErrHostNetwork):
			t.Status, t.Error = "failed", "host 网络容器共用宿主机 hosts，请开启「本机 hosts」"
			fail++
		case err != nil:
			t.Status, t.Error = "failed", err.Error()
			fail++
		}
		ch.Targets = append(ch.Targets, t)
	}
	switch {
	case len(ch.Targets) == 0:
		ch.Message = "当前没有运行中的容器（新启动的容器会被自动注入）"
	case fail > 0:
		ch.Status = "failed"
		ch.Message = fmt.Sprintf("%d 个容器成功，%d 个失败", len(ch.Targets)-fail, fail)
	default:
		ch.Message = fmt.Sprintf("已注入全部 %d 个运行中的容器；新启动的容器会被自动注入", len(ch.Targets))
	}
	return ch
}

// ensureWatch 监听容器启动事件：Docker 在容器（重）启动时会重建 /etc/hosts，因此需要重新注入。
func (m *Manager) ensureWatch(cfg Sync) {
	if m.rootCtx == nil {
		return
	}
	if m.watchCtx != nil && m.watchSk == cfg.DockerSocket {
		return
	}
	if m.watchCtx != nil {
		m.watchCtx()
	}
	ctx, cancel := context.WithCancel(m.rootCtx)
	m.watchCtx, m.watchSk = cancel, cfg.DockerSocket
	d := NewDocker(cfg.DockerSocket)
	go d.WatchStarts(ctx, func(id, name string) {
		time.Sleep(800 * time.Millisecond)
		c, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		cur, err := m.Store.GetSync(c)
		if err != nil || !cur.DockerEnabled {
			return
		}
		ms, err := m.Store.List(c)
		if err != nil {
			return
		}
		if method, err := d.Inject(c, id, Block(ms)); err != nil && errors.Is(err, ErrHostNetwork) {
			return
		} else if err != nil {
			log.Printf("hosts: 新容器 %s 注入失败: %v", name, err)
		} else {
			log.Printf("hosts: 新容器 %s 已注入域名（%s）", name, method)
		}
	})
}

/* ---------------- 状态 / 容器列表 / 校验 ---------------- */

type Item struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	OK      bool   `json:"ok"`
	Skipped bool   `json:"skipped,omitempty"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

type VerifyResult struct {
	Items []Item `json:"items"`
	OK    bool   `json:"ok"`
}

// Verify 逐项真实校验：本机 hosts 是否落盘、内置 DNS 应答是否正确、Docker 容器 hosts 是否生效、控制台端口是否可达。
func (m *Manager) Verify(ctx context.Context, id string) (*VerifyResult, error) {
	mp, err := m.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	cfg, err := m.Store.GetSync(ctx)
	if err != nil {
		return nil, err
	}
	ms, err := m.Store.List(ctx)
	if err != nil {
		return nil, err
	}
	block := Block(ms)
	res := &VerifyResult{OK: true}
	add := func(it Item) {
		if !it.OK && !it.Skipped {
			res.OK = false
		}
		res.Items = append(res.Items, it)
	}

	// 本机 hosts
	switch {
	case !mp.Enabled:
		add(Item{Key: "local", Label: "本机 hosts", Skipped: true, OK: true, Message: "该映射已停用，不会写入"})
	case !cfg.LocalEnabled:
		add(Item{Key: "local", Label: "本机 hosts", Skipped: true, OK: true, Message: "未启用本机 hosts 同步"})
	default:
		ok, err := LocalInSync(LocalHostsPath, block)
		switch {
		case err != nil:
			add(Item{Key: "local", Label: "本机 hosts", Error: err.Error()})
		case !ok:
			add(Item{Key: "local", Label: "本机 hosts", Error: LocalHostsPath + " 中的受管段与配置不一致，请点击「立即同步」"})
		default:
			add(Item{Key: "local", Label: "本机 hosts", OK: true, Message: fmt.Sprintf("%s 已包含 %d 条记录", LocalHostsPath, len(mp.Hosts))})
		}
	}

	// 内置 DNS
	if !cfg.DNSEnabled || !mp.Enabled {
		add(Item{Key: "dns", Label: "内置 DNS", Skipped: true, OK: true, Message: "未启用"})
	} else if addr := m.DNSAddr(); addr == "" {
		add(Item{Key: "dns", Label: "内置 DNS", Error: "DNS 服务未运行，请点击「立即同步」查看原因"})
	} else {
		srv := addr
		if h, p, e := net.SplitHostPort(addr); e == nil {
			if ip := net.ParseIP(h); h == "" || (ip != nil && ip.IsUnspecified()) {
				srv = net.JoinHostPort("127.0.0.1", p)
			}
		}
		var bad []string
		for _, l := range mp.Hosts {
			c, cancel := context.WithTimeout(ctx, 3*time.Second)
			got, err := Lookup(c, srv, l.Host, false)
			cancel()
			if err != nil || got != l.IP {
				bad = append(bad, fmt.Sprintf("%s → %v", l.Host, firstNonEmpty(errStr(err), got)))
			}
		}
		if len(bad) > 0 {
			add(Item{Key: "dns", Label: "内置 DNS", Error: "解析异常：" + strings.Join(bad, "；")})
		} else {
			add(Item{Key: "dns", Label: "内置 DNS", OK: true, Message: fmt.Sprintf("%s 对 %d 个域名解析正确", addr, len(mp.Hosts))})
		}
	}

	// Docker
	if !cfg.DockerEnabled || !mp.Enabled {
		add(Item{Key: "docker", Label: "Docker 容器", Skipped: true, OK: true, Message: "未启用"})
	} else {
		d := NewDocker(cfg.DockerSocket)
		cs, err := d.Running(ctx)
		if err != nil {
			add(Item{Key: "docker", Label: "Docker 容器", Error: err.Error()})
		} else {
			targets := cs
			var bad []string
			for _, c := range targets {
				if d.IsHostNetwork(ctx, c.ID) {
					// host 网络容器共用宿主机 hosts：开启「本机 hosts」即视为覆盖，否则记为异常
					if !cfg.LocalEnabled {
						bad = append(bad, c.Name+": host 网络容器需开启「本机 hosts」")
					}
					continue
				}
				ok, err := d.ContainerHasBlock(ctx, c.ID, block)
				if err != nil {
					bad = append(bad, c.Name+": "+err.Error())
				} else if !ok {
					bad = append(bad, c.Name+": hosts 未包含最新记录")
				}
			}
			switch {
			case len(bad) > 0:
				add(Item{Key: "docker", Label: "Docker 容器", Error: strings.Join(bad, "；")})
			case len(targets) == 0:
				add(Item{Key: "docker", Label: "Docker 容器", Skipped: true, OK: true, Message: "没有匹配的运行中容器"})
			default:
				add(Item{Key: "docker", Label: "Docker 容器", OK: true, Message: fmt.Sprintf("%d 个容器的 /etc/hosts 已包含记录", len(targets))})
			}
		}
	}

	// 控制台连通性
	addr := net.JoinHostPort(mp.ConsoleIP, strconv.Itoa(mp.ProbePort))
	t0 := time.Now()
	c, err := (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "tcp", addr)
	if err != nil {
		add(Item{Key: "connect", Label: "控制台连通性", Error: fmt.Sprintf("%s 连接失败: %s", addr, trimErr(err))})
	} else {
		c.Close()
		add(Item{Key: "connect", Label: "控制台连通性", OK: true, Message: fmt.Sprintf("%s 连接成功（%d ms）", addr, time.Since(t0).Milliseconds())})
	}
	return res, nil
}

func errStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
func trimErr(err error) string {
	s := err.Error()
	if i := strings.LastIndex(s, ": "); i >= 0 {
		return s[i+2:]
	}
	return s
}
