package settings

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/secrets"
)

var Groups = []string{"basic", "brand", "security", "retention", "alertChannels"}

type Store struct {
	db  *sql.DB
	box *secrets.Box

	mu    sync.RWMutex
	cache *snapshot
}

// snapshot 进程内缓存（安全策略每个请求都要读）；任何写入后立即失效。
type snapshot struct {
	basic     Basic
	brand     Brand
	security  Security
	retention Retention
	at        time.Time
}

func New(db *sql.DB, box *secrets.Box) *Store { return &Store{db: db, box: box} }

func newID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func (s *Store) invalidate() { s.mu.Lock(); s.cache = nil; s.mu.Unlock() }

func loadGroup[T any](ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, key string, def T) (T, error) {
	var raw string
	err := q.QueryRowContext(ctx, `SELECT value FROM settings WHERE group_key=?`, key).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return def, nil
	}
	if err != nil {
		return def, err
	}
	out := def // 以默认值为底，兼容后续新增字段
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return def, err
	}
	return out, nil
}

func (s *Store) snap(ctx context.Context) (*snapshot, error) {
	s.mu.RLock()
	c := s.cache
	s.mu.RUnlock()
	if c != nil && time.Since(c.at) < 30*time.Second {
		return c, nil
	}
	n := &snapshot{at: time.Now()}
	var err error
	if n.basic, err = loadGroup(ctx, s.db, "basic", DefaultBasic()); err != nil {
		return nil, err
	}
	if n.brand, err = loadGroup(ctx, s.db, "brand", DefaultBrand()); err != nil {
		return nil, err
	}
	if n.security, err = loadGroup(ctx, s.db, "security", DefaultSecurity()); err != nil {
		return nil, err
	}
	if n.retention, err = loadGroup(ctx, s.db, "retention", DefaultRetention()); err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cache = n
	s.mu.Unlock()
	return n, nil
}

func (s *Store) Security(ctx context.Context) (Security, error) {
	n, err := s.snap(ctx)
	if err != nil {
		return Security{}, err
	}
	return n.security, nil
}
func (s *Store) Retention(ctx context.Context) (Retention, error) {
	n, err := s.snap(ctx)
	if err != nil {
		return Retention{}, err
	}
	return n.retention, nil
}

// Public 登录页 / 启动时需要的公开信息（不含任何敏感项）。
type Public struct {
	Basic
	Brand
	CaptchaEnabled bool `json:"captchaEnabled"`
	// 密码策略（非敏感）：改密页据此展示与校验，保持与后端一致
	MinLength      int  `json:"minLength"`
	RequireUpper   bool `json:"requireUpper"`
	RequireLower   bool `json:"requireLower"`
	RequireDigit   bool `json:"requireDigit"`
	RequireSpecial bool `json:"requireSpecial"`
}

func (s *Store) Public(ctx context.Context) (*Public, error) {
	n, err := s.snap(ctx)
	if err != nil {
		return nil, err
	}
	return &Public{Basic: n.basic, Brand: n.brand, CaptchaEnabled: n.security.CaptchaEnabled,
		MinLength: n.security.MinLength, RequireUpper: n.security.RequireUpper, RequireLower: n.security.RequireLower, RequireDigit: n.security.RequireDigit, RequireSpecial: n.security.RequireSpecial}, nil
}

func (s *Store) Get(ctx context.Context) (*All, error) {
	n, err := s.snap(ctx)
	if err != nil {
		return nil, err
	}
	chs, err := s.listChannels(ctx)
	if err != nil {
		return nil, err
	}
	return &All{Basic: n.basic, Brand: n.brand, Security: n.security, Retention: n.retention, AlertChannels: chs}, nil
}

