package provider

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/secrets"
)

var ErrNotFound = httpx.Err(404, "平台不存在")

type Store struct {
	db  *sql.DB
	box *secrets.Box
}

func NewStore(db *sql.DB, box *secrets.Box) *Store { return &Store{db: db, box: box} }

func newID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

// FieldsErr 字段级校验错误：HTTP 400 / code 40001 / data.fields。
func FieldsErr(e FieldErrors) error {
	first := ""
	for _, k := range []string{"name", "envType", "consoleIp", "rootDomain", "arch", "nodeCount", "username", "password", "projectName", "userDomain", "projectDomain", "timeoutSec", "syncIntervalMin", "alertIntervalSec", "remark"} {
		if v, ok := e[k]; ok {
			first = v
			break
		}
	}
	return httpx.ErrData(400, 40001, first, map[string]any{"fields": e})
}

const cols = `id,name,env_type,console_ip,root_domain,arch,node_count,username,project_name,user_domain,project_domain,
timeout_sec,sync_interval_min,alert_interval_sec,remark,write_enabled,status,last_verify_at,last_verify,last_sync_at,last_sync_error,
vm_count,volume_count,network_count,zones,created_at,updated_at,updated_by`

type scanner interface{ Scan(...any) error }

func scan(r scanner) (*Provider, error) {
	var p Provider
	var we int
	var lv, zones sql.NullString
	var lva, lsa sql.NullTime
	if err := r.Scan(&p.ID, &p.Name, &p.EnvType, &p.ConsoleIP, &p.RootDomain, &p.Arch, &p.NodeCount, &p.Auth.Username, &p.Auth.ProjectName,
		&p.Auth.UserDomain, &p.Auth.ProjectDomain, &p.Advanced.TimeoutSec, &p.Advanced.SyncIntervalMin, &p.Advanced.AlertIntervalSec, &p.Advanced.Remark, &we, &p.Status,
		&lva, &lv, &lsa, &p.LastSyncErr, &p.Stats.VMCount, &p.Stats.VolumeCount, &p.Stats.NetworkCount, &zones, &p.CreatedAt, &p.UpdatedAt, &p.UpdatedBy); err != nil {
		return nil, err
	}
	p.Type = "openstack"
	p.WriteEnabled = we == 1
	p.Auth.PasswordSet = true
	if lva.Valid {
		t := lva.Time.UTC()
		p.LastVerifyAt = &t
	}
	if lsa.Valid {
		t := lsa.Time.UTC()
		p.LastSyncAt = &t
	}
	if lv.Valid && lv.String != "" {
		var v VerifyResult
		if json.Unmarshal([]byte(lv.String), &v) == nil {
			p.LastVerify = &v
		}
	}
	p.Zones = []string{}
	if zones.Valid && zones.String != "" {
		p.Zones = strings.Split(zones.String, ",")
	}
	p.Hosts = ComponentHosts(p.RootDomain)
	p.CreatedAt, p.UpdatedAt = p.CreatedAt.UTC(), p.UpdatedAt.UTC()
	return &p, nil
}

type Query struct {
	Keyword, EnvType, Status string
	SortKey, SortOrder       string
	Page, PageSize           int
}

type Page struct {
	List     []*Provider `json:"list"`
	Total    int         `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
}

var sortCols = map[string]string{"name": "name", "consoleIp": "INET_ATON(console_ip)", "lastSyncAt": "last_sync_at", "createdAt": "created_at"}

func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (q Query) where() (string, []any) {
	var cond []string
	var args []any
	if k := strings.TrimSpace(q.Keyword); k != "" {
		l := "%" + likeEscape(k) + "%"
		cond = append(cond, "(name LIKE ? OR console_ip LIKE ? OR root_domain LIKE ?)")
		args = append(args, l, l, l)
	}
	if q.EnvType != "" {
		cond = append(cond, "env_type=?")
		args = append(args, q.EnvType)
	}
	if q.Status != "" {
		cond = append(cond, "status=?")
		args = append(args, q.Status)
	}
	if len(cond) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(cond, " AND "), args
}

func (q Query) order() string {
	c, ok := sortCols[q.SortKey]
	if !ok {
		return " ORDER BY created_at, id"
	}
	dir := "ASC"
	if q.SortOrder == "desc" {
		dir = "DESC"
	}
	return " ORDER BY " + c + " IS NULL, " + c + " " + dir + ", id"
}

// List 分页列表；pageSize<=0 表示不分页（导出用）。
func (s *Store) List(ctx context.Context, q Query) (*Page, error) {
	w, args := q.where()
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM providers`+w, args...).Scan(&total); err != nil {
		return nil, err
	}
	sqlStr := `SELECT ` + cols + ` FROM providers` + w + q.order()
	if q.PageSize > 0 {
		if q.Page < 1 {
			q.Page = 1
		}
		sqlStr += ` LIMIT ? OFFSET ?`
		args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	}
	rows, err := s.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Provider{}
	for rows.Next() {
		p, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return &Page{List: out, Total: total, Page: q.Page, PageSize: q.PageSize}, rows.Err()
}

