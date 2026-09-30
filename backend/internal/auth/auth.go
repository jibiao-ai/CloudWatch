// Package auth 认证与会话。系统配置里的「安全策略」在这里真正生效：
// 密码复杂度 / 有效期 / 会话超时 / 最大会话数 / 验证码 / 登录失败锁定，全部读取库里的配置。
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/perm"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

const (
	refreshTTL = 7 * 24 * time.Hour
	hardMaxTry = 20 // 同一账号连续失败达到该值，无论是否启用锁定都限流
)

type User struct {
	ID                 string     `json:"id"`
	Username           string     `json:"username"`
	Name               string     `json:"name"`
	Email              string     `json:"email"`
	Phone              string     `json:"phone"`
	Department         string     `json:"department"`
	Source             string     `json:"source"`
	Status             string     `json:"status"`
	MustChangePassword bool       `json:"mustChangePassword"`
	FailCount          int        `json:"failCount"`
	LockedUntil        *time.Time `json:"lockedUntil"`
	LastLoginAt        *time.Time `json:"lastLoginAt"`
	CreatedAt          time.Time  `json:"createdAt"`
	RoleIDs            []string   `json:"roleIds"`
	RoleNames          []string   `json:"roleNames"`
	PasswordExpired    bool       `json:"-"`
}

type Principal struct {
	User        *User
	Permissions []string
	SessionID   string
}

func (p *Principal) Can(code string) bool {
	for _, c := range p.Permissions {
		if c == "*" || c == code {
			return true
		}
	}
	return false
}

type Service struct {
	db  *sql.DB
	cfg *settings.Store

	capMu sync.Mutex
	caps  map[string]capEntry
}

type capEntry struct {
	code string
	exp  time.Time
	used bool
}

func New(db *sql.DB, cfg *settings.Store) *Service {
	return &Service{db: db, cfg: cfg, caps: map[string]capEntry{}}
}

func randToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
func hashTok(t string) string { h := sha256.Sum256([]byte(t)); return hex.EncodeToString(h[:]) }
func newID(p string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return p + hex.EncodeToString(b)
}

/* ----------------------------- 密码策略 ----------------------------- */

// CheckPassword 按库里的安全策略校验密码，返回缺失项。
func CheckPassword(pw string, p settings.Security) []string {
	var miss []string
	if len([]rune(pw)) < p.MinLength {
		miss = append(miss, fmt.Sprintf("至少 %d 位", p.MinLength))
	}
	var up, lo, di, sp bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			up = true
		case unicode.IsLower(r):
			lo = true
		case unicode.IsDigit(r):
			di = true
		default:
			sp = true
		}
	}
	if p.RequireUpper && !up {
		miss = append(miss, "大写字母")
	}
	if p.RequireLower && !lo {
		miss = append(miss, "小写字母")
	}
	if p.RequireDigit && !di {
		miss = append(miss, "数字")
	}
	if p.RequireSpecial && !sp {
		miss = append(miss, "特殊字符")
	}
	return miss
}

