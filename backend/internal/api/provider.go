package api

import (
	"bytes"
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

func providerQuery(r *http.Request, paged bool) provider.Query {
	g := r.URL.Query().Get
	q := provider.Query{Keyword: g("keyword"), EnvType: g("envType"), Status: g("status"), SortKey: g("sortKey"), SortOrder: g("sortOrder")}
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

func (s *Server) providerList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Providers.Store.List(r.Context(), providerQuery(r, true))
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

func (s *Server) providerGet(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	p, err := s.Providers.Store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	httpx.OK(w, p)
	return nil
}

func (s *Server) providerSave(update bool) authed {
	return func(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
		t0 := time.Now()
		b, err := httpx.ReadBody(r, 64<<10)
		if err != nil {
			return err
		}
		var in provider.Input
		if err := httpx.DecodeJSON(b, &in); err != nil {
			return err
		}
		var generic map[string]any
		_ = httpx.DecodeJSON(b, &generic)
		var res *provider.Provider
		action, target := "create", "平台 "+in.Name
		if update {
			action = "update"
			res, err = s.Providers.Store.Update(r.Context(), p.User.Username, r.PathValue("id"), in)
		} else {
			res, err = s.Providers.Store.Create(r.Context(), p.User.Username, in)
		}
		if res != nil {
			target = "平台 " + res.Name + "（" + res.ConsoleIP + " / " + res.RootDomain + "）"
		}
		s.rec(r, p, "provider", action, target, "/system/providers", generic, err, t0)
		if err != nil {
			return err
		}
		httpx.OK(w, res)
		return nil
	}
}

func (s *Server) providerDelete(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	old, err := s.Providers.Store.Delete(r.Context(), r.PathValue("id"))
	target := "平台 " + r.PathValue("id")
	if old != nil {
		target = "平台 " + old.Name + "（" + old.ConsoleIP + "）"
	}
	s.rec(r, p, "provider", "delete", target, "/system/providers", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, nil)
	return nil
}

func (s *Server) providerImpact(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	im, err := s.Providers.Impact(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	httpx.OK(w, im)
	return nil
}

func (s *Server) providerWriteSwitch(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 4<<10)
	if err != nil {
		return err
	}
	var in struct {
		Enabled *bool `json:"enabled"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if in.Enabled == nil {
		return httpx.Err(400, "缺少 enabled")
	}
	res, err := s.Providers.Store.SetWrite(r.Context(), p.User.Username, r.PathValue("id"), *in.Enabled)
	target := "平台 " + r.PathValue("id") + "（写操作开关）"
	if res != nil {
		state := "关闭"
		if res.WriteEnabled {
			state = "开启"
		}
		target = "平台 " + res.Name + "（写操作" + state + "）"
	}
	s.rec(r, p, "provider", "update", target, "/system/providers", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, res)
	return nil
}

// providerVerify 验证连接：body {id?, draft?}。draft 为表单草稿（新增 / 编辑中），无 draft 则验证库中已保存的平台。
func (s *Server) providerVerify(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in struct {
		ID    string          `json:"id"`
		Draft *provider.Input `json:"draft"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if in.ID == "" && in.Draft == nil {
		return httpx.Err(400, "缺少 id 或 draft")
	}
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	var res *provider.VerifyResult
	target := "验证连接"
	if in.Draft != nil {
		target += " " + in.Draft.Name
		res, err = s.Providers.VerifyDraft(ctx, in.ID, *in.Draft)
	} else {
		if sp, e := s.Providers.Store.Get(ctx, in.ID); e == nil {
			target += " " + sp.Name
		}
		res, err = s.Providers.VerifySaved(ctx, in.ID)
	}
	verr := err
	if err == nil && !res.OK {
		for _, it := range res.Items {
			if !it.OK {
				verr = httpx.Err(200, it.Label+"：未通过 — "+it.Error)
				break
			}
		}
	}
	var gen any
	if in.Draft != nil {
		gen = map[string]any{"id": in.ID, "draft": in.Draft} // Password 字段由审计统一脱敏
	} else {
		gen = map[string]any{"id": in.ID}
	}
	s.rec(r, p, "provider", "verify", target, "/system/providers", gen, verr, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, res)
	return nil
}

func (s *Server) providerSync(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	t, err := s.Providers.StartSync(r.Context(), p.User.Username, r.PathValue("id"))
	target := "同步平台 " + r.PathValue("id")
	if sp, e := s.Providers.Store.Get(r.Context(), r.PathValue("id")); e == nil {
		target = "同步平台 " + sp.Name
	}
	s.rec(r, p, "provider", "sync", target, "/system/providers", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"taskId": t.ID})
	return nil
}

func (s *Server) taskGet(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	t, err := s.Providers.GetTask(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	httpx.OK(w, t)
	return nil
}

var envLabel = map[string]string{"dev": "开发测试", "prod": "生产", "dr": "灾备"}
var statusLabel = map[string]string{"online": "在线", "warning": "部分异常", "error": "异常", "unknown": "未验证"}

func (s *Server) providerExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	q := providerQuery(r, false)
	pg, err := s.Providers.Store.List(r.Context(), q)
	if err != nil {
		return err
	}
	f := excelize.NewFile()
	sh := "平台列表"
	f.SetSheetName("Sheet1", sh)
	head := []any{"云贯标", "环境类型", "控制台IP", "根域名", "芯片架构", "节点数", "状态", "写操作", "云主机", "云硬盘", "网络", "最后同步(UTC+8)", "备注"}
	_ = f.SetSheetRow(sh, "A1", &head)
	cst := time.FixedZone("CST", 8*3600)
	for i, v := range pg.List {
		sync := "从未同步"
		if v.LastSyncAt != nil {
			sync = v.LastSyncAt.In(cst).Format("2006-01-02 15:04:05")
		}
		sw := "关闭"
		if v.WriteEnabled {
			sw = "开启"
		}
		row := []any{v.Name, envLabel[v.EnvType], v.ConsoleIP, v.RootDomain, v.Arch, v.NodeCount, statusLabel[v.Status], sw, v.Stats.VMCount, v.Stats.VolumeCount, v.Stats.NetworkCount, sync, v.Advanced.Remark}
		cell, _ := excelize.CoordinatesToCellName(1, i+2)
		_ = f.SetSheetRow(sh, cell, &row)
	}
	_ = f.SetColWidth(sh, "A", "A", 26)
	_ = f.SetColWidth(sh, "C", "D", 28)
	_ = f.SetColWidth(sh, "L", "L", 22)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return err
	}
	s.rec(r, p, "provider", "export", "导出平台列表（"+strconv.Itoa(len(pg.List))+" 条）", "/system/providers", nil, nil, t0)
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	h.Set("Content-Disposition", `attachment; filename="providers.xlsx"`)
	_, _ = w.Write(buf.Bytes())
	return nil
}
