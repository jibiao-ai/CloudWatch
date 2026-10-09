package api

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
	"github.com/jibiao-ai/cloudwatch/internal/search"
)

// searchItem 一条全局搜索结果；前端按 Group 决定跳转到哪个功能页。
type searchItem struct {
	Group        string `json:"group"`
	ProviderID   string `json:"providerId"`
	ProviderName string `json:"providerName"`
	ID           string `json:"id"`
	Title        string `json:"title"`
	Subtitle     string `json:"subtitle"`
	Match        string `json:"match"`      // 命中的字段名，如「IP 地址」
	MatchValue   string `json:"matchValue"` // 命中的字段值
	Tag          string `json:"tag,omitempty"`
	Tone         string `json:"tone,omitempty"`
	score        int
}

type searchGroup struct {
	Key   string       `json:"key"`
	Label string       `json:"label"`
	Total int          `json:"total"`
	Items []searchItem `json:"items"`
}

// capKind 资产类资源的展示配置：标题取值顺序、副标题字段、参与打分的字段。
type capKind struct {
	Key, Label string
	Title      []string
	Sub        []string
	Fields     []search.Field
}

var capKinds = []capKind{
	{"vms", "虚拟机", []string{"name", "id"}, []string{"ips", "node"}, []search.Field{{"name", "名称"}, {"ips", "IP 地址"}, {"id", "ID"}, {"macs", "MAC 地址"}, {"instanceName", "实例名"}, {"node", "所在节点"}, {"flavor", "规格"}}},
	{"phys", "物理节点", []string{"hostname", "name", "id"}, []string{"ip", "model"}, []search.Field{{"hostname", "主机名"}, {"ip", "IP 地址"}, {"ipmiIp", "IPMI 地址"}, {"mac", "MAC 地址"}, {"serial", "序列号"}, {"model", "型号"}, {"id", "ID"}}},
	{"nodes", "计算节点", []string{"name", "hostname", "id"}, []string{"hostIp", "hypervisorType"}, []search.Field{{"name", "名称"}, {"hostname", "主机名"}, {"hostIp", "主机地址"}, {"id", "ID"}}},
	{"volumes", "云硬盘", []string{"name", "id"}, []string{"serverNames", "attachHosts"}, []search.Field{{"name", "名称"}, {"id", "ID"}, {"serverNames", "挂载虚拟机"}, {"attachHosts", "挂载节点"}, {"backend", "存储后端"}}},
	{"ports", "虚拟网卡", []string{"name", "id"}, []string{"ips", "deviceName"}, []search.Field{{"ips", "IP 地址"}, {"mac", "MAC 地址"}, {"name", "名称"}, {"deviceName", "所属虚拟机"}, {"id", "ID"}, {"bindingHost", "绑定节点"}}},
	{"pools", "集群存储", []string{"poolName", "name"}, []string{"backendName", "vendorText"}, []search.Field{{"poolName", "存储池"}, {"name", "名称"}, {"backendName", "后端名称"}, {"vendorText", "供应商"}}},
}

func pick(row map[string]any, keys []string) string {
	for _, k := range keys {
		if v := search.Str(row[k]); v != "" {
			return v
		}
	}
	return ""
}

func joinNonEmpty(row map[string]any, keys []string, sep string) string {
	var out []string
	for _, k := range keys {
		if v := search.Str(row[k]); v != "" {
			out = append(out, v)
		}
	}
	return strings.Join(out, sep)
}

// finish 排序（命中精度 → 标题自然序）并截取前 limit 条。
func finish(key, label string, items []searchItem, limit int) *searchGroup {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].score != items[j].score {
			return items[i].score < items[j].score
		}
		return strings.ToLower(items[i].Title) < strings.ToLower(items[j].Title)
	})
	g := &searchGroup{Key: key, Label: label, Total: len(items), Items: items}
	if len(items) > limit {
		g.Items = items[:limit]
	}
	return g
}

