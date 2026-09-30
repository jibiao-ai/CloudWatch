// Package audit 审计日志：入库、查询、导出、清理。敏感字段（password/token/secret/key/captcha）在落库前递归脱敏。
package audit

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type Log struct {
	ID           string         `json:"id"`
	Time         time.Time      `json:"time"`
	Operator     string         `json:"operator"`
	OperatorName string         `json:"operatorName"`
	IP           string         `json:"ip"`
	Module       string         `json:"module"`
	Action       string         `json:"action"`
	Target       string         `json:"target"`
	TargetID     string         `json:"targetId,omitempty"`
	TargetLink   string         `json:"targetLink,omitempty"`
	Result       string         `json:"result"`
	Duration     int            `json:"duration"`
	Error        string         `json:"error"`
	Params       map[string]any `json:"requestParams,omitempty"`
}

type Entry struct {
	Operator, OperatorName, IP string
	Module, Action, Target     string
	TargetID, TargetLink       string
	Err                        error
	Duration                   time.Duration
	Method, Path               string
	Body                       any
}

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db: db} }

var sensitive = regexp.MustCompile(`(?i)pass(word)?|secret|token|api[_-]?key|captcha|authorization|credential`)

// Mask 递归脱敏；超长字符串（如 data:image base64）折叠成摘要，避免日志膨胀。
func Mask(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			if sensitive.MatchString(k) && !isBoolOrNil(val) {
				if s, ok := val.(string); ok && s == "" {
					out[k] = ""
				} else {
					out[k] = "******"
				}
				continue
			}
			out[k] = Mask(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i := range x {
			out[i] = Mask(x[i])
		}
		return out
	case string:
		if strings.HasPrefix(x, "data:") && len(x) > 64 {
			return fmt.Sprintf("[内嵌文件 %.1fKB]", float64(len(x))/1024)
		}
		if len(x) > 2000 {
			return x[:2000] + "…"
		}
		return x
	}
	return v
}
func isBoolOrNil(v any) bool {
	if v == nil {
		return true
	}
	_, ok := v.(bool)
	return ok
}

// Record 写一条审计；失败只记录日志，绝不影响主流程。
func (s *Service) Record(ctx context.Context, e Entry) {
	res, msg := "success", ""
	if e.Err != nil {
		res, msg = "failure", e.Err.Error()
	}
	var params any = map[string]any{"method": e.Method, "path": e.Path}
	m := map[string]any{"method": e.Method, "path": e.Path}
	if e.Body != nil {
		// 序列化再反序列化，确保任意结构都能走统一脱敏
		var generic any
		if b, err := json.Marshal(e.Body); err == nil && json.Unmarshal(b, &generic) == nil {
			m["body"] = Mask(generic)
		}
	}
	params = m
	pb, _ := json.Marshal(params)
	_, err := s.db.ExecContext(context.WithoutCancel(ctx), `INSERT INTO audit_logs(occurred_at,operator,operator_name,ip,module,action,target,target_id,target_link,result,duration_ms,error,request_params)
		VALUES(UTC_TIMESTAMP(3),?,?,?,?,?,?,?,?,?,?,?,?)`,
		trunc(e.Operator, 64), trunc(e.OperatorName, 64), trunc(e.IP, 64), e.Module, e.Action, trunc(e.Target, 255), trunc(e.TargetID, 64), trunc(e.TargetLink, 255),
		res, int(e.Duration/time.Millisecond), msg, string(pb))
	if err != nil {
		log.Printf("audit: 写入失败: %v", err)
	}
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

type Query struct {
	Start, End                                *time.Time
	Operator, Module, Action, Result, Keyword string
	SortKey, SortOrder                        string
	Page, PageSize                            int
}

func parseTime(v string) *time.Time {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	if n, err := strconv.ParseInt(v, 10, 64); err == nil {
		t := time.UnixMilli(n).UTC()
		return &t
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		t = t.UTC()
		return &t
	}
	return nil
}

func like(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(s) + "%"
}

func ParseQuery(get func(string) string) Query {
	q := Query{
		Start: parseTime(get("start")), End: parseTime(get("end")),
		Operator: get("operator"), Module: get("module"), Action: get("action"), Result: get("result"), Keyword: get("keyword"),
		SortKey: get("sortKey"), SortOrder: get("sortOrder"),
	}
	q.Page, _ = strconv.Atoi(get("page"))
	q.PageSize, _ = strconv.Atoi(get("pageSize"))
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 20
	}
	if q.PageSize > 200 {
		q.PageSize = 200
	}
	return q
}

