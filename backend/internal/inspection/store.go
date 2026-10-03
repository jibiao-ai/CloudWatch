package inspection

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

// Store 巡检配置与报告的持久化。
type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func newID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

// Config 读取巡检配置；未保存过时返回默认配置。
func (s *Store) Config(ctx context.Context) Config {
	c := DefaultConfig()
	var raw sql.NullString
	if err := s.db.QueryRowContext(ctx, `SELECT config FROM inspection_config WHERE id=1`).Scan(&raw); err != nil || !raw.Valid || raw.String == "" {
		return c
	}
	var got Config
	if json.Unmarshal([]byte(raw.String), &got) != nil {
		return c
	}
	// 以默认值为底，兼容后续新增的阈值字段（旧配置缺字段时取默认值）
	b, _ := json.Marshal(got.Thresholds)
	_ = json.Unmarshal(b, &c.Thresholds)
	c.Schedule, c.RefreshFirst, c.Disabled = got.Schedule, got.RefreshFirst, got.Disabled
	if c.Disabled == nil {
		c.Disabled = []string{}
	}
	if len(c.Normalize()) > 0 {
		return DefaultConfig()
	}
	return c
}

// SaveConfig 校验并保存配置。
func (s *Store) SaveConfig(ctx context.Context, c Config, by string) (Config, error) {
	if e := c.Normalize(); len(e) > 0 {
		first := ""
		for _, k := range []string{"ssdLife", "diskUsage", "storage", "pool", "runway", "vcpu", "mem", "nodeCpu", "nodeMem", "diskIo", "latency", "vmCpuHigh", "vmMemHigh", "staleMin", "listMax", "time", "disabled"} {
			if v, ok := e[k]; ok {
				first = v
				break
			}
		}
		return c, httpx.ErrData(400, 40001, first, map[string]any{"fields": e})
	}
	b, _ := json.Marshal(c)
	_, err := s.db.ExecContext(ctx, `INSERT INTO inspection_config(id,config,updated_at,updated_by) VALUES(1,?,?,?)
ON DUPLICATE KEY UPDATE config=VALUES(config),updated_at=VALUES(updated_at),updated_by=VALUES(updated_by)`, string(b), time.Now().UTC(), by)
	return c, err
}

