package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"sort"
	"strings"
)

// SyncResult 一次资源同步的统计。
type SyncResult struct {
	Stats Stats
	Zones []string
}

type pageDoc map[string]json.RawMessage

func (c *Client) getJSON(ctx context.Context, hc *http.Client, tok, url string, out any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("X-Auth-Token", tok)
	req.Header.Set("Accept", "application/json")
	// 部分组件（如 coaster）要求 GET 也带 Content-Type: application/json，否则 500「Invalid content type in request: text/plain」；
	// 接口文档的 curl 示例同样带此头，对 Nova/Cinder/Neutron 等无副作用。
	req.Header.Set("Content-Type", "application/json")
	resp, err := hc.Do(req)
	if err != nil {
		return fmt.Errorf("%s", shortErr(err))
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("HTTP %d：%s", resp.StatusCode, upstreamMsg(raw))
	}
	return json.Unmarshal(raw, out)
}

// sameOrigin 把翻页链接 next 的协议/主机/端口替换为首次请求（first）的，保留 path 与 query。
// 原因：Cinder/Nova 用自己看到的服务地址生成 next 链接，K8s 部署时常为集群内部域名
// （如 cinder-api.openstack.svc.cluster.local），CloudWatch 容器内无法解析。
func sameOrigin(first, next string) string {
	f, err1 := neturl.Parse(first)
	n, err2 := neturl.Parse(next)
	if err1 != nil || err2 != nil || f.Host == "" {
		return next
	}
	n.Scheme, n.Host = f.Scheme, f.Host
	return n.String()
}

// countAll 统计列表资源总数：按 <key>_links 的 rel=next 翻页（最多 50 页）。
func (c *Client) countAll(ctx context.Context, hc *http.Client, tok, first, key string) (int, error) {
	total, url := 0, first
	for page := 0; page < 50 && url != ""; page++ {
		var doc pageDoc
		if err := c.getJSON(ctx, hc, tok, url, &doc); err != nil {
			return 0, fmt.Errorf("%s（请求地址 %s）", err, url)
		}
		var items []json.RawMessage
		_ = json.Unmarshal(doc[key], &items)
		total += len(items)
		url = ""
		var links []struct{ Rel, Href string }
		if json.Unmarshal(doc[key+"_links"], &links) == nil {
			for _, l := range links {
				if l.Rel == "next" {
					url = sameOrigin(first, l.Href)
				}
			}
		}
	}
	return total, nil
}

func (s *Session) endpoint(typ, fallback string) string {
	if u := s.catalog[typ]; u != "" {
		return u
	}
	return fallback
}

// Sync 用 Keystone Token 调用 Nova / Cinder / Neutron 统计云主机、云硬盘、网络数量并读取可用域。
// progress 回调 (百分比, 说明)。
func (c *Client) Sync(ctx context.Context, cr Creds, progress func(int, string)) (*SyncResult, error) {
	hc := c.http(cr.Timeout)
	progress(5, "正在连接 Keystone")
	_, scheme := c.probe(ctx, hc, "keystone", "", "keystone."+cr.RootDomain, "")
	if scheme == "" {
		return nil, fmt.Errorf("Keystone 域名 keystone.%s 不可达", cr.RootDomain)
	}
	progress(15, "正在获取 Token")
	sess, err := c.Auth(ctx, hc, scheme, cr)
	if err != nil {
		return nil, fmt.Errorf("获取 Token 失败：%s", err)
	}
	base := func(comp string) string { return c.BaseURL(scheme, comp+"."+cr.RootDomain) }
	out := &SyncResult{Zones: []string{}}

	progress(30, "正在统计云主机（Nova）")
	nova := sess.endpoint("compute", base("nova")+"/v2.1")
	if out.Stats.VMCount, err = c.countAll(ctx, hc, sess.Token, nova+"/servers?all_tenants=true&limit=1000", "servers"); err != nil {
		return nil, fmt.Errorf("Nova 云主机统计失败：%s", err)
	}
	var az struct {
		Info []struct {
			ZoneName string `json:"zoneName"`
		} `json:"availabilityZoneInfo"`
	}
	if err := c.getJSON(ctx, hc, sess.Token, nova+"/os-availability-zone", &az); err == nil {
		for _, z := range az.Info {
			if z.ZoneName != "" && z.ZoneName != "internal" {
				out.Zones = append(out.Zones, z.ZoneName)
			}
		}
		sort.Strings(out.Zones)
	}

	progress(55, "正在统计云硬盘（Cinder）")
	cinder := sess.endpoint("volumev3", sess.endpoint("block-storage", base("cinder")+"/v3/"+sess.ProjectID))
	if out.Stats.VolumeCount, err = c.countAll(ctx, hc, sess.Token, cinder+"/volumes?all_tenants=1&limit=1000", "volumes"); err != nil {
		return nil, fmt.Errorf("Cinder 云硬盘统计失败：%s", err)
	}

	progress(80, "正在统计网络（Neutron）")
	neutron := strings.TrimRight(sess.endpoint("network", base("neutron")), "/")
	if !strings.Contains(neutron, "/v2.0") {
		neutron += "/v2.0"
	}
	if out.Stats.NetworkCount, err = c.countAll(ctx, hc, sess.Token, neutron+"/networks", "networks"); err != nil {
		return nil, fmt.Errorf("Neutron 网络统计失败：%s", err)
	}
	progress(95, "正在写入数据库")
	return out, nil
}
