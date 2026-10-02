package api

import (
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

func (s *Server) plats(r *http.Request) ([]capacity.Platform, error) {
	return s.Capacity.Platforms(r.Context())
}

func anFilter(r *http.Request) analytics.Filter {
	g := func(k string) string { return strings.TrimSpace(r.URL.Query().Get(k)) }
	return analytics.Filter{ProviderID: g("providerId"), Cluster: g("cluster"), Host: g("host"), Pool: g("pool")}
}

func anQuery(r *http.Request) analytics.ListQuery {
	g := func(k string) string { return strings.TrimSpace(r.URL.Query().Get(k)) }
	q := analytics.ListQuery{Field: g("field"), Keyword: g("keyword"), SortKey: g("sortKey"), SortOrder: g("sortOrder"), Filter: anFilter(r), Kind: g("kind"), Ignored: g("ignored")}
	q.Page, _ = strconv.Atoi(g("page"))
	q.PageSize, _ = strconv.Atoi(g("pageSize"))
	return q
}

// analyticsOverview GET /analytics/overview
func (s *Server) analyticsOverview(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	o, err := s.Analytics.Overview(r.Context(), ps)
	if err != nil {
		return err
	}
	httpx.OK(w, o)
	return nil
}

// analyticsTrend GET /analytics/trend?kind=vm|disk&range=7d|30d|180d|365d&providerId=&unit=
func (s *Server) analyticsTrend(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	g := r.URL.Query().Get
	out, err := s.Analytics.Trend(r.Context(), ps, g("kind"), g("range"), g("providerId"), g("unit"))
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) analyticsBase(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.Base(r.Context(), ps, anFilter(r))
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) analyticsBaseBands(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	from, to := analytics.ParseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	out, err := s.Analytics.BaseBands(r.Context(), ps, anFilter(r), r.URL.Query().Get("metric"), from, to)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) analyticsVM(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.VMAnalysis(r.Context(), ps, anFilter(r))
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) analyticsVMBands(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	from, to := analytics.ParseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	out, err := s.Analytics.VMBands(r.Context(), ps, anFilter(r), r.URL.Query().Get("metric") == "mem", from, to)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) analyticsDisk(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.DiskAnalysis(r.Context(), ps, r.URL.Query().Get("providerId"), r.URL.Query().Get("unit"))
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

type rowsFn func(r *http.Request, ps []capacity.Platform, q analytics.ListQuery) ([]map[string]any, error)

func (s *Server) rowsFor(kind string) (rowsFn, []analytics.Col, string) {
	e := s.Analytics
	switch kind {
	case "hosts":
		return func(r *http.Request, ps []capacity.Platform, q analytics.ListQuery) ([]map[string]any, error) {
			return e.HostRows(r.Context(), ps, q)
		}, analytics.HostCols, "宿主机明细"
	case "pools":
		return func(r *http.Request, ps []capacity.Platform, q analytics.ListQuery) ([]map[string]any, error) {
			return e.PoolRows(r.Context(), ps, q)
		}, analytics.PoolCols, "存储器明细"
	case "vms":
		return func(r *http.Request, ps []capacity.Platform, q analytics.ListQuery) ([]map[string]any, error) {
			return e.VMRows(r.Context(), ps, q)
		}, analytics.VMCols, "云主机明细"
	case "disks":
		return func(r *http.Request, ps []capacity.Platform, q analytics.ListQuery) ([]map[string]any, error) {
			return e.DiskRows(r.Context(), ps, q)
		}, analytics.DiskCols, "磁盘明细"
	}
	return nil, nil, ""
}

// analyticsList GET /analytics/list/{kind}  kind: hosts | pools | vms | disks
func (s *Server) analyticsList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	fn, _, _ := s.rowsFor(r.PathValue("kind"))
	if fn == nil {
		return httpx.Err(404, "未知的明细类型")
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	q := anQuery(r)
	rows, err := fn(r, ps, q)
	if err != nil {
		return err
	}
	httpx.OK(w, analytics.Paginate(rows, q))
	return nil
}

func cellText(v any) any {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return x
	}
	return fmt.Sprint(v)
}

// analyticsExport GET /analytics/export/{kind}  kind: hosts | pools | vms | disks | opt
func (s *Server) analyticsExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	kind := r.PathValue("kind")
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	q := anQuery(r)
	var rows []map[string]any
	var cols []analytics.Col
	var title, link string
	if kind == "opt" {
		cols = []analytics.Col{{Key: "name", Title: "名称"}, {Key: "platform", Title: "所属云平台"}, {Key: "ips", Title: "IP地址"}, {Key: "flavor", Title: "实例规格"},
			{Key: "reason", Title: "建议原因"}, {Key: "cpuAvg", Title: "CPU平均使用率"}, {Key: "memAvg", Title: "内存平均使用率"}, {Key: "writeAvg", Title: "写I/O平均速率(KiB/s)"}, {Key: "shutdownDays", Title: "持续关机(天)"}}
		title, link = "云主机优化建议", "/analytics?tab=optimize"
		if rows, err = s.Analytics.OptRows(r.Context(), ps, q); err != nil {
			return err
		}
	} else {
		fn, c, t := s.rowsFor(kind)
		if fn == nil {
			return httpx.Err(404, "未知的明细类型")
		}
		cols, title = c, t
		link = map[string]string{"hosts": "/analytics?tab=base", "pools": "/analytics?tab=base", "vms": "/analytics?tab=vm", "disks": "/analytics?tab=disk"}[kind]
		if rows, err = fn(r, ps, q); err != nil {
			return err
		}
	}
	if len(rows) > 50000 {
		rows = rows[:50000]
	}
	if q.SortKey != "" {
		analytics.Sort(rows, q.SortKey, q.SortOrder)
	}
	f := excelize.NewFile()
	sh := title
	f.SetSheetName("Sheet1", sh)
	head := make([]any, len(cols))
	for i, c := range cols {
		head[i] = c.Title
	}
	_ = f.SetSheetRow(sh, "A1", &head)
	for i, row := range rows {
		line := make([]any, len(cols))
		for j, c := range cols {
			line[j] = cellText(row[c.Key])
		}
		cell, _ := excelize.CoordinatesToCellName(1, i+2)
		_ = f.SetSheetRow(sh, cell, &line)
	}
	_ = f.SetColWidth(sh, "A", "K", 20)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return err
	}
	s.rec(r, p, "analytics", "export", "导出"+title+"（"+strconv.Itoa(len(rows))+" 条）", link, nil, nil, t0)
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	h.Set("Content-Disposition", `attachment; filename="analytics-`+kind+`.xlsx"`)
	_, _ = w.Write(buf.Bytes())
	return nil
}

