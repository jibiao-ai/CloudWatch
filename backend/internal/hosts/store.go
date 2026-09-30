package hosts

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
)

var ErrNotFound = httpx.Err(404, "域名映射不存在")

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "h" + hex.EncodeToString(b)
}

func FieldsErr(e FieldErrors) error {
	first := ""
	for _, v := range e {
		first = v
		break
	}
	return httpx.ErrData(400, 40001, first, map[string]any{"fields": e})
}

const cols = `id,name,console_ip,root_domain,components,enabled,probe_port,remark,updated_at,updated_by`

type scanner interface{ Scan(...any) error }

func scan(r scanner) (Mapping, error) {
	var m Mapping
	var comps string
	var en int
	if err := r.Scan(&m.ID, &m.Name, &m.ConsoleIP, &m.RootDomain, &comps, &en, &m.ProbePort, &m.Remark, &m.UpdatedAt, &m.UpdatedBy); err != nil {
		return m, err
	}
	m.Enabled = en == 1
	m.Components = strings.Split(comps, ",")
	m.Hosts = m.Lines()
	return m, nil
}

func (s *Store) List(ctx context.Context) ([]Mapping, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM host_mappings ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Mapping{}
	for rows.Next() {
		m, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) Get(ctx context.Context, id string) (*Mapping, error) {
	m, err := scan(s.db.QueryRowContext(ctx, `SELECT `+cols+` FROM host_mappings WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func dupErr(err error) error {
	var me *mysql.MySQLError
	if errors.As(err, &me) && me.Number == 1062 {
		return FieldsErr(FieldErrors{"rootDomain": "该根域名已存在映射，请直接编辑原有记录"})
	}
	return err
}

func (s *Store) Create(ctx context.Context, by string, in Input) (*Mapping, error) {
	if fe := Normalize(&in); len(fe) > 0 {
		return nil, FieldsErr(fe)
	}
	en := in.Enabled == nil || *in.Enabled
	id := newID()
	_, err := s.db.ExecContext(ctx, `INSERT INTO host_mappings(id,name,console_ip,root_domain,components,enabled,probe_port,remark,created_at,updated_at,updated_by)
		VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?)`,
		id, in.Name, in.ConsoleIP, in.RootDomain, strings.Join(in.Components, ","), b2i(en), in.ProbePort, in.Remark, by)
	if err != nil {
		return nil, dupErr(err)
	}
	return s.Get(ctx, id)
}

func (s *Store) Update(ctx context.Context, by, id string, in Input) (*Mapping, error) {
	if fe := Normalize(&in); len(fe) > 0 {
		return nil, FieldsErr(fe)
	}
	old, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	en := old.Enabled
	if in.Enabled != nil {
		en = *in.Enabled
	}
	_, err = s.db.ExecContext(ctx, `UPDATE host_mappings SET name=?,console_ip=?,root_domain=?,components=?,enabled=?,probe_port=?,remark=?,updated_at=UTC_TIMESTAMP(3),updated_by=? WHERE id=?`,
		in.Name, in.ConsoleIP, in.RootDomain, strings.Join(in.Components, ","), b2i(en), in.ProbePort, in.Remark, by, id)
	if err != nil {
		return nil, dupErr(err)
	}
	return s.Get(ctx, id)
}

func (s *Store) Delete(ctx context.Context, id string) (*Mapping, error) {
	m, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM host_mappings WHERE id=?`, id); err != nil {
		return nil, err
	}
	return m, nil
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

/* ---- 同步配置 / 最近一次应用结果（system_meta） ---- */

func (s *Store) metaGet(ctx context.Context, k string, out any) (bool, error) {
	var v string
	err := s.db.QueryRowContext(ctx, `SELECT v FROM system_meta WHERE k=?`, k).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal([]byte(v), out)
}

func (s *Store) metaPut(ctx context.Context, k string, v any) error {
	b, _ := json.Marshal(v)
	_, err := s.db.ExecContext(ctx, `INSERT INTO system_meta(k,v,updated_at) VALUES(?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE v=VALUES(v), updated_at=VALUES(updated_at)`, k, string(b))
	return err
}

func (s *Store) GetSync(ctx context.Context) (Sync, error) {
	c := DefaultSync()
	_, err := s.metaGet(ctx, "hosts_sync", &c)
	if c.DNSUpstreams == nil {
		c.DNSUpstreams = []string{}
	}
	if c.DockerContainers == nil {
		c.DockerContainers = []string{}
	}
	return c, err
}

func (s *Store) PutSync(ctx context.Context, c Sync) (Sync, error) {
	if fe := NormalizeSync(&c); len(fe) > 0 {
		return c, FieldsErr(prefix("sync.", fe))
	}
	return c, s.metaPut(ctx, "hosts_sync", c)
}

func prefix(p string, e FieldErrors) FieldErrors {
	o := FieldErrors{}
	for k, v := range e {
		o[p+k] = v
	}
	return o
}

func (s *Store) GetReport(ctx context.Context) (*Report, error) {
	var r Report
	ok, err := s.metaGet(ctx, "hosts_last_apply", &r)
	if err != nil || !ok {
		return nil, err
	}
	return &r, nil
}

func (s *Store) PutReport(ctx context.Context, r *Report) error {
	return s.metaPut(ctx, "hosts_last_apply", r)
}

var _ = time.Now
