package monitor

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Store 监控数据的持久化：快照（monitor_snapshots）与历史样本（metric_samples）。
type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func js(v any) string { b, _ := json.Marshal(v); return string(b) }

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

// SaveSnapshot 保存一次采集结果。失败时只更新状态与错误，保留上一次成功的数据，页面仍可展示旧数据并标注「采集失败」。
func (s *Store) SaveSnapshot(ctx context.Context, id string, res *Result, errMsg string, took time.Duration) error {
	now := time.Now().UTC()
	if res == nil || errMsg != "" {
		_, err := s.db.ExecContext(ctx, `INSERT INTO monitor_snapshots(provider_id,ok,error,duration_ms,steps,last_try_at) VALUES(?,0,?,?,?,?)
ON DUPLICATE KEY UPDATE ok=0,error=VALUES(error),duration_ms=VALUES(duration_ms),steps=VALUES(steps),last_try_at=VALUES(last_try_at)`,
			id, trunc(errMsg, 480), took.Milliseconds(), js(stepsOf(res)), now)
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO monitor_snapshots(provider_id,collected_at,ok,error,duration_ms,summary,nodes,disks,services,storage,steps,last_try_at)
VALUES(?,?,1,'',?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE collected_at=VALUES(collected_at),ok=1,error='',duration_ms=VALUES(duration_ms),summary=VALUES(summary),nodes=VALUES(nodes),
disks=VALUES(disks),services=VALUES(services),storage=VALUES(storage),steps=VALUES(steps),last_try_at=VALUES(last_try_at)`,
		id, now, took.Milliseconds(), js(res.Summary), js(res.Nodes), js(res.Disks), js(res.Services), js(res.Storage), js(res.Steps), now)
	if err != nil {
		return err
	}
	if len(res.Samples) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	st, err := tx.PrepareContext(ctx, `INSERT INTO metric_samples(provider_id,metric,target,value,sampled_at) VALUES(?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer st.Close()
	for _, p := range res.Samples {
		if _, err := st.ExecContext(ctx, id, p.Metric, trunc(p.Target, 120), p.Value, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func stepsOf(r *Result) []Step {
	if r == nil {
		return []Step{}
	}
	return r.Steps
}

// SaveAlertState 记录告警同步结果。
func (s *Store) SaveAlertState(ctx context.Context, id, errMsg string, firing int) error {
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `INSERT INTO monitor_snapshots(provider_id,alert_sync_at,alert_error,alert_firing) VALUES(?,?,?,?)
ON DUPLICATE KEY UPDATE alert_sync_at=VALUES(alert_sync_at),alert_error=VALUES(alert_error),alert_firing=VALUES(alert_firing)`,
		id, now, trunc(errMsg, 480), firing)
	return err
}

// LastTry 返回某平台上次尝试采集的时间（未采集过为零值）。
func (s *Store) LastTry(ctx context.Context, id string) time.Time {
	var t sql.NullTime
	_ = s.db.QueryRowContext(ctx, `SELECT last_try_at FROM monitor_snapshots WHERE provider_id=?`, id).Scan(&t)
	return t.Time
}

func unmarshal[T any](s sql.NullString, def T) T {
	if !s.Valid || s.String == "" {
		return def
	}
	var v T
	if json.Unmarshal([]byte(s.String), &v) != nil {
		return def
	}
	return v
}

// Snapshot 读取某平台的最近快照；从未采集时返回空快照（CollectedAt 为 nil）。
func (s *Store) Snapshot(ctx context.Context, id string) (*Snapshot, error) {
	sn := &Snapshot{ProviderID: id, Nodes: []Node{}, Disks: []Disk{}, Services: []Service{}, Storage: []Series{}, Steps: []Step{}}
	var col, alt sql.NullTime
	var sum, nodes, disks, svcs, sto, steps sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT collected_at,ok,error,duration_ms,summary,nodes,disks,services,storage,steps,alert_sync_at,alert_error,alert_firing
FROM monitor_snapshots WHERE provider_id=?`, id).Scan(&col, &sn.OK, &sn.Error, &sn.DurationMs, &sum, &nodes, &disks, &svcs, &sto, &steps, &alt, &sn.AlertError, &sn.AlertFiring)
	if err == sql.ErrNoRows {
		return sn, nil
	}
	if err != nil {
		return nil, err
	}
	if col.Valid {
		t := col.Time
		sn.CollectedAt = &t
	}
	if alt.Valid {
		t := alt.Time
		sn.AlertSyncAt = &t
	}
	if sum.Valid && sum.String != "" {
		var v Summary
		if json.Unmarshal([]byte(sum.String), &v) == nil {
			sn.Summary = &v
		}
	}
	sn.Nodes = unmarshal(nodes, sn.Nodes)
	sn.Disks = unmarshal(disks, sn.Disks)
	sn.Services = unmarshal(svcs, sn.Services)
	sn.Storage = unmarshal(sto, sn.Storage)
	sn.Steps = unmarshal(steps, sn.Steps)
	return sn, nil
}

// Point 趋势图上的一个点。
type Point struct {
	T int64   `json:"t"` // 毫秒时间戳
	V float64 `json:"v"`
}

// Trend 查询历史样本；同一 metric 按 target 区分。点数超过 maxPts 时按时间桶求平均降采样。
func (s *Store) Trend(ctx context.Context, id, metric, target string, since time.Time, maxPts int) ([]Point, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT sampled_at,value FROM metric_samples WHERE provider_id=? AND metric=? AND target=? AND sampled_at>=? ORDER BY sampled_at`,
		id, metric, target, since.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var all []Point
	for rows.Next() {
		var t time.Time
		var v float64
		if err := rows.Scan(&t, &v); err != nil {
			return nil, err
		}
		all = append(all, Point{T: t.UnixMilli(), V: v})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if maxPts < 10 || len(all) <= maxPts {
		if all == nil {
			all = []Point{}
		}
		return all, nil
	}
	size := (len(all) + maxPts - 1) / maxPts
	out := make([]Point, 0, maxPts)
	for i := 0; i < len(all); i += size {
		j := i + size
		if j > len(all) {
			j = len(all)
		}
		var sum float64
		for _, p := range all[i:j] {
			sum += p.V
		}
		out = append(out, Point{T: all[(i+j-1)/2].T, V: sum / float64(j-i)})
	}
	return out, nil
}
