package api

import (
	"bytes"
	"database/sql"
	"errors"
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

func cellText(v any) any {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return x
	}
	return fmt.Sprint(v)
}

// analyticsExport GET /analytics/export/opt?kind=&ignored=  导出某条优化策略的资源明细
func (s *Server) analyticsExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	if r.PathValue("kind") != "opt" {
		return httpx.Err(404, "未知的导出类型")
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	q := anQuery(r)
	pol, err := s.Analytics.St.Policy(r.Context(), q.Kind)
	if err != nil {
		return httpx.Err(404, "策略不存在")
	}
	cols := analytics.OptCols(pol.ResourceType)
	title := pol.Name
	link := "/analytics?tab=optimize&kind=" + pol.Kind
	rows, err := s.Analytics.OptRows(r.Context(), ps, q)
	if err != nil {
		return err
	}
	if len(rows) > 50000 {
		rows = rows[:50000]
	}
	if q.SortKey != "" {
		analytics.Sort(rows, q.SortKey, q.SortOrder)
	}
	f := excelize.NewFile()
	sh := strings.NewReplacer("/", "-", "\\", "-", "?", "", "*", "", "[", "", "]", "", ":", "").Replace(title)
	if r := []rune(sh); len(r) > 28 {
		sh = string(r[:28])
	}
	if sh == "" {
		sh = "优化建议"
	}
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
	_ = f.SetColWidth(sh, "A", "L", 20)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return err
	}
	s.rec(r, p, "analytics", "export", "导出优化建议「"+title+"」（"+strconv.Itoa(len(rows))+" 条）", link, nil, nil, t0)
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	h.Set("Content-Disposition", `attachment; filename="analytics-`+pol.Kind+`.xlsx"`)
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
		return httpx.Err(400, "缺少策略 kind")
	}
	pg, err := s.Analytics.OptList(r.Context(), ps, q)
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

// analyticsIgnore POST /analytics/optimize/ignore {kind, items:[{providerId,resId}], ignore:bool}
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
			ResID      string `json:"resId"`
		} `json:"items"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if len(in.Items) == 0 || len(in.Items) > 2000 {
		return httpx.Err(400, "请选择需要处理的资源（单次最多 2000 个）")
	}
	items := make([]analytics.Ignore, 0, len(in.Items))
	for _, it := range in.Items {
		items = append(items, analytics.Ignore{ProviderID: it.ProviderID, ResID: it.ResID})
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
	s.rec(r, p, "analytics", act, txt+"优化建议资源 "+strconv.Itoa(len(in.Items))+" 个", "/analytics?tab=optimize", in, err, t0)
	if err != nil {
		return policyErr(err)
	}
	httpx.OK(w, map[string]any{"count": n})
	return nil
}

func policyErr(err error) error {
	switch {
	case errors.Is(err, analytics.ErrBadKind), errors.Is(err, sql.ErrNoRows):
		return httpx.Err(404, "策略不存在")
	case errors.Is(err, analytics.ErrDupName):
		return httpx.Err(409, err.Error())
	case errors.Is(err, analytics.ErrTooMany), errors.Is(err, analytics.ErrBuiltin):
		return httpx.Err(400, err.Error())
	}
	return err
}

// analyticsPolicies GET /analytics/policies
func (s *Server) analyticsPolicies(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.PolicyList(r.Context(), ps)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) readPolicy(r *http.Request) (analytics.Policy, error) {
	var in analytics.Policy
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return in, err
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return in, err
	}
	in.Name = strings.TrimSpace(in.Name)
	return in, nil
}

// analyticsPolicyCreate POST /analytics/policies  新建自定义策略
func (s *Server) analyticsPolicyCreate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	in, err := s.readPolicy(r)
	if err != nil {
		return err
	}
	if errs := in.Validate(); len(errs) > 0 {
		return httpx.ErrData(422, 42200, "策略参数不合法", errs)
	}
	id, err := s.Analytics.St.CreatePolicy(r.Context(), in, p.User.Username)
	s.rec(r, p, "analytics", "policy_create", "创建优化策略 "+in.Name, "/analytics?tab=policy", in, err, t0)
	if err != nil {
		return policyErr(err)
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.PolicyList(r.Context(), ps)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"kind": id, "policies": out})
	return nil
}

// analyticsPolicyUpdate PUT /analytics/policies/{kind}
func (s *Server) analyticsPolicyUpdate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	in, err := s.readPolicy(r)
	if err != nil {
		return err
	}
	in.Kind = r.PathValue("kind")
	old, err := s.Analytics.St.Policy(r.Context(), in.Kind)
	if err != nil {
		return policyErr(err)
	}
	in.ResourceType = old.ResourceType // 资源类型创建后不可修改
	if errs := in.Validate(); len(errs) > 0 {
		return httpx.ErrData(422, 42200, "策略参数不合法", errs)
	}
	if s.Analytics.St.NameTaken(r.Context(), in.Name, in.Kind) {
		return httpx.Err(409, analytics.ErrDupName.Error())
	}
	err = s.Analytics.St.SavePolicy(r.Context(), in, p.User.Username)
	s.rec(r, p, "analytics", "policy_update", "修改优化策略 "+in.Name, "/analytics?tab=policy", in, err, t0)
	if err != nil {
		return policyErr(err)
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.PolicyList(r.Context(), ps)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// analyticsPolicyDelete DELETE /analytics/policies/{kind}  仅自定义策略可删除
func (s *Server) analyticsPolicyDelete(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	kind := r.PathValue("kind")
	old, perr := s.Analytics.St.Policy(r.Context(), kind)
	if perr != nil {
		return policyErr(perr)
	}
	err := s.Analytics.St.DeletePolicy(r.Context(), kind)
	s.rec(r, p, "analytics", "policy_delete", "删除优化策略 "+old.Name, "/analytics?tab=policy", map[string]string{"kind": kind}, err, t0)
	if err != nil {
		return policyErr(err)
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.PolicyList(r.Context(), ps)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// analyticsResolve GET /analytics/resolve?resourceType=&keyword=  按名称 / ID 解析资源（忽略项添加）
func (s *Server) analyticsResolve(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	g := r.URL.Query().Get
	out, err := s.Analytics.ResolveRes(r.Context(), ps, g("resourceType"), g("keyword"))
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// analyticsPolicyIgnores GET /analytics/policies/{kind}/ignores
func (s *Server) analyticsPolicyIgnores(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	out, err := s.Analytics.IgnoreList(r.Context(), ps, r.PathValue("kind"))
	if err != nil {
		return policyErr(err)
	}
	httpx.OK(w, out)
	return nil
}
