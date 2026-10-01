package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

func (s *Server) capacityOverview(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	plats, err := s.Capacity.Platforms(r.Context())
	if err != nil {
		return err
	}
	ov, err := s.Capacity.Store.Overview(r.Context(), plats)
	if err != nil {
		return err
	}
	httpx.OK(w, ov)
	return nil
}

// capacityList GET /capacity/{kind}?keyword=&providerId=&status=&sortKey=&sortOrder=&page=&pageSize=
// 全部平台聚合：服务端搜索（含接口返回的全部字段）+ 排序 + 分页。
func (s *Server) capacityList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	kind := r.PathValue("kind")
	if _, ok := capacity.Kinds[kind]; !ok {
		return httpx.Err(404, "不支持的容量类型："+kind)
	}
	plats, err := s.Capacity.Platforms(r.Context())
	if err != nil {
		return err
	}
	g := r.URL.Query().Get
	q := capacity.Query{Kind: kind, Keyword: g("keyword"), ProviderID: g("providerId"), Status: g("status"), SortKey: g("sortKey"), SortOrder: g("sortOrder")}
	q.Page, _ = strconv.Atoi(g("page"))
	q.PageSize, _ = strconv.Atoi(g("pageSize"))
	pg, err := s.Capacity.Store.Search(r.Context(), plats, q)
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

// capacityDetail GET /capacity/{kind}/{providerId}/{id}：单条资源的完整信息（含接口返回的原始 JSON）。
func (s *Server) capacityDetail(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	kind, pid, id := r.PathValue("kind"), r.PathValue("providerId"), r.PathValue("id")
	p, err := s.Providers.Store.Get(r.Context(), pid)
	if err != nil {
		return err
	}
	row, ok, err := s.Capacity.Store.Detail(r.Context(), capacity.Platform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP}, kind, id)
	if err != nil {
		return err
	}
	if !ok {
		return httpx.Err(404, "资源不存在或已被删除，请刷新后重试")
	}
	httpx.OK(w, row)
	return nil
}

// capacityCollect POST /capacity/collect {providerId?}：不指定平台时依次采集全部平台。失败也返回 200 + 状态，由前端展示。
func (s *Server) capacityCollect(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	id := r.URL.Query().Get("providerId")
	ids := []string{id}
	target := "立即采集全部平台的容量数据"
	if id == "" {
		var err error
		if ids, err = s.Providers.ListPlatformIDs(r.Context()); err != nil {
			return err
		}
	} else if pv, e := s.Providers.Store.Get(r.Context(), id); e == nil {
		target = "立即采集平台 " + pv.Name + " 的容量数据"
	}
	type one struct {
		ProviderID string `json:"providerId"`
		*capacity.Meta
		Fail string `json:"fail,omitempty"`
	}
	out := make([]one, 0, len(ids))
	var lastErr error
	for _, pid := range ids {
		mt, err := s.Capacity.Refresh(r.Context(), pid)
		if err != nil {
			lastErr = err
			out = append(out, one{ProviderID: pid, Fail: err.Error()})
			continue
		}
		out = append(out, one{ProviderID: pid, Meta: mt})
	}
	if lastErr == nil {
		for _, o := range out {
			if o.Meta != nil && o.Error != "" && !o.OK {
				lastErr = httpx.Err(502, o.Error)
			}
		}
	}
	s.rec(r, p, "capacity", "collect", target, "/capacity", nil, lastErr, t0)
	httpx.OK(w, out)
	return nil
}
