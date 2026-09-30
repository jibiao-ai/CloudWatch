package hosts

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/net/dns/dnsmessage"
)

// DNSServer 内置轻量 DNS：受管域名直接应答（A/AAAA），其余请求转发到页面配置的上游 DNS（仅限内网/回环来源，避免成为开放递归）。
// 容器通过 `docker run --dns <本机IP>` 即可解析这些域名，且映射变更后立即生效（TTL=10s）。
type DNSServer struct {
	table     atomic.Pointer[map[string]string]
	upstreams atomic.Pointer[[]string]
	addr      string
	udp       net.PacketConn
	tcp       net.Listener
	wg        sync.WaitGroup
	sem       chan struct{}
}

func StartDNS(listen string) (*DNSServer, error) {
	s := &DNSServer{addr: listen, sem: make(chan struct{}, 256)}
	empty := map[string]string{}
	s.table.Store(&empty)
	noUp := []string{}
	s.upstreams.Store(&noUp)
	pc, err := net.ListenPacket("udp", listen)
	if err != nil {
		return nil, err
	}
	l, err := net.Listen("tcp", pc.LocalAddr().String())
	if err != nil {
		pc.Close()
		return nil, err
	}
	s.udp, s.tcp = pc, l
	s.addr = pc.LocalAddr().String()
	s.wg.Add(2)
	go s.serveUDP()
	go s.serveTCP()
	return s, nil
}

func (s *DNSServer) Addr() string                 { return s.addr }
func (s *DNSServer) SetTable(t map[string]string) { s.table.Store(&t) }
func (s *DNSServer) SetUpstreams(u []string)      { s.upstreams.Store(&u) }

func (s *DNSServer) Close() {
	s.udp.Close()
	s.tcp.Close()
	s.wg.Wait()
}

func (s *DNSServer) serveUDP() {
	defer s.wg.Done()
	buf := make([]byte, 4096)
	for {
		n, from, err := s.udp.ReadFrom(buf)
		if err != nil {
			return
		}
		req := append([]byte(nil), buf[:n]...)
		select {
		case s.sem <- struct{}{}:
			go func() {
				defer func() { <-s.sem }()
				if resp := s.handle(req, from, "udp"); resp != nil {
					_, _ = s.udp.WriteTo(resp, from)
				}
			}()
		default: // 过载直接丢弃
		}
	}
}

func (s *DNSServer) serveTCP() {
	defer s.wg.Done()
	for {
		c, err := s.tcp.Accept()
		if err != nil {
			return
		}
		go func() {
			defer c.Close()
			for i := 0; i < 16; i++ {
				_ = c.SetDeadline(time.Now().Add(10 * time.Second))
				var lb [2]byte
				if _, err := io.ReadFull(c, lb[:]); err != nil {
					return
				}
				n := int(binary.BigEndian.Uint16(lb[:]))
				if n == 0 {
					return
				}
				req := make([]byte, n)
				if _, err := io.ReadFull(c, req); err != nil {
					return
				}
				resp := s.handle(req, c.RemoteAddr(), "tcp")
				if resp == nil {
					return
				}
				out := make([]byte, 2+len(resp))
				binary.BigEndian.PutUint16(out, uint16(len(resp)))
				copy(out[2:], resp)
				if _, err := c.Write(out); err != nil {
					return
				}
			}
		}()
	}
}

func privateSource(a net.Addr) bool {
	var ip net.IP
	switch v := a.(type) {
	case *net.UDPAddr:
		ip = v.IP
	case *net.TCPAddr:
		ip = v.IP
	}
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast())
}

func (s *DNSServer) reply(req dnsmessage.Message, rcode dnsmessage.RCode, ans []dnsmessage.Resource, auth bool) []byte {
	m := dnsmessage.Message{
		Header: dnsmessage.Header{ID: req.ID, Response: true, Authoritative: auth, RecursionDesired: req.RecursionDesired,
			RecursionAvailable: len(*s.upstreams.Load()) > 0, RCode: rcode},
		Questions: req.Questions, Answers: ans,
	}
	b, err := m.Pack()
	if err != nil {
		return nil
	}
	return b
}

