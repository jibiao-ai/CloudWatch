package monitor

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

// Alert 告警中心的一行（alert_events）。
type Alert struct {
	ID           int64             `json:"id"`
	ProviderID   string            `json:"providerId"`
	ProviderName string            `json:"providerName"`
	Fingerprint  string            `json:"fingerprint"`
	Name         string            `json:"name"`
	NameEN       string            `json:"nameEn"`
	Severity     string            `json:"severity"`
	Category     string            `json:"category"`
	Type         string            `json:"type"`
	Component    string            `json:"component"`
	NodeName     string            `json:"nodeName"`
	HostIP       string            `json:"hostIp"`
	Project      string            `json:"project"`
	Description  string            `json:"description"`
	Summary      string            `json:"summary"`
	Solution     string            `json:"solution"`
	Labels       map[string]string `json:"labels"`
	Annotations  map[string]string `json:"annotations"`
	RuleID       string            `json:"ruleId"`
	Status       string            `json:"status"`
	FiredAt      time.Time         `json:"firedAt"`
	ResolvedAt   *time.Time        `json:"resolvedAt"`
	LastSeenAt   *time.Time        `json:"lastSeenAt"`
	Acked        bool              `json:"acked"`
	AckedBy      string            `json:"ackedBy"`
	AckedAt      *time.Time        `json:"ackedAt"`
}

// AlertQuery 列表过滤条件。
type AlertQuery struct {
	Keyword, Severity, Status, Type, ProviderID, Acked string
	From, To                                           time.Time
	SortKey, SortOrder                                 string
	Page, PageSize                                     int
}

type AlertPage struct {
	List     []*Alert `json:"list"`
	Total    int      `json:"total"`
	Page     int      `json:"page"`
	PageSize int      `json:"pageSize"`
}

// AlertStats 告警统计（仅统计「告警中」）。
type AlertStats struct {
	Firing   int            `json:"firing"`
	Unacked  int            `json:"unacked"`
	Resolved int            `json:"resolved"`
	Severity map[string]int `json:"severity"`
	Type     map[string]int `json:"type"`
}

const alertCols = `a.id,a.provider_id,COALESCE(p.name,''),a.fingerprint,a.title,a.name_en,a.severity,a.category,a.alert_type,a.component,a.node_name,a.host_ip,a.project_name,
COALESCE(a.content,''),COALESCE(a.summary,''),COALESCE(a.solution,''),a.labels,a.annotations,a.rule_id,a.status,a.fired_at,a.resolved_at,a.last_seen_at,a.acked,a.acked_by,a.acked_at`

type scanner interface{ Scan(...any) error }

func scanAlert(r scanner) (*Alert, error) {
	a := &Alert{}
	var lb, an sql.NullString
	var res, seen, ack sql.NullTime
	if err := r.Scan(&a.ID, &a.ProviderID, &a.ProviderName, &a.Fingerprint, &a.Name, &a.NameEN, &a.Severity, &a.Category, &a.Type, &a.Component, &a.NodeName, &a.HostIP, &a.Project,
		&a.Description, &a.Summary, &a.Solution, &lb, &an, &a.RuleID, &a.Status, &a.FiredAt, &res, &seen, &a.Acked, &a.AckedBy, &ack); err != nil {
		return nil, err
	}
	a.Labels, a.Annotations = map[string]string{}, map[string]string{}
	if lb.Valid {
		_ = json.Unmarshal([]byte(lb.String), &a.Labels)
	}
	if an.Valid {
		_ = json.Unmarshal([]byte(an.String), &a.Annotations)
	}
	if res.Valid {
		t := res.Time
		a.ResolvedAt = &t
	}
	if seen.Valid {
		t := seen.Time
		a.LastSeenAt = &t
	}
	if ack.Valid {
		t := ack.Time
		a.AckedAt = &t
	}
	return a, nil
}

