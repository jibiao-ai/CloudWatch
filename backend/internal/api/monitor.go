package api

import (
	"context"
	"net/http"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

// providerBrief 监控页顶部平台选择器所需的精简信息 + 最近一次采集状态。
type monitorPlatform struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	EnvType     string           `json:"envType"`
	ConsoleIP   string           `json:"consoleIp"`
	CollectedAt *time.Time       `json:"collectedAt"`
	OK          bool             `json:"ok"`
	Error       string           `json:"error"`
	AlertFiring int              `json:"alertFiring"`
	Summary     *monitor.Summary `json:"summary"`
}

// monitorOverview 所有平台的概览（每个平台最近一次采集的摘要）。
func (s *Server) monitorOverview(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Providers.Store.List(r.Context(), providerQuery(r, false))
	if err != nil {
		return err
	}
	out := make([]monitorPlatform, 0, len(pg.List))
	for _, p := range pg.List {
		sn, err := s.Monitor.Store.Snapshot(r.Context(), p.ID)
		if err != nil {
			return err
		}
		out = append(out, monitorPlatform{ID: p.ID, Name: p.Name, EnvType: p.EnvType, ConsoleIP: p.ConsoleIP,
			CollectedAt: sn.CollectedAt, OK: sn.OK, Error: sn.Error, AlertFiring: sn.AlertFiring, Summary: sn.Summary})
	}
	httpx.OK(w, out)
	return nil
}

func (s *Server) monitorSnapshot(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id := r.PathValue("id")
	if _, err := s.Providers.Store.Get(r.Context(), id); err != nil {
		return err
	}
	sn, err := s.Monitor.Store.Snapshot(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.OK(w, sn)
	return nil
}

// monitorCollect 立即采集一次（同步执行，通常数秒）。采集失败也返回 200 + 快照（ok=false，带错误与各接口明细）。
func (s *Server) monitorCollect(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	id := r.PathValue("id")
	sn, err := s.Monitor.Refresh(r.Context(), id)
	target := "立即采集 " + id
	if pv, e := s.Providers.Store.Get(r.Context(), id); e == nil {
		target = "立即采集平台 " + pv.Name + " 的性能指标"
	}
	if err == nil && sn != nil && !sn.OK {
		err = httpx.Err(502, sn.Error)
	}
	s.rec(r, p, "monitor", "collect", target, "/monitor", nil, err, t0)
	if sn != nil {
		httpx.OK(w, sn) // 失败时仍返回快照，前端据此展示错误与步骤明细
		return nil
	}
	return err
}

var trendRanges = map[string]time.Duration{"1h": time.Hour, "6h": 6 * time.Hour, "24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour}

var trendMetrics = map[string]bool{"vcpu_percent": true, "memory_percent": true, "storage_used_percent": true, "storage_used_bytes": true,
	"storage_total_bytes": true, "iops_read": true, "iops_write": true, "vm_running": true, "vm_error": true, "vm_shutdown": true,
	"node_cpu_percent": true, "node_mem_percent": true, "node_net_rx": true, "node_net_tx": true, "node_disk_io": true, "node_disk_latency": true}

// monitorTrend GET /monitor/{id}/trend?metric=&target=&range=
func (s *Server) monitorTrend(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	q := r.URL.Query()
	metric := q.Get("metric")
	if !trendMetrics[metric] {
		return httpx.Err(400, "不支持的指标："+metric)
	}
	d, ok := trendRanges[q.Get("range")]
	if !ok {
		d = 6 * time.Hour
	}
	pts, err := s.Monitor.Store.Trend(r.Context(), r.PathValue("id"), metric, q.Get("target"), time.Now().Add(-d), 240)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"metric": metric, "target": q.Get("target"), "points": pts})
	return nil
}

// monitorVMMetrics GET /monitor/{id}/vms/{vmId}/metrics?range= —— 云主机详情：实时向 Gnocchi 取 CPU / 内存 / 磁盘读写速率曲线。
func (s *Server) monitorVMMetrics(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id := r.PathValue("id")
	if _, err := s.Providers.Store.Get(r.Context(), id); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()
	m, err := s.Monitor.VMMetrics(ctx, id, r.PathValue("vmId"), r.URL.Query().Get("range"))
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"vmId": r.PathValue("vmId"), "series": m})
	return nil
}

// monitorHosts GET /monitor/{id}/hosts  监控中心「宿主机」：分配率（Nova 超分配）+ 使用率（监控实时）
func (s *Server) monitorHosts(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id := r.PathValue("id")
	if _, err := s.Providers.Store.Get(r.Context(), id); err != nil {
		return err
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	rows, err := s.Analytics.HostRows(r.Context(), ps, id)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"list": rows})
	return nil
}

// monitorPools GET /monitor/{id}/pools  监控中心「集群存储」：存储后端容量 / 分配率 / 使用率
func (s *Server) monitorPools(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id := r.PathValue("id")
	if _, err := s.Providers.Store.Get(r.Context(), id); err != nil {
		return err
	}
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	rows, err := s.Analytics.PoolRows(r.Context(), ps, id)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"list": rows})
	return nil
}

// monitorVMUsage GET /monitor/{id}/vm-usage  各云主机近 30 天 CPU / 内存平均与最大使用率（键为云主机 ID）
func (s *Server) monitorVMUsage(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	id := r.PathValue("id")
	if _, err := s.Providers.Store.Get(r.Context(), id); err != nil {
		return err
	}
	m, err := s.Analytics.VMUsage(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"days": analytics.VMUsageDays, "usage": m})
	return nil
}