// analyticsOptSummary GET /analytics/optimize/summary
func (s *Server) analyticsOptSummary(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.Suggestions(r.Context(), ps)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// analyticsOptList GET /analytics/optimize/list?kind=&ignored=1
func (s *Server) analyticsOptList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	q := anQuery(r)
	if q.Kind == "" {
		q.Kind = analytics.Kinds[0]
	}
	pg, err := s.Analytics.OptList(r.Context(), ps, q)
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

// analyticsIgnore POST /analytics/optimize/ignore {kind, items:[{providerId,vmId}], ignore:bool}
func (s *Server) analyticsIgnore(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 256<<10)
	if err != nil {
		return err
	}
	var in struct {
		Kind   string `json:"kind"`
		Ignore bool   `json:"ignore"`
		Items  []struct {
			ProviderID string `json:"providerId"`
			VMID       string `json:"vmId"`
		} `json:"items"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if len(in.Items) == 0 || len(in.Items) > 2000 {
		return httpx.Err(400, "请选择需要处理的云主机（单次最多 2000 台）")
	}
	items := make([]analytics.Ignore, 0, len(in.Items))
	for _, it := range in.Items {
		items = append(items, analytics.Ignore{ProviderID: it.ProviderID, VMID: it.VMID})
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	n, err := s.Analytics.SetIgnore(r.Context(), ps, in.Kind, items, in.Ignore, p.User.Username)
	act, txt := "ignore", "忽略"
	if !in.Ignore {
		act, txt = "unignore", "取消忽略"
	}
	s.rec(r, p, "analytics", act, txt+"优化建议 "+strconv.Itoa(len(in.Items))+" 台", "/analytics?tab=optimize", in, err, t0)
	if err != nil {
		if strings.Contains(err.Error(), "不合法") {
			return httpx.Err(400, err.Error())
		}
		return err
	}
	httpx.OK(w, map[string]any{"count": n})
	return nil
}

// analyticsPolicies GET /analytics/policies
func (s *Server) analyticsPolicies(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	out, err := s.Analytics.PolicyList(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// analyticsPolicyUpdate PUT /analytics/policies/{kind}
func (s *Server) analyticsPolicyUpdate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in analytics.Policy
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	in.Kind = r.PathValue("kind")
	if !analytics.IsKind(in.Kind) {
		return httpx.Err(404, "策略不存在")
	}
	if errs := in.Validate(); len(errs) > 0 {
		return httpx.ErrData(422, 42200, "策略参数不合法", errs)
	}
	err = s.Analytics.St.SavePolicy(r.Context(), in, p.User.Username)
	s.rec(r, p, "analytics", "policy_update", "修改优化策略 "+in.Name, "/analytics/policy", in, err, t0)
	if err != nil {
		return err
	}
	out, err := s.Analytics.PolicyList(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}