func alertWhere(q AlertQuery) (string, []any) {
	w, args := []string{"1=1"}, []any{}
	if q.Keyword != "" {
		like := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q.Keyword) + "%"
		w = append(w, `(a.title LIKE ? OR a.name_en LIKE ? OR a.content LIKE ? OR a.node_name LIKE ? OR a.host_ip LIKE ? OR a.component LIKE ?)`)
		args = append(args, like, like, like, like, like, like)
	}
	eq := func(col, v string) {
		if v != "" {
			w = append(w, col+"=?")
			args = append(args, v)
		}
	}
	eq("a.severity", q.Severity)
	eq("a.status", q.Status)
	eq("a.alert_type", q.Type)
	eq("a.provider_id", q.ProviderID)
	switch q.Acked {
	case "1", "true":
		w = append(w, "a.acked=1")
	case "0", "false":
		w = append(w, "a.acked=0")
	}
	if !q.From.IsZero() {
		w = append(w, "a.fired_at>=?")
		args = append(args, q.From.UTC())
	}
	if !q.To.IsZero() {
		w = append(w, "a.fired_at<=?")
		args = append(args, q.To.UTC())
	}
	return strings.Join(w, " AND "), args
}

var alertSort = map[string]string{"firedAt": "a.fired_at", "severity": "FIELD(a.severity,'critical','warning','info')", "name": "a.title", "resolvedAt": "a.resolved_at"}

// ListAlerts 分页（Page=0 表示不分页，导出用，最多 5000 条）。
func (s *Store) ListAlerts(ctx context.Context, q AlertQuery) (*AlertPage, error) {
	where, args := alertWhere(q)
	pg := &AlertPage{List: []*Alert{}, Page: q.Page, PageSize: q.PageSize}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM alert_events a WHERE `+where, args...).Scan(&pg.Total); err != nil {
		return nil, err
	}
	col, ok := alertSort[q.SortKey]
	if !ok {
		col, q.SortOrder = "a.fired_at", "desc"
	}
	dir := "DESC"
	if strings.EqualFold(q.SortOrder, "asc") {
		dir = "ASC"
	}
	order := col + " " + dir + ", a.id DESC"
	lim := 5000
	off := 0
	if q.Page > 0 {
		lim, off = q.PageSize, (q.Page-1)*q.PageSize
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+alertCols+` FROM alert_events a LEFT JOIN providers p ON p.id=a.provider_id WHERE `+where+` ORDER BY `+order+` LIMIT ? OFFSET ?`,
		append(args, lim, off)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		a, err := scanAlert(rows)
		if err != nil {
			return nil, err
		}
		pg.List = append(pg.List, a)
	}
	return pg, rows.Err()
}

func (s *Store) GetAlert(ctx context.Context, id int64) (*Alert, error) {
	a, err := scanAlert(s.db.QueryRowContext(ctx, `SELECT `+alertCols+` FROM alert_events a LEFT JOIN providers p ON p.id=a.provider_id WHERE a.id=?`, id))
	if err == sql.ErrNoRows {
		return nil, httpx.Err(404, "告警不存在")
	}
	return a, err
}

// Stats 告警统计，providerID 为空表示全部平台。
func (s *Store) Stats(ctx context.Context, providerID string) (*AlertStats, error) {
	st := &AlertStats{Severity: map[string]int{"critical": 0, "warning": 0, "info": 0}, Type: map[string]int{"service": 0, "storage": 0, "log": 0, "host": 0, "others": 0}}
	cond, args := "", []any{}
	if providerID != "" {
		cond, args = " AND provider_id=?", []any{providerID}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT status,severity,alert_type,acked,COUNT(*) FROM alert_events WHERE 1=1`+cond+` GROUP BY status,severity,alert_type,acked`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status, sev, typ string
		var acked bool
		var n int
		if err := rows.Scan(&status, &sev, &typ, &acked, &n); err != nil {
			return nil, err
		}
		if status == "resolved" {
			st.Resolved += n
			continue
		}
		st.Firing += n
		st.Severity[sev] += n
		st.Type[typ] += n
		if !acked {
			st.Unacked += n
		}
	}
	return st, rows.Err()
}

