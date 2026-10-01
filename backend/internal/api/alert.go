package api

import (
	"bytes"
	"net/http"
	"strconv"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

func parseDay(s string, end bool) time.Time {
	if s == "" {
		return time.Time{}
	}
	cst := time.FixedZone("CST", 8*3600)
	t, err := time.ParseInLocation("2006-01-02", s, cst)
	if err != nil {
		return time.Time{}
	}
	if end {
		t = t.Add(24*time.Hour - time.Millisecond)
	}
	return t.UTC()
}

func alertQuery(r *http.Request, paged bool) monitor.AlertQuery {
	g := r.URL.Query().Get
	q := monitor.AlertQuery{Keyword: g("keyword"), Severity: g("severity"), Status: g("status"), Type: g("type"), ProviderID: g("providerId"), Acked: g("acked"),
		From: parseDay(g("from"), false), To: parseDay(g("to"), true), SortKey: g("sortKey"), SortOrder: g("sortOrder")}
	if paged {
		q.Page, _ = strconv.Atoi(g("page"))
		q.PageSize, _ = strconv.Atoi(g("pageSize"))
		if q.Page < 1 {
			q.Page = 1
		}
		if q.PageSize < 1 || q.PageSize > 200 {
			q.PageSize = 10
		}
	}
	return q
}

func (s *Server) alertList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Monitor.Store.ListAlerts(r.Context(), alertQuery(r, true))
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

func (s *Server) alertStats(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	st, err := s.Monitor.Store.Stats(r.Context(), r.URL.Query().Get("providerId"))
	if err != nil {
		return err
	}
	httpx.OK(w, st)
	return nil
}

func (s *Server) alertGet(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return httpx.Err(400, "告警 ID 不合法")
	}
	a, err := s.Monitor.Store.GetAlert(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.OK(w, a)
	return nil
}

// alertAck POST /alerts/ack {ids:[...]}：单条与批量共用。
func (s *Server) alertAck(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in struct {
		IDs []int64 `json:"ids"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	n, err := s.Monitor.Store.Ack(r.Context(), p.User.Username, in.IDs)
	s.rec(r, p, "alert", "ack", "确认告警 "+strconv.Itoa(len(in.IDs))+" 条", "/alerts", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"acked": n})
	return nil
}

// alertSync POST /alerts/sync {providerId?}：不传则同步全部平台。
func (s *Server) alertSync(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 4<<10)
	if err != nil {
		return err
	}
	var in struct {
		ProviderID string `json:"providerId"`
	}
	if len(bytes.TrimSpace(b)) > 0 {
		if err := httpx.DecodeJSON(b, &in); err != nil {
			return err
		}
	}
	ids := []string{in.ProviderID}
	if in.ProviderID == "" {
		if ids, err = s.Providers.ListPlatformIDs(r.Context()); err != nil {
			return err
		}
	}
	type result struct {
		ProviderID string `json:"providerId"`
		OK         bool   `json:"ok"`
		Error      string `json:"error,omitempty"`
	}
	res := make([]result, 0, len(ids))
	failed := 0
	for _, id := range ids {
		_, e := s.Monitor.SyncAlerts(r.Context(), id)
		x := result{ProviderID: id, OK: e == nil}
		if e != nil {
			x.Error, failed = e.Error(), failed+1
		}
		res = append(res, x)
	}
	var aerr error
	if failed > 0 && failed == len(ids) {
		aerr = httpx.Err(502, "告警同步失败："+res[0].Error)
	}
	s.rec(r, p, "alert", "sync", "同步告警（"+strconv.Itoa(len(ids))+" 个平台，失败 "+strconv.Itoa(failed)+"）", "/alerts", in, aerr, t0)
	if aerr != nil {
		return aerr
	}
	httpx.OK(w, map[string]any{"results": res, "failed": failed})
	return nil
}

var sevCN = map[string]string{"critical": "严重", "warning": "警告", "info": "提示"}
var typeCN = map[string]string{"service": "服务", "storage": "存储", "log": "日志", "host": "主机", "others": "其他"}
var stCN = map[string]string{"firing": "告警中", "resolved": "已恢复"}

func (s *Server) alertExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	pg, err := s.Monitor.Store.ListAlerts(r.Context(), alertQuery(r, false))
	if err != nil {
		return err
	}
	f := excelize.NewFile()
	sh := "告警列表"
	f.SetSheetName("Sheet1", sh)
	head := []any{"级别", "状态", "告警名称", "类型", "所属平台", "节点", "节点IP", "组件", "项目", "详情", "解决方案", "触发时间(UTC+8)", "恢复时间(UTC+8)", "已确认", "确认人"}
	_ = f.SetSheetRow(sh, "A1", &head)
	cst := time.FixedZone("CST", 8*3600)
	ft := func(t *time.Time) string {
		if t == nil {
			return ""
		}
		return t.In(cst).Format("2006-01-02 15:04:05")
	}
	for i, a := range pg.List {
		ack := "否"
		if a.Acked {
			ack = "是"
		}
		row := []any{sevCN[a.Severity], stCN[a.Status], a.Name, typeCN[a.Type], a.ProviderName, a.NodeName, a.HostIP, a.Component, a.Project,
			firstText(a.Summary, a.Description), a.Solution, a.FiredAt.In(cst).Format("2006-01-02 15:04:05"), ft(a.ResolvedAt), ack, a.AckedBy}
		cell, _ := excelize.CoordinatesToCellName(1, i+2)
		_ = f.SetSheetRow(sh, cell, &row)
	}
	_ = f.SetColWidth(sh, "C", "C", 32)
	_ = f.SetColWidth(sh, "E", "I", 18)
	_ = f.SetColWidth(sh, "J", "K", 48)
	_ = f.SetColWidth(sh, "L", "M", 21)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return err
	}
	s.rec(r, p, "alert", "export", "导出告警（"+strconv.Itoa(len(pg.List))+" 条）", "/alerts", nil, nil, t0)
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	h.Set("Content-Disposition", `attachment; filename="alerts.xlsx"`)
	_, _ = w.Write(buf.Bytes())
	return nil
}

func firstText(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}