func (q Query) where() (string, []any) {
	var w []string
	var a []any
	if q.Start != nil {
		w, a = append(w, "occurred_at >= ?"), append(a, *q.Start)
	}
	if q.End != nil {
		w, a = append(w, "occurred_at <= ?"), append(a, *q.End)
	}
	if q.Operator != "" {
		w, a = append(w, `operator LIKE ? ESCAPE '\\'`), append(a, like(q.Operator))
	}
	if q.Module != "" {
		w, a = append(w, "module = ?"), append(a, q.Module)
	}
	if q.Action != "" {
		w, a = append(w, "action = ?"), append(a, q.Action)
	}
	if q.Result != "" {
		w, a = append(w, "result = ?"), append(a, q.Result)
	}
	if q.Keyword != "" {
		k := like(q.Keyword)
		w, a = append(w, `(target LIKE ? ESCAPE '\\' OR error LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\')`), append(a, k, k, k)
	}
	if len(w) == 0 {
		return "", a
	}
	return " WHERE " + strings.Join(w, " AND "), a
}

var sortCols = map[string]string{"time": "occurred_at", "operator": "operator", "module": "module", "action": "action", "result": "result", "duration": "duration_ms", "ip": "ip"}

func (q Query) order() string {
	col, ok := sortCols[q.SortKey]
	if !ok {
		return " ORDER BY occurred_at DESC, id DESC"
	}
	dir := "ASC"
	if q.SortOrder == "desc" {
		dir = "DESC"
	}
	return " ORDER BY " + col + " " + dir + ", id DESC"
}

const cols = `id,occurred_at,operator,operator_name,ip,module,action,target,target_id,target_link,result,duration_ms,IFNULL(error,''),IFNULL(request_params,'')`

func scan(rows interface{ Scan(...any) error }) (*Log, error) {
	var l Log
	var id int64
	var params string
	if err := rows.Scan(&id, &l.Time, &l.Operator, &l.OperatorName, &l.IP, &l.Module, &l.Action, &l.Target, &l.TargetID, &l.TargetLink, &l.Result, &l.Duration, &l.Error, &params); err != nil {
		return nil, err
	}
	l.ID = strconv.FormatInt(id, 10)
	l.Time = l.Time.UTC()
	if params != "" {
		_ = json.Unmarshal([]byte(params), &l.Params)
	}
	return &l, nil
}

type Page struct {
	List     []*Log `json:"list"`
	Total    int    `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
}

func (s *Service) List(ctx context.Context, q Query) (*Page, error) {
	w, args := q.where()
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_logs`+w, args...).Scan(&total); err != nil {
		return nil, err
	}
	a2 := append(append([]any{}, args...), q.PageSize, (q.Page-1)*q.PageSize)
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM audit_logs`+w+q.order()+` LIMIT ? OFFSET ?`, a2...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Log{}
	for rows.Next() {
		l, err := scan(rows)
		if err != nil {
			return nil, err
		}
		l.Params = nil // 列表不带大字段，详情接口再取
		out = append(out, l)
	}
	return &Page{List: out, Total: total, Page: q.Page, PageSize: q.PageSize}, rows.Err()
}

func (s *Service) Get(ctx context.Context, id string) (*Log, error) {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return nil, sql.ErrNoRows
	}
	return scan(s.db.QueryRowContext(ctx, `SELECT `+cols+` FROM audit_logs WHERE id=?`, n))
}

const exportMax = 50000

// Export 导出当前筛选结果（上限 5 万行）。
func (s *Service) Export(ctx context.Context, q Query) ([]byte, int, error) {
	w, args := q.where()
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM audit_logs`+w+q.order()+` LIMIT `+strconv.Itoa(exportMax), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	f := excelize.NewFile()
	sh := "审计日志"
	f.SetSheetName("Sheet1", sh)
	head := []any{"时间", "操作人", "IP", "模块", "动作", "目标", "结果", "耗时ms", "错误信息"}
	_ = f.SetSheetRow(sh, "A1", &head)
	n := 0
	for rows.Next() {
		l, err := scan(rows)
		if err != nil {
			return nil, 0, err
		}
		row := []any{l.Time.In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05"), l.Operator, l.IP, l.Module, l.Action, l.Target, l.Result, l.Duration, l.Error}
		cell, _ := excelize.CoordinatesToCellName(1, n+2)
		_ = f.SetSheetRow(sh, cell, &row)
		n++
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	_ = f.SetColWidth(sh, "A", "A", 20)
	_ = f.SetColWidth(sh, "B", "G", 16)
	_ = f.SetColWidth(sh, "F", "F", 36)
	_ = f.SetColWidth(sh, "I", "I", 50)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, 0, err
	}
	return buf.Bytes(), n, nil
}

// Clean 删除 days 天之前的日志，返回删除条数。
func (s *Service) Clean(ctx context.Context, days int) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM audit_logs WHERE occurred_at < ?`, time.Now().UTC().Add(-time.Duration(days)*24*time.Hour))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
