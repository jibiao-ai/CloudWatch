package api

import (
	"net/http"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
	"github.com/jibiao-ai/cloudwatch/internal/topology"
)

func (s *Server) topo() *topology.Builder {
	return &topology.Builder{Capacity: s.Capacity.Store, Monitor: s.Monitor.Store}
}

// topologyOverview GET /topology/overview：全部平台的分层摘要（平台管理 + 资产管理 + 监控中心 + 告警中心）。
func (s *Server) topologyOverview(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Providers.Store.List(r.Context(), provider.Query{SortKey: "name", SortOrder: "asc"})
	if err != nil {
		return err
	}
	out, err := s.topo().Overview(r.Context(), pg.List)
	if err != nil {
		return err
	}
	httpx.OK(w, out)
	return nil
}

// topologyGraph GET /topology/{providerId}：单个平台的完整资源拓扑（节点 / 关系 / 告警）。
func (s *Server) topologyGraph(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	p, err := s.Providers.Store.Get(r.Context(), r.PathValue("providerId"))
	if err != nil {
		return err
	}
	gr, err := s.topo().Build(r.Context(), p)
	if err != nil {
		return err
	}
	httpx.OK(w, gr)
	return nil
}