func (s *DNSServer) handle(raw []byte, from net.Addr, network string) []byte {
	var req dnsmessage.Message
	if err := req.Unpack(raw); err != nil || req.Response || len(req.Questions) != 1 {
		if len(raw) >= 2 { // 格式错误
			m := dnsmessage.Message{Header: dnsmessage.Header{ID: binary.BigEndian.Uint16(raw), Response: true, RCode: dnsmessage.RCodeFormatError}}
			b, _ := m.Pack()
			return b
		}
		return nil
	}
	q := req.Questions[0]
	name := strings.ToLower(strings.TrimSuffix(q.Name.String(), "."))
	if ipStr, ok := (*s.table.Load())[name]; ok && q.Class == dnsmessage.ClassINET {
		ip := net.ParseIP(ipStr)
		var ans []dnsmessage.Resource
		hdr := dnsmessage.ResourceHeader{Name: q.Name, Class: dnsmessage.ClassINET, TTL: 10}
		if v4 := ip.To4(); v4 != nil && (q.Type == dnsmessage.TypeA || q.Type == dnsmessage.TypeALL) {
			hdr.Type = dnsmessage.TypeA
			var a [4]byte
			copy(a[:], v4)
			ans = append(ans, dnsmessage.Resource{Header: hdr, Body: &dnsmessage.AResource{A: a}})
		} else if v4 == nil && (q.Type == dnsmessage.TypeAAAA || q.Type == dnsmessage.TypeALL) {
			hdr.Type = dnsmessage.TypeAAAA
			var a [16]byte
			copy(a[:], ip.To16())
			ans = append(ans, dnsmessage.Resource{Header: hdr, Body: &dnsmessage.AAAAResource{AAAA: a}})
		}
		return s.reply(req, dnsmessage.RCodeSuccess, ans, true) // 其他类型：NOERROR/NODATA
	}
	ups := *s.upstreams.Load()
	if len(ups) == 0 || !privateSource(from) {
		return s.reply(req, dnsmessage.RCodeRefused, nil, false)
	}
	if resp := forward(raw, ups, network); resp != nil {
		return resp
	}
	return s.reply(req, dnsmessage.RCodeServerFailure, nil, false)
}

func forward(raw []byte, ups []string, network string) []byte {
	for _, u := range ups {
		if b, err := exchange(raw, u, network); err == nil {
			return b
		}
	}
	return nil
}

func exchange(raw []byte, upstream, network string) ([]byte, error) {
	d := net.Dialer{Timeout: 2 * time.Second}
	c, err := d.Dial(network, upstream)
	if err != nil {
		return nil, err
	}
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(3 * time.Second))
	if network == "tcp" {
		out := make([]byte, 2+len(raw))
		binary.BigEndian.PutUint16(out, uint16(len(raw)))
		copy(out[2:], raw)
		if _, err := c.Write(out); err != nil {
			return nil, err
		}
		var lb [2]byte
		if _, err := io.ReadFull(c, lb[:]); err != nil {
			return nil, err
		}
		b := make([]byte, binary.BigEndian.Uint16(lb[:]))
		_, err := io.ReadFull(c, b)
		return b, err
	}
	if _, err := c.Write(raw); err != nil {
		return nil, err
	}
	b := make([]byte, 4096)
	n, err := c.Read(b)
	if err != nil {
		return nil, err
	}
	return b[:n], nil
}

// Lookup 向 DNS 服务器发一次 A/AAAA 查询（用于「校验」）。
func Lookup(ctx context.Context, server, host string, v6 bool) (string, error) {
	name, err := dnsmessage.NewName(strings.TrimSuffix(host, ".") + ".")
	if err != nil {
		return "", err
	}
	t := dnsmessage.TypeA
	if v6 {
		t = dnsmessage.TypeAAAA
	}
	m := dnsmessage.Message{Header: dnsmessage.Header{ID: uint16(time.Now().UnixNano()), RecursionDesired: true},
		Questions: []dnsmessage.Question{{Name: name, Type: t, Class: dnsmessage.ClassINET}}}
	raw, err := m.Pack()
	if err != nil {
		return "", err
	}
	type res struct {
		b   []byte
		err error
	}
	ch := make(chan res, 1)
	go func() { b, err := exchange(raw, server, "udp"); ch <- res{b, err} }()
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case r := <-ch:
		if r.err != nil {
			return "", r.err
		}
		var resp dnsmessage.Message
		if err := resp.Unpack(r.b); err != nil {
			return "", err
		}
		if resp.RCode != dnsmessage.RCodeSuccess {
			return "", fmt.Errorf("DNS 返回 %s", resp.RCode)
		}
		for _, a := range resp.Answers {
			switch v := a.Body.(type) {
			case *dnsmessage.AResource:
				return net.IP(v.A[:]).String(), nil
			case *dnsmessage.AAAAResource:
				return net.IP(v.AAAA[:]).String(), nil
			}
		}
		return "", errors.New("无解析记录")
	}
}

var _ = log.Printf
