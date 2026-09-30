// Package retention 按「系统配置 → 数据保留」的天数真实清理过期数据。
package retention

import (
	"context"
	"database/sql"
	"log"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

type Job struct {
	db   *sql.DB
	cfg  *settings.Store
	auth *auth.Service
}

func New(db *sql.DB, cfg *settings.Store, a *auth.Service) *Job {
	return &Job{db: db, cfg: cfg, auth: a}
}

type Result struct {
	Audit, Metric, Inspection, Alert int64
}

func (j *Job) del(ctx context.Context, table, col string, days int) int64 {
	if days <= 0 {
		return 0
	}
	cut := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)
	var total int64
	// 分批删除，避免大事务长时间锁表
	for {
		res, err := j.db.ExecContext(ctx, "DELETE FROM "+table+" WHERE "+col+" < ? LIMIT 5000", cut)
		if err != nil {
			log.Printf("retention: 清理 %s 失败: %v", table, err)
			return total
		}
		n, _ := res.RowsAffected()
		total += n
		if n < 5000 || ctx.Err() != nil {
			return total
		}
	}
}

// RunOnce 读取最新保留策略并清理；同时清理过期会话。
func (j *Job) RunOnce(ctx context.Context) (Result, error) {
	r, err := j.cfg.Retention(ctx)
	if err != nil {
		return Result{}, err
	}
	out := Result{
		Audit:      j.del(ctx, "audit_logs", "occurred_at", r.AuditDays),
		Metric:     j.del(ctx, "metric_samples", "sampled_at", r.MetricDays),
		Inspection: j.del(ctx, "inspection_results", "finished_at", r.InspectionDays),
		Alert:      j.del(ctx, "alert_events", "fired_at", r.AlertDays),
	}
	j.auth.PurgeSessions(ctx)
	return out, nil
}

// Start 启动后立即执行一次，之后每小时一次，直到 ctx 结束。
func (j *Job) Start(ctx context.Context) {
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			if res, err := j.RunOnce(ctx); err != nil {
				log.Printf("retention: %v", err)
			} else if res != (Result{}) {
				log.Printf("retention: 已清理 审计=%d 指标=%d 巡检=%d 告警=%d", res.Audit, res.Metric, res.Inspection, res.Alert)
			}
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			}
		}
	}()
}