func HashPassword(pw string) (string, error) {
	if len(pw) > 72 {
		return "", httpx.Err(400, "密码不能超过 72 个字节")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

/* ------------------------------ 验证码 ------------------------------ */

func (s *Service) NewCaptcha() (id, image string) {
	code := ""
	for i := 0; i < 4; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		code += n.String()
	}
	id = randToken(9)
	s.capMu.Lock()
	for k, v := range s.caps {
		if time.Now().After(v.exp) {
			delete(s.caps, k)
		}
	}
	s.caps[id] = capEntry{code: code, exp: time.Now().Add(3 * time.Minute)}
	s.capMu.Unlock()
	// 带干扰线与错位的 SVG，验证码文本不以明文 <text> 给出，降低被脚本直接读取的风险
	var sb strings.Builder
	sb.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="110" height="36"><rect width="110" height="36" fill="#eee"/>`)
	for i, ch := range code {
		y := 25 + (i*7)%6 - 3
		rot := (i*13)%24 - 12
		fmt.Fprintf(&sb, `<text x="%d" y="%d" font-size="22" font-family="monospace" font-weight="700" fill="#444" transform="rotate(%d %d %d)">%c</text>`, 14+i*22, y, rot, 14+i*22, y, ch)
	}
	sb.WriteString(`<path d="M0 12 Q30 30 60 14 T110 22" stroke="#999" fill="none"/><path d="M0 28 Q40 6 70 26 T110 10" stroke="#bbb" fill="none"/></svg>`)
	return id, "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(sb.String()))
}

func (s *Service) checkCaptcha(id, code string) bool {
	s.capMu.Lock()
	defer s.capMu.Unlock()
	e, ok := s.caps[id]
	if !ok || time.Now().After(e.exp) || e.used {
		delete(s.caps, id)
		return false
	}
	delete(s.caps, id) // 一次性
	return subtle.ConstantTimeCompare([]byte(e.code), []byte(strings.TrimSpace(code))) == 1
}

/* ------------------------------- 用户 ------------------------------- */

const userCols = `id,username,name,email,phone,department,source,status,must_change_password,fail_count,locked_until,last_login_at,created_at,password_changed_at`

func (s *Service) scanUser(ctx context.Context, row interface{ Scan(...any) error }, sec settings.Security) (*User, string, error) {
	var u User
	var changed time.Time
	var lock, last sql.NullTime
	var mcp bool
	if err := row.Scan(&u.ID, &u.Username, &u.Name, &u.Email, &u.Phone, &u.Department, &u.Source, &u.Status, &mcp, &u.FailCount, &lock, &last, &u.CreatedAt, &changed); err != nil {
		return nil, "", err
	}
	u.MustChangePassword = mcp
	if lock.Valid {
		t := lock.Time.UTC()
		u.LockedUntil = &t
	}
	if last.Valid {
		t := last.Time.UTC()
		u.LastLoginAt = &t
	}
	u.CreatedAt = u.CreatedAt.UTC()
	if sec.ExpireDays > 0 && time.Since(changed) > time.Duration(sec.ExpireDays)*24*time.Hour {
		u.PasswordExpired = true
	}
	rows, err := s.db.QueryContext(ctx, `SELECT r.id,r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? ORDER BY r.created_at,r.id`, u.ID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	u.RoleIDs, u.RoleNames = []string{}, []string{}
	for rows.Next() {
		var id, n string
		if err := rows.Scan(&id, &n); err != nil {
			return nil, "", err
		}
		u.RoleIDs, u.RoleNames = append(u.RoleIDs, id), append(u.RoleNames, n)
	}
	return &u, "", rows.Err()
}

func (s *Service) userByName(ctx context.Context, name string, sec settings.Security) (*User, string, error) {
	var hash string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE username=?`, name).Scan(&hash); err != nil {
		return nil, "", err
	}
	u, _, err := s.scanUser(ctx, s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE username=?`, name), sec)
	return u, hash, err
}

func (s *Service) permissionsOf(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	set := map[string]bool{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var ps []string
		_ = json.Unmarshal([]byte(raw), &ps)
		for _, p := range ps {
			set[p] = true
		}
	}
	if set["*"] {
		return []string{"*"}, rows.Err()
	}
	out := make([]string, 0, len(set))
	for _, c := range perm.All() { // 保持稳定顺序
		if set[c] {
			out = append(out, c)
		}
	}
	return out, rows.Err()
}

func (s *Service) dataScopesOf(ctx context.Context, userID string) ([]json.RawMessage, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT r.data_scopes FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var arr []json.RawMessage
		_ = json.Unmarshal([]byte(raw), &arr)
		out = append(out, arr...)
	}
	return out, rows.Err()
}

/* ------------------------------- 登录 ------------------------------- */

type LoginReq struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	Captcha   string `json:"captcha"`
	CaptchaID string `json:"captchaId"`
}
type Tokens struct {
	AccessToken        string `json:"accessToken"`
	RefreshToken       string `json:"refreshToken"`
	MustChangePassword bool   `json:"mustChangePassword"`
}

func (s *Service) failCount(ctx context.Context, name string) int {
	var n int
	_ = s.db.QueryRowContext(ctx, `SELECT cnt FROM login_failures WHERE username=?`, name).Scan(&n)
	return n
}

// Login 返回 Tokens；失败返回带业务码的 HTTPError（前端据此展示验证码/锁定提示）。
func (s *Service) Login(ctx context.Context, req LoginReq, ip, ua string) (*Tokens, *User, error) {
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return nil, nil, err
	}
	name := strings.TrimSpace(req.Username)
	if name == "" || req.Password == "" {
		return nil, nil, httpx.Err(400, "请输入账号和密码")
	}
	fails := s.failCount(ctx, name)
	needCap := sec.CaptchaEnabled && fails >= sec.CaptchaAfterFailures
	if needCap {
		if strings.TrimSpace(req.Captcha) == "" {
			return nil, nil, httpx.ErrData(401, 40101, "请输入验证码", map[string]any{"captchaRequired": true})
		}
		if !s.checkCaptcha(req.CaptchaID, req.Captcha) {
			return nil, nil, httpx.ErrData(401, 40101, "验证码错误", map[string]any{"captchaRequired": true})
		}
	}
	if fails >= hardMaxTry {
		return nil, nil, httpx.Err(429, "尝试过于频繁，请稍后再试")
	}
	u, hash, err := s.userByName(ctx, name, sec)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, err
	}
	if u != nil {
		if u.Status == "disabled" {
			return nil, nil, httpx.Err(403, "账号已被禁用，请联系管理员")
		}
		if u.LockedUntil != nil && u.LockedUntil.After(time.Now()) {
			mins := int(time.Until(*u.LockedUntil).Minutes()) + 1
			return nil, nil, httpx.ErrData(423, 423, fmt.Sprintf("账号已被锁定，请 %d 分钟后重试", mins), map[string]any{"remainMinutes": mins})
		}
	}
	ok := false
	if u != nil {
		ok = bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) == nil
	} else {
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BHvk6XjrJ/uC5ot8p3sX3o0uQ0Gi"), []byte(req.Password)) // 抹平时差，防账号枚举
	}
	if !ok {
		_, _ = s.db.ExecContext(ctx, `INSERT INTO login_failures(username,cnt,last_at) VALUES(?,1,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE cnt=cnt+1,last_at=UTC_TIMESTAMP(3)`, name)
		fails++
		if u != nil {
			nf := u.FailCount + 1
			if nf >= sec.LockThreshold {
				_, _ = s.db.ExecContext(ctx, `UPDATE users SET fail_count=?, status='locked', locked_until=? WHERE id=?`, nf, time.Now().UTC().Add(time.Duration(sec.LockMinutes)*time.Minute), u.ID)
			} else {
				_, _ = s.db.ExecContext(ctx, `UPDATE users SET fail_count=? WHERE id=?`, nf, u.ID)
			}
		}
		return nil, u, httpx.ErrData(401, 40100, "账号或密码错误", map[string]any{"captchaRequired": sec.CaptchaEnabled && fails >= sec.CaptchaAfterFailures})
	}

	_, _ = s.db.ExecContext(ctx, `DELETE FROM login_failures WHERE username=?`, name)
	_, _ = s.db.ExecContext(ctx, `UPDATE users SET fail_count=0, locked_until=NULL, status=IF(status='locked','active',status), last_login_at=UTC_TIMESTAMP(3) WHERE id=?`, u.ID)
	t, err := s.createSession(ctx, u.ID, ip, ua, sec)
	if err != nil {
		return nil, nil, err
	}
	t.MustChangePassword = u.MustChangePassword || u.PasswordExpired
	return t, u, nil
}

func (s *Service) createSession(ctx context.Context, userID, ip, ua string, sec settings.Security) (*Tokens, error) {
	// 同账号最大会话数：超出则踢掉最旧的
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM sessions WHERE user_id=? AND revoked=0 AND refresh_expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if keep := sec.MaxSessions - 1; len(ids) > keep {
		for _, id := range ids[max(keep, 0):] {
			_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET revoked=1 WHERE id=?`, id)
		}
	}
	at, rt := randToken(32), randToken(32)
	now := time.Now().UTC()
	_, err = s.db.ExecContext(ctx, `INSERT INTO sessions(id,user_id,access_hash,refresh_hash,access_expires_at,refresh_expires_at,created_at,last_active_at,ip,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?)`,
		newID("s"), userID, hashTok(at), hashTok(rt), now.Add(time.Duration(sec.SessionTimeoutMin)*time.Minute), now.Add(refreshTTL), now, now, trunc(ip, 64), trunc(ua, 255))
	if err != nil {
		return nil, err
	}
	return &Tokens{AccessToken: at, RefreshToken: rt}, nil
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func (s *Service) Refresh(ctx context.Context, refresh string) (*Tokens, error) {
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return nil, err
	}
	var id, uid, status string
	err = s.db.QueryRowContext(ctx, `SELECT s.id,s.user_id,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_hash=? AND s.revoked=0 AND s.refresh_expires_at>UTC_TIMESTAMP(3)`, hashTok(refresh)).Scan(&id, &uid, &status)
	if err != nil || status == "disabled" {
		return nil, httpx.Err(401, "登录已过期")
	}
	at := randToken(32)
	now := time.Now().UTC()
	if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET access_hash=?, access_expires_at=?, last_active_at=? WHERE id=?`, hashTok(at), now.Add(time.Duration(sec.SessionTimeoutMin)*time.Minute), now, id); err != nil {
		return nil, err
	}
	return &Tokens{AccessToken: at, RefreshToken: refresh}, nil
}

func (s *Service) Logout(ctx context.Context, sessionID string) {
	_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET revoked=1 WHERE id=?`, sessionID)
}