// searchGlobal GET /search?q=&limit=&providerId=：跨全部云平台搜索资源。只返回当前用户有权限查看的分组。
func (s *Server) searchGlobal(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 50 {
		limit = 6
	}
	words := search.Words(q)
	out := []*searchGroup{}
	if len(words) == 0 {
		httpx.OK(w, map[string]any{"q": q, "groups": out, "total": 0})
		return nil
	}
	ctx := r.Context()
	pg, err := s.Providers.Store.List(ctx, provider.Query{})
	if err != nil {
		return err
	}
	plats := make([]capacity.Platform, 0, len(pg.List))
	pid := strings.TrimSpace(r.URL.Query().Get("providerId")) // 可选：只在该云平台内搜索
	if pid != "" {
		kept := pg.List[:0:0]
		for _, pv := range pg.List {
			if pv.ID == pid {
				kept = append(kept, pv)
			}
		}
		pg.List = kept
	}
	for _, pv := range pg.List {
		plats = append(plats, capacity.Platform{ID: pv.ID, Name: pv.Name, EnvType: pv.EnvType, ConsoleIP: pv.ConsoleIP})
	}
	add := func(g *searchGroup) {
		if g != nil && pid != "" { // 选了云平台：告警按所属平台过滤，域名映射不属于任何平台，不返回
			if g.Key == "domain" {
				return
			}
			if g.Key == "alert" {
				kept := g.Items[:0:0]
				for _, it := range g.Items {
					if it.ProviderID == pid {
						kept = append(kept, it)
					}
				}
				g.Items, g.Total = kept, len(kept)
			}
		}
		if g != nil && g.Total > 0 {
			out = append(out, g)
		}
	}

	if p.Can("provider:view") {
		add(searchPlatforms(pg.List, words, limit))
	}
	if p.Can("capacity:view") {
		for _, k := range capKinds {
			g, err := s.searchCapacity(ctx, plats, k, words, limit)
			if err != nil {
				return err
			}
			add(g)
		}
	}
	if p.Can("monitor:view") {
		gs, err := s.searchMonitor(ctx, plats, words, limit)
		if err != nil {
			return err
		}
		for _, g := range gs {
			add(g)
		}
	}
	if p.Can("alert:view") {
		g, err := s.searchAlerts(ctx, words, limit)
		if err != nil {
			return err
		}
		add(g)
	}
	if p.Can("domain:view") {
		g, err := s.searchDomains(ctx, words, limit)
		if err != nil {
			return err
		}
		add(g)
	}
	total := 0
	for _, g := range out {
		total += g.Total
	}
	httpx.OK(w, map[string]any{"q": q, "groups": out, "total": total})
	return nil
}

func searchPlatforms(list []*provider.Provider, words []string, limit int) *searchGroup {
	fs := []search.Field{{"name", "名称"}, {"consoleIp", "控制台 IP"}, {"rootDomain", "根域名"}}
	var items []searchItem
	for _, pv := range list {
		row := map[string]any{"name": pv.Name, "consoleIp": pv.ConsoleIP, "rootDomain": pv.RootDomain}
		if !search.All(strings.ToLower(pv.Name+" "+pv.ConsoleIP+" "+pv.RootDomain), words) {
			continue
		}
		sc, lb, val := search.Score(row, words, fs)
		tone := map[string]string{"online": "success", "warning": "warning", "error": "danger"}[pv.Status]
		tag := map[string]string{"online": "在线", "warning": "告警", "error": "故障"}[pv.Status]
		items = append(items, searchItem{Group: "platform", ProviderID: pv.ID, ProviderName: pv.Name, ID: pv.ID, Title: pv.Name,
			Subtitle: pv.ConsoleIP + " · " + pv.RootDomain, Match: lb, MatchValue: val, Tag: tag, Tone: tone, score: sc})
	}
	return finish("platform", "云平台", items, limit)
}