// Save 保存一份报告，返回其 ID。
func (s *Store) Save(ctx context.Context, r *Report) (int64, error) {
	b, err := json.Marshal(r)
	if err != nil {
		return 0, err
	}
	pid := "all"
	var names []string
	for _, p := range r.Platforms {
		names = append(names, p.Name)
	}
	if len(r.Platforms) == 1 {
		pid = r.Platforms[0].ProviderID
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO inspection_results(provider_id,task_id,status,summary,detail,finished_at,title,trigger_type,operator,operator_name,scope,started_at,overall,score,cnt_ok,cnt_warn,cnt_bad,cnt_na)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		pid, r.TaskID, "done", r.Summary, string(b), r.FinishedAt.UTC(), trunc(r.Title, 160), r.Trigger, trunc(r.Operator, 64), trunc(r.OperatorNm, 64), trunc(strings.Join(names, "、"), 1000),
		r.StartedAt.UTC(), r.Overall, r.Score, r.Counts.OK, r.Counts.Warn, r.Counts.Bad, r.Counts.NA)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// ListQuery 报告列表查询条件。
type ListQuery struct {
	Keyword, Overall, Trigger, TaskID string
	From, To                          time.Time
	SortKey, SortOrder                string
	Page, PageSize                    int
}

type Page struct {
	List     []Row `json:"list"`
	Total    int   `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"pageSize"`
}

var sortCols = map[string]string{"finishedAt": "finished_at", "score": "score", "overall": "FIELD(overall,'bad','warn','ok','na')", "title": "title", "trigger": "trigger_type"}

func (s *Store) List(ctx context.Context, q ListQuery) (*Page, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 200 {
		q.PageSize = 10
	}
	w, args := []string{"1=1"}, []any{}
	if q.Keyword != "" {
		like := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q.Keyword) + "%"
		w = append(w, "(title LIKE ? OR scope LIKE ? OR operator_name LIKE ? OR operator LIKE ?)")
		args = append(args, like, like, like, like)
	}
	if q.Overall != "" {
		w = append(w, "overall=?")
		args = append(args, q.Overall)
	}
	if q.Trigger != "" {
		w = append(w, "trigger_type=?")
		args = append(args, q.Trigger)
	}
	if q.TaskID != "" {
		w = append(w, "task_id=?")
		args = append(args, q.TaskID)
	}
	if !q.From.IsZero() {
		w = append(w, "finished_at>=?")
		args = append(args, q.From.UTC())
	}
	if !q.To.IsZero() {
		w = append(w, "finished_at<=?")
		args = append(args, q.To.UTC())
	}
	where := strings.Join(w, " AND ")
	pg := &Page{List: []Row{}, Page: q.Page, PageSize: q.PageSize}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM inspection_results WHERE `+where, args...).Scan(&pg.Total); err != nil {
		return nil, err
	}
	col := sortCols[q.SortKey]
	if col == "" {
		col = "finished_at"
	}
	dir := "DESC"
	if strings.EqualFold(q.SortOrder, "asc") {
		dir = "ASC"
	}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	rows, err := s.db.QueryContext(ctx, `SELECT id,task_id,title,trigger_type,operator,operator_name,scope,started_at,finished_at,overall,score,cnt_ok,cnt_warn,cnt_bad,cnt_na,summary
FROM inspection_results WHERE `+where+` ORDER BY `+col+` `+dir+`,id DESC LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var r Row
		var st sql.NullTime
		var task, title, trig, op, opn, scope, overall, sum sql.NullString
		var score sql.NullInt64
		if err := rows.Scan(&r.ID, &task, &title, &trig, &op, &opn, &scope, &st, &r.FinishedAt, &overall, &score, &r.Counts.OK, &r.Counts.Warn, &r.Counts.Bad, &r.Counts.NA, &sum); err != nil {
			return nil, err
		}
		r.TaskID, r.Title, r.Trigger, r.Operator, r.OperatorNm, r.Scope, r.Overall, r.Summary = task.String, title.String, trig.String, op.String, opn.String, scope.String, overall.String, sum.String
		r.Score = int(score.Int64)
		r.FinishedAt = r.FinishedAt.UTC()
		if st.Valid {
			r.StartedAt = st.Time.UTC()
		} else {
			r.StartedAt = r.FinishedAt
		}
		pg.List = append(pg.List, r)
	}
	return pg, rows.Err()
}

// Get 取一份完整报告。
func (s *Store) Get(ctx context.Context, id int64) (*Report, error) {
	var detail sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT detail FROM inspection_results WHERE id=?`, id).Scan(&detail)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpx.Err(404, "巡检报告不存在或已被清理")
	}
	if err != nil {
		return nil, err
	}
	var r Report
	if err := json.Unmarshal([]byte(detail.String), &r); err != nil {
		return nil, httpx.Err(500, "巡检报告内容损坏，无法读取")
	}
	r.ID = id
	r.StartedAt, r.FinishedAt = r.StartedAt.UTC(), r.FinishedAt.UTC()
	return &r, nil
}

// Delete 删除报告，返回其标题（审计用）。
func (s *Store) Delete(ctx context.Context, id int64) (string, error) {
	var title sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT title FROM inspection_results WHERE id=?`, id).Scan(&title)
	if errors.Is(err, sql.ErrNoRows) {
		return "", httpx.Err(404, "巡检报告不存在或已被清理")
	}
	if err != nil {
		return "", err
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM inspection_results WHERE id=?`, id)
	return title.String, err
}

// ScheduledSince 自 t 起是否已有定时巡检产生的报告（避免重复触发）。
func (s *Store) ScheduledSince(ctx context.Context, t time.Time) bool {
	var n int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM inspection_results WHERE trigger_type='schedule' AND started_at>=?`, t.UTC()).Scan(&n)
	return n > 0
}