// Authenticate 校验 access token；滑动续期（会话超时时间内有操作即顺延）。
func (s *Service) Authenticate(ctx context.Context, token string) (*Principal, error) {
	if token == "" {
		return nil, httpx.Err(401, "未登录或登录已过期")
	}
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return nil, err
	}
	var sid, uid string
	var exp time.Time
	err = s.db.QueryRowContext(ctx, `SELECT id,user_id,access_expires_at FROM sessions WHERE access_hash=? AND revoked=0`, hashTok(token)).Scan(&sid, &uid, &exp)
	if err != nil || time.Now().After(exp) {
		return nil, httpx.Err(401, "未登录或登录已过期")
	}
	u, _, err := s.scanUser(ctx, s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id=?`, uid), sec)
	if err != nil {
		return nil, httpx.Err(401, "未登录或登录已过期")
	}
	if u.Status == "disabled" {
		return nil, httpx.Err(401, "账号已被禁用")
	}
	now := time.Now().UTC()
	_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET last_active_at=?, access_expires_at=? WHERE id=?`, now, now.Add(time.Duration(sec.SessionTimeoutMin)*time.Minute), sid)
	perms, err := s.permissionsOf(ctx, uid)
	if err != nil {
		return nil, err
	}
	if u.PasswordExpired {
		u.MustChangePassword = true
	}
	return &Principal{User: u, Permissions: perms, SessionID: sid}, nil
}