func (s *Server) searchCapacity(ctx context.Context, plats []capacity.Platform, k capKind, words []string, limit int) (*searchGroup, error) {
	var items []searchItem
	for _, pl := range plats {
		rows, _, err := s.Capacity.Store.Rows(ctx, pl, k.Key)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			text, _ := row["_s"].(string)
			if !search.All(text, words) {
				continue
			}
			sc, lb, val := search.Score(row, words, k.Fields)
			tag, tone := search.Str(row["statusText"]), search.Str(row["statusTone"])
			if tag == "" {
				tag, tone = search.Str(row["stateText"]), search.Str(row["stateTone"])
			}
			items = append(items, searchItem{Group: k.Key, ProviderID: pl.ID, ProviderName: pl.Name, ID: search.Str(row["id"]),
				Title: pick(row, k.Title), Subtitle: joinNonEmpty(row, k.Sub, " · "), Match: lb, MatchValue: val, Tag: tag, Tone: tone, score: sc})
		}
	}
	return finish(k.Key, k.Label, items, limit), nil
}

// searchMonitor 监控中心：节点 / 磁盘 / 服务（来自各平台最近一次采集快照）。
func (s *Server) searchMonitor(ctx context.Context, plats []capacity.Platform, words []string, limit int) ([]*searchGroup, error) {
	var nodes, disks, svcs []searchItem
	nf := []search.Field{{"name", "节点名称"}, {"hostIp", "IP 地址"}}
	df := []search.Field{{"serial", "序列号"}, {"device", "设备"}, {"node", "所在节点"}, {"model", "型号"}, {"osdId", "OSD 编号"}, {"hostIp", "IP 地址"}}
	sf := []search.Field{{"name", "服务指标"}}
	for _, pl := range plats {
		sn, err := s.Monitor.Store.Snapshot(ctx, pl.ID)
		if err != nil {
			return nil, err
		}
		for _, n := range s.visibleNodes(ctx, pl, sn.Nodes) {
			if !search.All(strings.ToLower(n.Name+" "+n.HostIP), words) {
				continue
			}
			sc, lb, val := search.Score(map[string]any{"name": n.Name, "hostIp": n.HostIP}, words, nf)
			nodes = append(nodes, searchItem{Group: "monNode", ProviderID: pl.ID, ProviderName: pl.Name, ID: n.Name, Title: n.Name, Subtitle: n.HostIP, Match: lb, MatchValue: val, score: sc})
		}
		for _, d := range sn.Disks {
			if !search.All(strings.ToLower(d.Node+" "+d.HostIP+" "+d.Device+" "+d.Model+" "+d.Serial+" "+d.OsdID), words) {
				continue
			}
			row := map[string]any{"serial": d.Serial, "device": d.Device, "node": d.Node, "model": d.Model, "osdId": d.OsdID, "hostIp": d.HostIP}
			sc, lb, val := search.Score(row, words, df)
			disks = append(disks, searchItem{Group: "monDisk", ProviderID: pl.ID, ProviderName: pl.Name, ID: d.Node + "|" + d.Device, Title: d.Node + " " + d.Device,
				Subtitle: joinNonEmpty(row, []string{"model", "serial"}, " · "), Match: lb, MatchValue: val, Tag: d.Type, score: sc})
		}
		for _, sv := range sn.Services {
			if !search.All(strings.ToLower(sv.Name), words) {
				continue
			}
			sc, lb, val := search.Score(map[string]any{"name": sv.Name}, words, sf)
			tag, tone := healthTag(sv)
			svcs = append(svcs, searchItem{Group: "monService", ProviderID: pl.ID, ProviderName: pl.Name, ID: sv.Name, Title: sv.Name, Match: lb, MatchValue: val, Tag: tag, Tone: tone, score: sc})
		}
	}
	return []*searchGroup{finish("monNode", "监控 · 节点", nodes, limit), finish("monDisk", "监控 · 磁盘", disks, limit), finish("monService", "监控 · 服务", svcs, limit)}, nil
}