// Ack 人工确认告警（已确认的忽略；已恢复的告警会被系统自动确认），返回实际确认的条数。
func (s *Store) Ack(ctx context.Context, by string, ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, httpx.Err(400, "请选择要确认的告警")
	}
	if len(ids) > 500 {
		return 0, httpx.Err(400, "单次最多确认 500 条")
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := []any{by, time.Now().UTC()}
	for _, id := range ids {
		args = append(args, id)
	}
	res, err := s.db.ExecContext(ctx, `UPDATE alert_events SET acked=1,acked_by=?,acked_at=? WHERE acked=0 AND id IN (`+ph+`)`, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ApplySync 把一次拉取结果写入 alert_events。
// firing 为 nil 表示拉取失败（不做自动恢复）；resolved 为 nil 表示未拉取或失败。返回本次新出现的告警。
func (s *Store) ApplySync(ctx context.Context, providerID string, firing, resolved []*Parsed) (fresh []*Parsed, err error) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	upsert := func(p *Parsed) (inserted bool, err error) {
		lb, _ := json.Marshal(p.Labels)
		an, _ := json.Marshal(p.Annotations)
		var res sql.NullTime
		if p.Status == "resolved" {
			res = sql.NullTime{Time: p.EndsAt, Valid: true}
		}
		r, err := tx.ExecContext(ctx, `INSERT INTO alert_events(provider_id,fingerprint,severity,title,name_en,category,alert_type,component,node_name,host_ip,project_name,content,summary,solution,labels,annotations,rule_id,status,fired_at,resolved_at,last_seen_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE notified=IF(status='resolved' AND VALUES(status)='firing',0,notified),resolve_notified=IF(status='firing' AND VALUES(status)='resolved',0,resolve_notified),severity=VALUES(severity),title=VALUES(title),name_en=VALUES(name_en),category=VALUES(category),alert_type=VALUES(alert_type),component=VALUES(component),
node_name=VALUES(node_name),host_ip=VALUES(host_ip),project_name=VALUES(project_name),content=VALUES(content),summary=VALUES(summary),solution=VALUES(solution),
labels=VALUES(labels),annotations=VALUES(annotations),rule_id=VALUES(rule_id),status=VALUES(status),resolved_at=VALUES(resolved_at),last_seen_at=VALUES(last_seen_at)`,
			providerID, p.Fingerprint, p.Severity, trunc(p.Name, 250), trunc(p.NameEN, 250), trunc(p.Category, 60), p.AlertType, trunc(p.Component, 120), trunc(p.NodeName, 120), trunc(p.HostIP, 60), trunc(p.Project, 120),
			p.Description, p.Summary, p.Solution, string(lb), string(an), trunc(p.RuleID, 60), p.Status, p.StartsAt, res, now)
		if err != nil {
			return false, err
		}
		n, _ := r.RowsAffected()
		return n == 1, nil
	}

	for _, p := range firing {
		p.Status = "firing"
		ins, err := upsert(p)
		if err != nil {
			return nil, err
		}
		if ins {
			fresh = append(fresh, p)
		}
	}
	for _, p := range resolved {
		p.Status = "resolved"
		if _, err := upsert(p); err != nil {
			return nil, err
		}
	}
	if firing != nil {
		// 本次拉取未见到、仍标记为告警中的记录视为已恢复
		if _, err := tx.ExecContext(ctx, `UPDATE alert_events SET status='resolved',resolve_notified=0,resolved_at=? WHERE provider_id=? AND status='firing' AND (last_seen_at IS NULL OR last_seen_at<?)`,
			now, providerID, now); err != nil {
			return nil, err
		}
	}
	if err := autoAckResolved(ctx, tx, providerID, now); err != nil {
		return nil, err
	}
	return fresh, tx.Commit()
}

// AutoAckBy 系统自动确认时写入的确认人（区别于人工确认）。
const AutoAckBy = "系统(自动恢复)"

// autoAckResolved 状态联动：
//  1. 已恢复 → 自动置为已确认（人工已确认的保留原确认人与时间）；
//  2. 复发（同一行由已恢复回到告警中）→ 撤销「系统自动确认」，使其重新进入待确认；人工确认的不动。
func autoAckResolved(ctx context.Context, tx *sql.Tx, providerID string, now time.Time) error {
	if _, err := tx.ExecContext(ctx, `UPDATE alert_events SET acked=1,acked_by=?,acked_at=COALESCE(resolved_at,?) WHERE provider_id=? AND status='resolved' AND acked=0`,
		AutoAckBy, now, providerID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE alert_events SET acked=0,acked_by='',acked_at=NULL WHERE provider_id=? AND status='firing' AND acked=1 AND acked_by=?`,
		providerID, AutoAckBy)
	return err
}

// Related 关联记录：同一平台、同一指纹（标签哈希）的其它触发记录，即「同一个告警」的历次发生 / 恢复。
// 按触发时间倒序，最多 50 条，不含自身。
func (s *Store) Related(ctx context.Context, id int64) ([]*Alert, error) {
	cur, err := s.GetAlert(ctx, id)
	if err != nil {
		return nil, err
	}
	if cur.Fingerprint == "" {
		return []*Alert{}, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+alertCols+` FROM alert_events a LEFT JOIN providers p ON p.id=a.provider_id WHERE a.provider_id=? AND a.fingerprint=? AND a.id<>? ORDER BY a.fired_at DESC, a.id DESC LIMIT 50`,
		cur.ProviderID, cur.Fingerprint, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Alert{}
	for rows.Next() {
		a, err := scanAlert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// PendingFiring 尚未推送的告警中记录（推送失败会留到下次重试）。
func (s *Store) PendingFiring(ctx context.Context, providerID string) ([]*Alert, error) {
	return s.pending(ctx, `a.provider_id=? AND a.status='firing' AND a.notified=0`, providerID)
}

// PendingResolved 尚未推送的恢复记录；超过 6 小时的恢复不再补发。
func (s *Store) PendingResolved(ctx context.Context, providerID string) ([]*Alert, error) {
	_, _ = s.db.ExecContext(ctx, `UPDATE alert_events SET resolve_notified=1 WHERE resolve_notified=0 AND (resolved_at IS NULL OR resolved_at<?)`, time.Now().UTC().Add(-6*time.Hour))
	return s.pending(ctx, `a.provider_id=? AND a.status='resolved' AND a.resolve_notified=0`, providerID)
}

func (s *Store) pending(ctx context.Context, where, providerID string) ([]*Alert, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+alertCols+` FROM alert_events a LEFT JOIN providers p ON p.id=a.provider_id WHERE `+where+` ORDER BY a.fired_at LIMIT 200`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Alert
	for rows.Next() {
		a, err := scanAlert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// MarkNotified 标记已推送；resolved=true 标记恢复通知。
func (s *Store) MarkNotified(ctx context.Context, resolved bool, list []*Alert) {
	col := "notified"
	if resolved {
		col = "resolve_notified"
	}
	for _, a := range list {
		_, _ = s.db.ExecContext(ctx, `UPDATE alert_events SET `+col+`=1 WHERE id=?`, a.ID)
	}
}

// LastAlertTry 返回某平台上次尝试同步告警的时间。
func (s *Store) LastAlertTry(ctx context.Context, id string) time.Time {
	var t sql.NullTime
	_ = s.db.QueryRowContext(ctx, `SELECT alert_sync_at FROM monitor_snapshots WHERE provider_id=?`, id).Scan(&t)
	return t.Time
}
