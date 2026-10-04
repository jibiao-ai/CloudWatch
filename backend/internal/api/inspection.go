package api

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/inspection"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

func inspID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, httpx.Err(400, "报告编号无效")
	}
	return id, nil
}

func inspQuery(r *http.Request) inspection.ListQuery {
	g := func(k string) string { return strings.TrimSpace(r.URL.Query().Get(k)) }
	q := inspection.ListQuery{Keyword: g("keyword"), Overall: g("overall"), Trigger: g("trigger"), TaskID: g("taskId"), SortKey: g("sortKey"), SortOrder: g("sortOrder")}
	q.Page, _ = strconv.Atoi(g("page"))
	q.PageSize, _ = strconv.Atoi(g("pageSize"))
	day := func(v string, end bool) time.Time {
		t, err := time.ParseInLocation("2006-01-02", v, analytics.CST)
		if err != nil {
			return time.Time{}
		}
		if end {
			t = t.AddDate(0, 0, 1)
		}
		return t.UTC()
	}
	q.From, q.To = day(g("from"), false), day(g("to"), true)
	return q
}

// inspectionList GET /inspection/reports
func (s *Server) inspectionList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Inspection.Store.List(r.Context(), inspQuery(r))
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

// inspectionGet GET /inspection/reports/{id}
func (s *Server) inspectionGet(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id, err := inspID(r)
	if err != nil {
		return err
	}
	rep, err := s.Inspection.Store.Get(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.OK(w, rep)
	return nil
}

// inspectionRun POST /inspection/run  {providerIds: []}
func (s *Server) inspectionRun(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	raw, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in struct {
		ProviderIDs []string `json:"providerIds"`
	}
	if len(strings.TrimSpace(string(raw))) > 0 {
		if err := httpx.DecodeJSON(raw, &in); err != nil {
			return err
		}
	}
	t, err := s.Inspection.Run(r.Context(), inspection.ParseIDs(in.ProviderIDs), "manual", p.User.Username, p.User.Name)
	scope := "全部云平台"
	if n := len(inspection.ParseIDs(in.ProviderIDs)); n > 0 {
		scope = strconv.Itoa(n) + " 个云平台"
	}
	s.rec(r, p, "inspection", "run", "发起自动巡检（"+scope+"）", "/inspection", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"taskId": t.ID})
	return nil
}

// inspectionTask GET /inspection/tasks/{id}
func (s *Server) inspectionTask(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	t, err := s.Inspection.GetTask(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	httpx.OK(w, t)
	return nil
}

// inspectionDelete DELETE /inspection/reports/{id}
func (s *Server) inspectionDelete(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	id, err := inspID(r)
	if err != nil {
		return err
	}
	title, err := s.Inspection.Store.Delete(r.Context(), id)
	s.rec(r, p, "inspection", "delete", "删除巡检报告「"+title+"」", "/inspection", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"id": id})
	return nil
}

// inspectionConfig GET /inspection/config
func (s *Server) inspectionConfig(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	httpx.OK(w, map[string]any{
		"config": s.Inspection.Store.Config(r.Context()), "defaults": inspection.DefaultConfig(),
		"catalog": inspection.Catalog, "groups": inspection.Groups,
	})
	return nil
}

// inspectionSaveConfig PUT /inspection/config
func (s *Server) inspectionSaveConfig(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	raw, err := httpx.ReadBody(r, 256<<10)
	if err != nil {
		return err
	}
	var in inspection.Config
	if err := httpx.DecodeJSON(raw, &in); err != nil {
		return err
	}
	out, err := s.Inspection.Store.SaveConfig(r.Context(), in, p.User.Username)
	s.rec(r, p, "inspection", "config", "修改巡检设置（阈值 / 定时 / 检查项）", "/inspection", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// brand 取品牌信息与 Logo（Word 封面 / 页眉使用）。
func (s *Server) inspectionBrand(r *http.Request) inspection.Brand {
	b := inspection.Brand{Name: "CloudWatch"}
	pub, err := s.Settings.Public(r.Context())
	if err != nil || pub == nil {
		return b
	}
	if v := strings.TrimSpace(pub.Basic.PlatformName); v != "" {
		b.Name = v
	}
	b.Subtitle, b.Copyright = strings.TrimSpace(pub.Basic.Subtitle), strings.TrimSpace(pub.Basic.Copyright)
	if id, ok := strings.CutPrefix(pub.Brand.LogoURL, "/api/assets/"); ok && id != "" {
		a, err := s.Settings.GetAsset(r.Context(), id)
		if err != nil && !errors.Is(err, settings.ErrNotFound) {
			return b
		}
		if err == nil && a != nil {
			b.Logo, b.LogoMime = a.Data, a.Mime
		}
	}
	return b
}

// inspectionExport GET /inspection/reports/{id}/export  导出 Word
func (s *Server) inspectionExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	id, err := inspID(r)
	if err != nil {
		return err
	}
	rep, err := s.Inspection.Store.Get(r.Context(), id)
	if err != nil {
		return err
	}
	data, err := inspection.BuildDocx(rep, s.inspectionBrand(r))
	s.rec(r, p, "inspection", "export", "导出巡检报告「"+rep.Title+"」（Word）", "/inspection", nil, err, t0)
	if err != nil {
		return err
	}
	name := "云平台自动巡检报告_" + rep.FinishedAt.In(analytics.CST).Format("20060102_1504") + ".docx"
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	h.Set("Content-Disposition", `attachment; filename="inspection-report-`+strconv.FormatInt(id, 10)+`.docx"; filename*=UTF-8''`+url.PathEscape(name))
	h.Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
	return nil
}