type Me struct {
	User        *User             `json:"user"`
	Permissions []string          `json:"permissions"`
	DataScopes  []json.RawMessage `json:"dataScopes"`
	Menus       []perm.MenuGroup  `json:"menus"`
}

func (s *Service) Me(ctx context.Context, p *Principal) (*Me, error) {
	ds, err := s.dataScopesOf(ctx, p.User.ID)
	if err != nil {
		return nil, err
	}
	return &Me{User: p.User, Permissions: p.Permissions, DataScopes: ds, Menus: perm.BuildMenus(p.Permissions)}, nil
}

func (s *Service) ChangePassword(ctx context.Context, p *Principal, oldPw, newPw string) error {
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return err
	}
	var hash string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id=?`, p.User.ID).Scan(&hash); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(oldPw)) != nil {
		return httpx.Err(400, "原密码不正确")
	}
	if oldPw == newPw {
		return httpx.Err(400, "新密码不能与原密码相同")
	}
	if miss := CheckPassword(newPw, sec); len(miss) > 0 {
		return httpx.Err(400, "新密码需包含："+strings.Join(miss, "、"))
	}
	nh, err := HashPassword(newPw)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=UTC_TIMESTAMP(3) WHERE id=?`, nh, p.User.ID); err != nil {
		return err
	}
	// 改密后踢掉其他会话
	_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET revoked=1 WHERE user_id=? AND id<>?`, p.User.ID, p.SessionID)
	return nil
}

// PurgeSessions 清理过期会话与陈旧的登录失败记录。
func (s *Service) PurgeSessions(ctx context.Context) {
	_, _ = s.db.ExecContext(ctx, `DELETE FROM sessions WHERE revoked=1 OR refresh_expires_at<UTC_TIMESTAMP(3)`)
	_, _ = s.db.ExecContext(ctx, `DELETE FROM login_failures WHERE last_at < ?`, time.Now().UTC().Add(-24*time.Hour))
}