func (s *Store) listChannels(ctx context.Context) ([]ChannelOut, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,type,name,enabled,config,secret_enc IS NOT NULL FROM alert_channels ORDER BY sort_no, created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ChannelOut{}
	for rows.Next() {
		var c ChannelOut
		var cfg string
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &c.Enabled, &cfg, &c.SecretSet); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(cfg), &c.Config)
		if c.Config == nil {
			c.Config = map[string]any{}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ChannelSecret 读取并解密某渠道已保存的密钥（仅服务端内部使用，永不出现在接口响应里）。
func (s *Store) ChannelSecret(ctx context.Context, id string) (string, error) {
	var enc []byte
	err := s.db.QueryRowContext(ctx, `SELECT secret_enc FROM alert_channels WHERE id=?`, id).Scan(&enc)
	if errors.Is(err, sql.ErrNoRows) || len(enc) == 0 {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return s.box.Open(enc)
}

type Channel struct {
	ID, Type, Name string
	Enabled        bool
	Config         map[string]any
	Secret         string
}

// EnabledChannels 返回所有已启用渠道（含解密后的密钥），供告警发送使用。
func (s *Store) EnabledChannels(ctx context.Context) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,type,name,config,secret_enc FROM alert_channels WHERE enabled=1 ORDER BY sort_no, created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Channel
	for rows.Next() {
		var c Channel
		var cfg string
		var enc []byte
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &cfg, &enc); err != nil {
			return nil, err
		}
		c.Enabled = true
		_ = json.Unmarshal([]byte(cfg), &c.Config)
		if len(enc) > 0 {
			if c.Secret, err = s.box.Open(enc); err != nil {
				return nil, err
			}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Patch 是 PUT /settings 的请求体：只会更新出现的分组。
type Patch struct {
	Basic         *Basic       `json:"basic"`
	Brand         *Brand       `json:"brand"`
	Security      *Security    `json:"security"`
	Retention     *Retention   `json:"retention"`
	AlertChannels *[]ChannelIn `json:"alertChannels"`
}

func (p *Patch) Touched() []string {
	var g []string
	if p.Basic != nil {
		g = append(g, "basic")
	}
	if p.Brand != nil {
		g = append(g, "brand")
	}
	if p.Security != nil {
		g = append(g, "security")
	}
	if p.Retention != nil {
		g = append(g, "retention")
	}
	if p.AlertChannels != nil {
		g = append(g, "alertChannels")
	}
	return g
}

func merge(a, b FieldErrors) {
	for k, v := range b {
		a[k] = v
	}
}

func fieldsErr(e FieldErrors) error {
	first := ""
	for _, v := range e {
		first = v
		break
	}
	return httpx.ErrData(400, 40001, first, map[string]any{"fields": e})
}

func saveGroup(ctx context.Context, tx *sql.Tx, key string, v any, by string) error {
	b, _ := json.Marshal(v)
	_, err := tx.ExecContext(ctx, `INSERT INTO settings(group_key,value,updated_at,updated_by) VALUES(?,?,UTC_TIMESTAMP(3),?)
		ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)`, key, string(b), by)
	return err
}

// Update 校验 → 单事务落库 → 返回最新全量配置。任一分组校验失败则整体不写入。
func (s *Store) Update(ctx context.Context, by string, p *Patch) (*All, error) {
	if len(p.Touched()) == 0 {
		return nil, httpx.Err(400, "未提交任何配置分组")
	}
	errs := FieldErrors{}
	if p.Basic != nil {
		merge(errs, p.Basic.Normalize())
	}
	if p.Security != nil {
		merge(errs, p.Security.Validate())
	}
	if p.Retention != nil {
		merge(errs, p.Retention.Validate())
	}
	if p.Brand != nil {
		merge(errs, p.Brand.NormalizeColor())
	}
	if p.AlertChannels != nil {
		seen := map[string]bool{}
		for i := range *p.AlertChannels {
			c := &(*p.AlertChannels)[i]
			key := "ch." + c.ID
			merge(errs, ValidateChannel(c, key))
			if c.Name != "" {
				if seen[c.Name] {
					errs[key+".name"] = "渠道名称不能重复"
				}
				seen[c.Name] = true
			}
		}
		if len(*p.AlertChannels) > 50 {
			errs["alertChannels"] = "最多 50 个告警渠道"
		}
	}
	if len(errs) > 0 {
		return nil, fieldsErr(errs)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if p.Basic != nil {
		if err := saveGroup(ctx, tx, "basic", p.Basic, by); err != nil {
			return nil, err
		}
	}
	if p.Security != nil {
		if err := saveGroup(ctx, tx, "security", p.Security, by); err != nil {
			return nil, err
		}
	}
	if p.Retention != nil {
		if err := saveGroup(ctx, tx, "retention", p.Retention, by); err != nil {
			return nil, err
		}
	}
	if p.Brand != nil {
		b := *p.Brand
		ae := FieldErrors{}
		var e FieldErrors
		b.LogoURL, e = s.resolveAsset(ctx, tx, "logo", p.Brand.LogoURL, logoRule, "brand.logoUrl")
		merge(ae, e)
		b.LoginBgURL, e = s.resolveAsset(ctx, tx, "loginbg", p.Brand.LoginBgURL, bgRule, "brand.loginBgUrl")
		merge(ae, e)
		if len(ae) > 0 {
			return nil, fieldsErr(ae)
		}
		if err := saveGroup(ctx, tx, "brand", b, by); err != nil {
			return nil, err
		}
		if err := s.gcAssets(ctx, tx, b); err != nil {
			return nil, err
		}
	}
	if p.AlertChannels != nil {
		if err := s.replaceChannels(ctx, tx, *p.AlertChannels); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.invalidate()
	return s.Get(ctx)
}

func (s *Store) replaceChannels(ctx context.Context, tx *sql.Tx, in []ChannelIn) error {
	existing := map[string][]byte{}
	rows, err := tx.QueryContext(ctx, `SELECT id, secret_enc FROM alert_channels`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var enc []byte
		if err := rows.Scan(&id, &enc); err != nil {
			rows.Close()
			return err
		}
		existing[id] = enc
	}
	rows.Close()

	keep := map[string]bool{}
	for i, c := range in {
		id := c.ID
		_, known := existing[id]
		if !known {
			id = newID("c")
		}
		keep[id] = true
		cfg, _ := json.Marshal(c.Config)
		var enc []byte
		switch {
		case c.Secret != "":
			if enc, err = s.box.Seal(c.Secret); err != nil {
				return err
			}
		case known:
			enc = existing[id] // 沿用已保存密钥
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO alert_channels(id,type,name,enabled,config,secret_enc,sort_no,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))
			ON DUPLICATE KEY UPDATE type=VALUES(type), name=VALUES(name), enabled=VALUES(enabled), config=VALUES(config),
			secret_enc=VALUES(secret_enc), sort_no=VALUES(sort_no), updated_at=VALUES(updated_at)`,
			id, c.Type, c.Name, c.Enabled, string(cfg), nullBytes(enc), i); err != nil {
			return err
		}
	}
	for id := range existing {
		if !keep[id] {
			if _, err := tx.ExecContext(ctx, `DELETE FROM alert_channels WHERE id=?`, id); err != nil {
				return err
			}
		}
	}
	return nil
}

func nullBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

// Reset 把某分组恢复为系统默认值。
func (s *Store) Reset(ctx context.Context, by, group string) (*All, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	switch group {
	case "basic":
		err = saveGroup(ctx, tx, "basic", DefaultBasic(), by)
	case "security":
		err = saveGroup(ctx, tx, "security", DefaultSecurity(), by)
	case "retention":
		err = saveGroup(ctx, tx, "retention", DefaultRetention(), by)
	case "brand":
		b := DefaultBrand()
		if err = saveGroup(ctx, tx, "brand", b, by); err == nil {
			err = s.gcAssets(ctx, tx, b)
		}
	case "alertChannels":
		_, err = tx.ExecContext(ctx, `DELETE FROM alert_channels`)
	default:
		return nil, httpx.Err(400, "未知的配置分组")
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.invalidate()
	return s.Get(ctx)
}