func healthTag(sv monitor.Service) (string, string) {
	switch {
	case sv.Healthy == nil:
		return "未采集", "default"
	case *sv.Healthy:
		return "正常", "success"
	}
	return "异常", "danger"
}

func (s *Server) searchAlerts(ctx context.Context, words []string, limit int) (*searchGroup, error) {
	// 数据库按单个关键字做 LIKE（取第一个词），其余词在内存里再过滤
	pg, err := s.Monitor.Store.ListAlerts(ctx, monitor.AlertQuery{Keyword: words[0], Page: 1, PageSize: 200, SortKey: "firedAt", SortOrder: "desc"})
	if err != nil {
		return nil, err
	}
	fs := []search.Field{{"name", "告警名称"}, {"nodeName", "对象"}, {"hostIp", "IP 地址"}, {"component", "组件"}}
	var items []searchItem
	for _, a := range pg.List {
		if !search.All(strings.ToLower(a.Name+" "+a.NameEN+" "+a.Description+" "+a.NodeName+" "+a.HostIP+" "+a.Component), words) {
			continue
		}
		row := map[string]any{"name": a.Name, "nodeName": a.NodeName, "hostIp": a.HostIP, "component": a.Component}
		sc, lb, val := search.Score(row, words, fs)
		tag, tone := "告警中", "danger"
		if a.Status == "resolved" {
			tag, tone = "已恢复", "success"
		} else if a.Severity == "warning" {
			tone = "warning"
		}
		sub := strings.TrimSpace(a.NodeName + " " + a.HostIP)
		items = append(items, searchItem{Group: "alert", ProviderID: a.ProviderID, ProviderName: a.ProviderName, ID: strconv.FormatInt(a.ID, 10), Title: a.Name, Subtitle: sub, Match: lb, MatchValue: val, Tag: tag, Tone: tone, score: sc})
	}
	// 告警中的优先于已恢复的
	sort.SliceStable(items, func(i, j int) bool { return items[i].Tag == "告警中" && items[j].Tag != "告警中" })
	total := pg.Total
	if len(words) > 1 {
		total = len(items) // 多个关键字在内存中二次过滤，总数以过滤后为准
	}
	g := &searchGroup{Key: "alert", Label: "告警", Total: total, Items: items}
	if len(items) > limit {
		g.Items = items[:limit]
	}
	return g, nil
}

func (s *Server) searchDomains(ctx context.Context, words []string, limit int) (*searchGroup, error) {
	ms, err := s.Hosts.Store.List(ctx)
	if err != nil {
		return nil, err
	}
	fs := []search.Field{{"name", "映射名称"}, {"consoleIp", "控制台 IP"}, {"hosts", "主机地址"}, {"rootDomain", "根域名"}}
	var items []searchItem
	for _, m := range ms {
		var hs []string
		for _, h := range m.Hosts {
			hs = append(hs, h.Host)
		}
		row := map[string]any{"name": m.Name, "consoleIp": m.ConsoleIP, "rootDomain": m.RootDomain, "hosts": strings.Join(hs, ",")}
		if !search.All(strings.ToLower(m.Name+" "+m.ConsoleIP+" "+m.RootDomain+" "+strings.Join(hs, " ")+" "+m.Remark), words) {
			continue
		}
		sc, lb, val := search.Score(row, words, fs)
		tag, tone := "已启用", "success"
		if !m.Enabled {
			tag, tone = "已停用", "default"
		}
		items = append(items, searchItem{Group: "domain", ID: m.ID, Title: m.Name, Subtitle: m.ConsoleIP + " · " + m.RootDomain, Match: lb, MatchValue: val, Tag: tag, Tone: tone, score: sc})
	}
	return finish("domain", "域名映射 / 主机地址", items, limit), nil
}