func (s *Store) Get(ctx context.Context, id string) (*Provider, error) {
	p, err := scan(s.db.QueryRowContext(ctx, `SELECT `+cols+` FROM providers WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

// Password 解密已保存的密码。
func (s *Store) Password(ctx context.Context, id string) (string, error) {
	var enc []byte
	err := s.db.QueryRowContext(ctx, `SELECT password_enc FROM providers WHERE id=?`, id).Scan(&enc)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return s.box.Open(enc)
}

func dupErr(err error) error {
	var me *mysql.MySQLError
	if errors.As(err, &me) && me.Number == 1062 {
		switch {
		case strings.Contains(me.Message, "uk_providers_name"):
			return FieldsErr(FieldErrors{"name": "云管标识已存在"})
		case strings.Contains(me.Message, "uk_providers_ip"):
			return FieldsErr(FieldErrors{"consoleIp": "控制台 IP 已被其他平台使用"})
		case strings.Contains(me.Message, "uk_providers_root"):
			return FieldsErr(FieldErrors{"rootDomain": "根域名已被其他平台使用"})
		}
	}
	return err
}

func (s *Store) Create(ctx context.Context, by string, in Input) (*Provider, error) {
	if e := Normalize(&in, true); len(e) > 0 {
		return nil, FieldsErr(e)
	}
	enc, err := s.box.Seal(in.Auth.Password)
	if err != nil {
		return nil, err
	}
	id, now := newID("p"), time.Now().UTC()
	_, err = s.db.ExecContext(ctx, `INSERT INTO providers(id,name,env_type,console_ip,root_domain,arch,node_count,username,password_enc,project_name,user_domain,project_domain,
timeout_sec,sync_interval_min,alert_interval_sec,remark,status,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unknown',?,?,?)`,
		id, in.Name, in.EnvType, in.ConsoleIP, in.RootDomain, in.Arch, in.NodeCount, in.Auth.Username, enc, in.Auth.ProjectName, in.Auth.UserDomain, in.Auth.ProjectDomain,
		in.Advanced.TimeoutSec, in.Advanced.SyncIntervalMin, in.Advanced.AlertIntervalSec, in.Advanced.Remark, now, now, by)
	if err != nil {
		return nil, dupErr(err)
	}
	return s.Get(ctx, id)
}

func (s *Store) Update(ctx context.Context, by, id string, in Input) (*Provider, error) {
	old, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if e := Normalize(&in, false); len(e) > 0 {
		return nil, FieldsErr(e)
	}
	// 接入信息变化后，旧的验证结论不再可信：状态回到 unknown，由后台重新验证。
	changed := old.ConsoleIP != in.ConsoleIP || old.RootDomain != in.RootDomain || in.Auth.Password != "" ||
		old.Auth.Username != in.Auth.Username || old.Auth.ProjectName != in.Auth.ProjectName ||
		old.Auth.UserDomain != in.Auth.UserDomain || old.Auth.ProjectDomain != in.Auth.ProjectDomain
	set := `name=?,env_type=?,console_ip=?,root_domain=?,arch=?,node_count=?,username=?,project_name=?,user_domain=?,project_domain=?,timeout_sec=?,sync_interval_min=?,alert_interval_sec=?,remark=?,updated_at=?,updated_by=?`
	args := []any{in.Name, in.EnvType, in.ConsoleIP, in.RootDomain, in.Arch, in.NodeCount, in.Auth.Username, in.Auth.ProjectName, in.Auth.UserDomain, in.Auth.ProjectDomain,
		in.Advanced.TimeoutSec, in.Advanced.SyncIntervalMin, in.Advanced.AlertIntervalSec, in.Advanced.Remark, time.Now().UTC(), by}
	if in.Auth.Password != "" {
		enc, err := s.box.Seal(in.Auth.Password)
		if err != nil {
			return nil, err
		}
		set += `,password_enc=?`
		args = append(args, enc)
	}
	if changed {
		set += `,status='unknown',last_verify=NULL,last_verify_at=NULL,last_sync_error='',last_sync_try_at=NULL`
	}
	args = append(args, id)
	if _, err := s.db.ExecContext(ctx, `UPDATE providers SET `+set+` WHERE id=?`, args...); err != nil {
		return nil, dupErr(err)
	}
	return s.Get(ctx, id)
}

func (s *Store) Delete(ctx context.Context, id string) (*Provider, error) {
	p, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM tasks WHERE provider_id=?`, id); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM providers WHERE id=?`, id); err != nil {
		return nil, err
	}
	return p, tx.Commit()
}

func (s *Store) SetWrite(ctx context.Context, by, id string, on bool) (*Provider, error) {
	v := 0
	if on {
		v = 1
	}
	res, err := s.db.ExecContext(ctx, `UPDATE providers SET write_enabled=?,updated_at=?,updated_by=? WHERE id=?`, v, time.Now().UTC(), by, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := s.Get(ctx, id); err != nil {
			return nil, err
		}
	}
	return s.Get(ctx, id)
}

func (s *Store) SaveVerify(ctx context.Context, id string, v *VerifyResult) error {
	b, _ := json.Marshal(v)
	_, err := s.db.ExecContext(ctx, `UPDATE providers SET status=?,last_verify=?,last_verify_at=? WHERE id=?`, v.Status, string(b), v.At.UTC(), id)
	return err
}

// Counts 平台总数与在线数（登录页 / 首页展示）。
func (s *Store) Counts(ctx context.Context) (providers, nodes, vms, zones int, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(node_count),0),COALESCE(SUM(vm_count),0) FROM providers`).Scan(&providers, &nodes, &vms)
	if err != nil {
		return
	}
	var zs []string
	rows, e := s.db.QueryContext(ctx, `SELECT zones FROM providers WHERE zones<>''`)
	if e != nil {
		return providers, nodes, vms, 0, e
	}
	defer rows.Close()
	for rows.Next() {
		var z string
		if rows.Scan(&z) == nil {
			zs = append(zs, strings.Split(z, ",")...)
		}
	}
	return providers, nodes, vms, len(zs), rows.Err()
}
