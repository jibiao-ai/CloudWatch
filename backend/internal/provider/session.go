package provider

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// Conn 一个已认证的 OpenStack 平台连接：供性能监控 / 告警等模块调用 EMLA 等组件接口。
type Conn struct {
	c      *Client
	hc     *http.Client
	scheme string
	Sess   *Session
	Root   string
}

// Connect 用平台凭据连接 Keystone 取得 Token（项目范围）。
func (m *Manager) Connect(ctx context.Context, id string) (*Conn, *Provider, error) {
	p, err := m.Store.Get(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	pwd, err := m.Store.Password(ctx, id)
	if err != nil {
		return nil, p, fmt.Errorf("读取已保存的密码失败：%w", err)
	}
	cr := credsOf(p, pwd)
	hc := m.Client.http(cr.Timeout)
	_, scheme := m.Client.probe(ctx, hc, "keystone", "", "keystone."+cr.RootDomain, "")
	if scheme == "" {
		return nil, p, fmt.Errorf("Keystone 域名 keystone.%s 不可达，请检查「域名配置」", cr.RootDomain)
	}
	sess, err := m.Client.Auth(ctx, hc, scheme, cr)
	if err != nil {
		return nil, p, fmt.Errorf("获取 Token 失败：%s", err)
	}
	return &Conn{c: m.Client, hc: hc, scheme: scheme, Sess: sess, Root: cr.RootDomain}, p, nil
}

// EMLA 返回 emla 组件的基础地址：优先服务目录里的 emla / monitoring，缺省为 <scheme>://emla.<根域名>。
func (cn *Conn) EMLA() string {
	for _, t := range []string{"emla", "monitoring"} {
		if u := cn.Sess.catalog[t]; u != "" {
			return u
		}
	}
	return cn.c.BaseURL(cn.scheme, "emla."+cn.Root)
}

// ProjectID 当前 Token 所属项目 ID（series/query 等接口路径需要）。
func (cn *Conn) ProjectID() string { return cn.Sess.ProjectID }

// Nova 返回 Nova 基础地址（含 /v2.1）：优先服务目录 compute，缺省 <scheme>://nova.<根域名>/v2.1。
func (cn *Conn) Nova() string {
	return cn.Sess.endpoint("compute", cn.c.BaseURL(cn.scheme, "nova."+cn.Root)+"/v2.1")
}

// Cinder 返回 Cinder v3 基础地址（含项目 ID）：优先服务目录 volumev3 / block-storage，缺省 <scheme>://cinder.<根域名>/v3/<项目ID>。
func (cn *Conn) Cinder() string {
	return cn.Sess.endpoint("volumev3", cn.Sess.endpoint("block-storage", cn.c.BaseURL(cn.scheme, "cinder."+cn.Root)+"/v3/"+cn.Sess.ProjectID))
}

// Neutron 返回 Neutron 基础地址（含 /v2.0）：优先服务目录 network，缺省 <scheme>://neutron.<根域名>/v2.0。
func (cn *Conn) Neutron() string {
	u := strings.TrimRight(cn.Sess.endpoint("network", cn.c.BaseURL(cn.scheme, "neutron."+cn.Root)), "/")
	if !strings.Contains(u, "/v2.0") {
		u += "/v2.0"
	}
	return u
}

// Gnocchi 返回 Gnocchi 基础地址：<scheme>://gnocchi.<根域名>（接口文档约定的域名）。
func (cn *Conn) Gnocchi() string { return cn.c.BaseURL(cn.scheme, "gnocchi."+cn.Root) }

// GetJSON 带 X-Auth-Token 的 GET，并把响应解析到 out。
func (cn *Conn) GetJSON(ctx context.Context, url string, out any) error {
	return cn.c.getJSON(ctx, cn.hc, cn.Sess.Token, url, out)
}

// ListPlatformIDs 返回所有平台 id（供周期任务遍历）。
func (m *Manager) ListPlatformIDs(ctx context.Context) ([]string, error) {
	rows, err := m.db.QueryContext(ctx, `SELECT id FROM providers ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
}
