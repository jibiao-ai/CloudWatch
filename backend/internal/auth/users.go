package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/perm"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

/*
 用户管理（落库）：此前「用户管理」只写在浏览器 mock 里，用户从未进入 MariaDB，
 所以新建用户用初始密码登录会得到「账号或密码错误」。这里是真实的用户存储，
 与 /auth/login 使用同一张 users 表、同一套 bcrypt 校验与安全策略。
*/

var usernameRe = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$`)

// UserInput 新增 / 编辑用户的入参（编辑时 Username / Source 忽略）。
type UserInput struct {
	Username   string   `json:"username"`
	Name       string   `json:"name"`
	Email      string   `json:"email"`
	Phone      string   `json:"phone"`
	Department string   `json:"department"`
	Source     string   `json:"source"`
	Status     string   `json:"status"`
	RoleIDs    []string `json:"roleIds"`
}

type UserQuery struct {
	Keyword, Status, RoleID string
	SortKey, SortOrder      string
	Page, PageSize          int // PageSize=0 → 不分页（导出）
}

var userSortCols = map[string]string{
	"username": "u.username", "name": "u.name", "email": "u.email", "department": "u.department",
	"status": "u.status", "lastLoginAt": "u.last_login_at", "createdAt": "u.created_at",
}

func likeEsc(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (q UserQuery) where() (string, []any) {
	var cond []string
	var args []any
	if k := strings.TrimSpace(q.Keyword); k != "" {
		l := "%" + likeEsc(k) + "%"
		cond = append(cond, "(u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.department LIKE ?)")
		args = append(args, l, l, l, l)
	}
	if q.Status != "" {
		cond = append(cond, "u.status=?")
		args = append(args, q.Status)
	}
	if q.RoleID != "" {
		cond = append(cond, "EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_id=?)")
		args = append(args, q.RoleID)
	}
	if len(cond) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(cond, " AND "), args
}

type UserPage struct {
	List     []*User `json:"list"`
	Total    int     `json:"total"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
}

func (s *Service) ListUsers(ctx context.Context, q UserQuery) (*UserPage, error) {
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return nil, err
	}
	w, args := q.where()
	pg := &UserPage{List: []*User{}, Page: q.Page, PageSize: q.PageSize}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users u`+w, args...).Scan(&pg.Total); err != nil {
		return nil, err
	}
	order := " ORDER BY u.created_at ASC, u.id"
	if c, ok := userSortCols[q.SortKey]; ok {
		dir := "ASC"
		if q.SortOrder == "desc" {
			dir = "DESC"
		}
		order = " ORDER BY " + c + " " + dir + ", u.id"
	}
	cols := "u." + strings.ReplaceAll(userCols, ",", ",u.")
	sqlStr := `SELECT ` + cols + ` FROM users u` + w + order
	if q.PageSize > 0 {
		if q.Page < 1 {
			q.Page = 1
		}
		sqlStr += ` LIMIT ? OFFSET ?`
		args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	} else {
		sqlStr += ` LIMIT 5000`
	}
	rows, err := s.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	var tmp []*User
	for rows.Next() {
		var u User
		// scanUser 会再发一次查询，这里先只取基础列，关闭游标后再补角色，避免占用多条连接
		var changed time.Time
		var lock, last sql.NullTime
		if err := rows.Scan(&u.ID, &u.Username, &u.Name, &u.Email, &u.Phone, &u.Department, &u.Source, &u.Status, &u.MustChangePassword, &u.FailCount, &lock, &last, &u.CreatedAt, &changed); err != nil {
			rows.Close()
			return nil, err
		}
		if lock.Valid {
			t := lock.Time.UTC()
			u.LockedUntil = &t
		}
		if last.Valid {
			t := last.Time.UTC()
			u.LastLoginAt = &t
		}
		u.CreatedAt = u.CreatedAt.UTC()
		tmp = append(tmp, &u)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	_ = sec
	for _, u := range tmp {
		if err := s.fillRoles(ctx, u); err != nil {
			return nil, err
		}
	}
	pg.List = tmp
	if pg.List == nil {
		pg.List = []*User{}
	}
	return pg, nil
}

func (s *Service) fillRoles(ctx context.Context, u *User) error {
	rows, err := s.db.QueryContext(ctx, `SELECT r.id,r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? ORDER BY r.created_at,r.id`, u.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	u.RoleIDs, u.RoleNames = []string{}, []string{}
	for rows.Next() {
		var id, n string
		if err := rows.Scan(&id, &n); err != nil {
			return err
		}
		u.RoleIDs, u.RoleNames = append(u.RoleIDs, id), append(u.RoleNames, n)
	}
	return rows.Err()
}

func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return nil, err
	}
	u, _, err := s.scanUser(ctx, s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id=?`, id), sec)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpx.Err(404, "用户不存在")
	}
	return u, err
}

// RandomPassword 生成满足当前密码策略的随机密码（用于初始密码 / 重置密码）。
func RandomPassword(sec settings.Security) string {
	const up, lo, di, sp = "ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%^&*"
	n := sec.MinLength
	if n < 12 {
		n = 12
	}
	if n > 32 {
		n = 32
	}
	pick := func(set string) byte {
		x, _ := rand.Int(rand.Reader, big.NewInt(int64(len(set))))
		return set[x.Int64()]
	}
	b := []byte{pick(up), pick(lo), pick(di), pick(sp)} // 四类各一个，必然满足任意复杂度开关
	all := up + lo + di
	for len(b) < n {
		b = append(b, pick(all))
	}
	for i := len(b) - 1; i > 0; i-- { // 洗牌
		j, _ := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		b[i], b[j.Int64()] = b[j.Int64()], b[i]
	}
	return string(b)
}

func (s *Service) checkRoleIDs(ctx context.Context, ids []string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		var n int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles WHERE id=?`, id).Scan(&n); err != nil {
			return nil, err
		}
		if n == 0 {
			return nil, httpx.Err(400, "所选角色不存在")
		}
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil, httpx.Err(400, "请至少选择一个角色")
	}
	return out, nil
}

func (s *Service) dupCheck(ctx context.Context, in UserInput, selfID string) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE username=? AND id<>?`, in.Username, selfID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return httpx.Err(400, "用户名「"+in.Username+"」已存在")
	}
	if in.Email != "" {
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE email=? AND id<>?`, in.Email, selfID).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return httpx.Err(400, "邮箱「"+in.Email+"」已被使用")
		}
	}
	return nil
}

func trimIn(in *UserInput) {
	in.Username, in.Name, in.Email = strings.TrimSpace(in.Username), strings.TrimSpace(in.Name), strings.TrimSpace(in.Email)
	in.Phone, in.Department = strings.TrimSpace(in.Phone), strings.TrimSpace(in.Department)
}

// CreateUser 新建本地用户：随机初始密码（满足安全策略），首次登录强制改密。返回用户与一次性初始密码。
func (s *Service) CreateUser(ctx context.Context, in UserInput) (*User, string, error) {
	trimIn(&in)
	if !usernameRe.MatchString(in.Username) {
		return nil, "", httpx.Err(400, "用户名为 3~32 位，字母开头，可含数字 _ . -")
	}
	if in.Name == "" {
		return nil, "", httpx.Err(400, "请输入姓名")
	}
	if len([]rune(in.Name)) > 64 || len(in.Email) > 128 || len(in.Phone) > 32 || len([]rune(in.Department)) > 64 {
		return nil, "", httpx.Err(400, "字段长度超出限制")
	}
	roleIDs, err := s.checkRoleIDs(ctx, in.RoleIDs)
	if err != nil {
		return nil, "", err
	}
	if err := s.dupCheck(ctx, in, ""); err != nil {
		return nil, "", err
	}
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return nil, "", err
	}
	pw := RandomPassword(sec)
	hash, err := HashPassword(pw)
	if err != nil {
		return nil, "", err
	}
	src := in.Source
	if src != "ldap" && src != "sso" {
		src = "local"
	}
	status := "active"
	if in.Status == "disabled" {
		status = "disabled"
	}
	id := newID("u")
	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,username,name,email,phone,department,source,status,password_hash,must_change_password,password_changed_at,fail_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,0,?)`,
		id, in.Username, in.Name, in.Email, in.Phone, in.Department, src, status, hash, now, now); err != nil {
		return nil, "", err
	}
	for _, rid := range roleIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO user_roles(user_id,role_id) VALUES(?,?)`, id, rid); err != nil {
			return nil, "", err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	u, err := s.GetUser(ctx, id)
	return u, pw, err
}

// activeSupers 返回「启用状态且持有 * 权限」的用户 ID。
func (s *Service) activeSupers(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status<>'disabled' AND r.permissions LIKE '%"*"%'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func contains(a []string, x string) bool {
	for _, v := range a {
		if v == x {
			return true
		}
	}
	return false
}

// guardLastSuper 保证变更后至少还剩一个启用的超级管理员。nextRoleIDs 非空表示这些目标将被改成该角色集合。
func (s *Service) guardLastSuper(ctx context.Context, targets []string, nextRoleIDs []string) error {
	supers, err := s.activeSupers(ctx)
	if err != nil {
		return err
	}
	hit := false
	for _, t := range targets {
		if contains(supers, t) {
			hit = true
		}
	}
	if !hit {
		return nil
	}
	keepSuper := false
	if nextRoleIDs != nil {
		for _, rid := range nextRoleIDs {
			var p string
			if err := s.db.QueryRowContext(ctx, `SELECT permissions FROM roles WHERE id=?`, rid).Scan(&p); err == nil && strings.Contains(p, `"*"`) {
				keepSuper = true
			}
		}
	}
	remain := 0
	for _, id := range supers {
		if !contains(targets, id) || keepSuper {
			remain++
		}
	}
	if remain == 0 {
		return httpx.Err(400, "不能禁用/降权最后一个超级管理员")
	}
	return nil
}

func (s *Service) revokeSessions(ctx context.Context, userIDs ...string) {
	for _, id := range userIDs {
		_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET revoked=1 WHERE user_id=?`, id)
	}
}

// UpdateUser 编辑用户（用户名 / 来源不可改）。operatorID 用于禁止禁用自己。
func (s *Service) UpdateUser(ctx context.Context, id, operatorID string, in UserInput) (*User, error) {
	cur, err := s.GetUser(ctx, id)
	if err != nil {
		return nil, err
	}
	trimIn(&in)
	in.Username = cur.Username
	if in.Name == "" {
		return nil, httpx.Err(400, "请输入姓名")
	}
	if len([]rune(in.Name)) > 64 || len(in.Email) > 128 || len(in.Phone) > 32 || len([]rune(in.Department)) > 64 {
		return nil, httpx.Err(400, "字段长度超出限制")
	}
	if err := s.dupCheck(ctx, in, id); err != nil {
		return nil, err
	}
	var roleIDs []string
	if in.RoleIDs != nil {
		if roleIDs, err = s.checkRoleIDs(ctx, in.RoleIDs); err != nil {
			return nil, err
		}
		if err := s.guardLastSuper(ctx, []string{id}, roleIDs); err != nil {
			return nil, err
		}
	}
	status := cur.Status
	switch in.Status {
	case "disabled":
		if id == operatorID {
			return nil, httpx.Err(400, "不能禁用自己")
		}
		if cur.Status != "disabled" {
			if err := s.guardLastSuper(ctx, []string{id}, nil); err != nil {
				return nil, err
			}
		}
		status = "disabled"
	case "active":
		status = "active"
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE users SET name=?,email=?,phone=?,department=?,status=? WHERE id=?`, in.Name, in.Email, in.Phone, in.Department, status, id); err != nil {
		return nil, err
	}
	if status == "active" && cur.Status != "active" {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET fail_count=0, locked_until=NULL WHERE id=?`, id); err != nil {
			return nil, err
		}
	}
	if roleIDs != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM user_roles WHERE user_id=?`, id); err != nil {
			return nil, err
		}
		for _, rid := range roleIDs {
			if _, err := tx.ExecContext(ctx, `INSERT INTO user_roles(user_id,role_id) VALUES(?,?)`, id, rid); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	if status == "disabled" {
		s.revokeSessions(ctx, id)
	}
	return s.GetUser(ctx, id)
}

// SetStatus 批量启用 / 禁用。
func (s *Service) SetStatus(ctx context.Context, ids []string, status, operatorID string) error {
	if status != "active" && status != "disabled" {
		return httpx.Err(400, "状态不合法")
	}
	if len(ids) == 0 {
		return httpx.Err(400, "请选择用户")
	}
	if status == "disabled" {
		if contains(ids, operatorID) {
			return httpx.Err(400, "不能禁用自己")
		}
		if err := s.guardLastSuper(ctx, ids, nil); err != nil {
			return err
		}
	}
	for _, id := range ids {
		if status == "active" {
			_, _ = s.db.ExecContext(ctx, `UPDATE users SET status='active', fail_count=0, locked_until=NULL WHERE id=?`, id)
			_, _ = s.db.ExecContext(ctx, `DELETE FROM login_failures WHERE username=(SELECT username FROM users WHERE id=?)`, id)
		} else {
			_, _ = s.db.ExecContext(ctx, `UPDATE users SET status='disabled' WHERE id=?`, id)
		}
	}
	if status == "disabled" {
		s.revokeSessions(ctx, ids...)
	}
	return nil
}

// DeleteUsers 删除用户及其角色关联、会话；返回被删用户名。
func (s *Service) DeleteUsers(ctx context.Context, ids []string, operatorID string) ([]string, error) {
	if len(ids) == 0 {
		return nil, httpx.Err(400, "请选择用户")
	}
	if contains(ids, operatorID) {
		return nil, httpx.Err(400, "不能删除自己")
	}
	supers, err := s.activeSupers(ctx)
	if err != nil {
		return nil, err
	}
	if len(supers) > 0 {
		all := true
		for _, sid := range supers {
			if !contains(ids, sid) {
				all = false
			}
		}
		if all {
			return nil, httpx.Err(400, "不能删除最后一个超级管理员")
		}
	}
	var names []string
	for _, id := range ids {
		var name string
		if err := s.db.QueryRowContext(ctx, `SELECT username FROM users WHERE id=?`, id).Scan(&name); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return nil, err
		}
		names = append(names, name)
	}
	if len(names) == 0 {
		return nil, httpx.Err(404, "用户不存在")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	for _, id := range ids {
		for _, q := range []string{
			`DELETE FROM login_failures WHERE username=(SELECT username FROM users WHERE id=?)`,
			`DELETE FROM sessions WHERE user_id=?`, `DELETE FROM user_roles WHERE user_id=?`, `DELETE FROM users WHERE id=?`,
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return nil, err
			}
		}
	}
	return names, tx.Commit()
}

func (s *Service) UnlockUser(ctx context.Context, id string) (string, error) {
	u, err := s.GetUser(ctx, id)
	if err != nil {
		return "", err
	}
	st := u.Status
	if st == "locked" {
		st = "active"
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET status=?, fail_count=0, locked_until=NULL WHERE id=?`, st, id); err != nil {
		return "", err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM login_failures WHERE username=?`, u.Username)
	return u.Username, nil
}

// ResetPassword 重置为随机密码并强制下次登录改密，同时踢掉已有会话。
func (s *Service) ResetPassword(ctx context.Context, id string) (string, string, error) {
	u, err := s.GetUser(ctx, id)
	if err != nil {
		return "", "", err
	}
	sec, err := s.cfg.Security(ctx)
	if err != nil {
		return "", "", err
	}
	pw := RandomPassword(sec)
	hash, err := HashPassword(pw)
	if err != nil {
		return "", "", err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash=?, must_change_password=1, password_changed_at=UTC_TIMESTAMP(3), fail_count=0, locked_until=NULL, status=IF(status='locked','active',status) WHERE id=?`, hash, id); err != nil {
		return "", "", err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM login_failures WHERE username=?`, u.Username)
	s.revokeSessions(ctx, id)
	return u.Username, pw, nil
}

/* ------------------------------- 角色 ------------------------------- */

type Role struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Code        string          `json:"code"`
	Description string          `json:"description"`
	Builtin     bool            `json:"builtin"`
	Permissions []string        `json:"permissions"`
	DataScopes  json.RawMessage `json:"dataScopes"`
	UserCount   int             `json:"userCount"`
	CreatedAt   time.Time       `json:"createdAt"`
}

type RoleInput struct {
	Name        string            `json:"name"`
	Code        string            `json:"code"`
	Description string            `json:"description"`
	Permissions []string          `json:"permissions"`
	DataScopes  []json.RawMessage `json:"dataScopes"`
}

var roleCodeRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,31}$`)

const roleCols = `r.id,r.name,r.code,r.description,r.builtin,r.permissions,r.data_scopes,r.created_at,(SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id=r.id)`

func scanRole(row interface{ Scan(...any) error }) (*Role, error) {
	var r Role
	var perms, scopes string
	if err := row.Scan(&r.ID, &r.Name, &r.Code, &r.Description, &r.Builtin, &perms, &scopes, &r.CreatedAt, &r.UserCount); err != nil {
		return nil, err
	}
	r.CreatedAt = r.CreatedAt.UTC()
	r.Permissions = []string{}
	_ = json.Unmarshal([]byte(perms), &r.Permissions)
	if r.Permissions == nil {
		r.Permissions = []string{}
	}
	if !json.Valid([]byte(scopes)) || strings.TrimSpace(scopes) == "" || strings.TrimSpace(scopes) == "null" {
		scopes = "[]"
	}
	r.DataScopes = json.RawMessage(scopes)
	return &r, nil
}

type RoleQuery struct {
	Keyword, Type  string
	Page, PageSize int // PageSize=0 → 全量
}

type RolePage struct {
	List     []*Role `json:"list"`
	Total    int     `json:"total"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
}

func (s *Service) ListRoles(ctx context.Context, q RoleQuery) (*RolePage, error) {
	var cond []string
	var args []any
	if k := strings.TrimSpace(q.Keyword); k != "" {
		l := "%" + likeEsc(k) + "%"
		cond = append(cond, "(r.name LIKE ? OR r.code LIKE ? OR r.description LIKE ?)")
		args = append(args, l, l, l)
	}
	switch q.Type {
	case "builtin":
		cond = append(cond, "r.builtin=1")
	case "custom":
		cond = append(cond, "r.builtin=0")
	}
	w := ""
	if len(cond) > 0 {
		w = " WHERE " + strings.Join(cond, " AND ")
	}
	pg := &RolePage{List: []*Role{}, Page: q.Page, PageSize: q.PageSize}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles r`+w, args...).Scan(&pg.Total); err != nil {
		return nil, err
	}
	sqlStr := `SELECT ` + roleCols + ` FROM roles r` + w + ` ORDER BY r.builtin DESC, r.created_at, r.id`
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
	for rows.Next() {
		r, err := scanRole(rows)
		if err != nil {
			return nil, err
		}
		pg.List = append(pg.List, r)
	}
	return pg, rows.Err()
}

func (s *Service) GetRole(ctx context.Context, id string) (*Role, error) {
	r, err := scanRole(s.db.QueryRowContext(ctx, `SELECT `+roleCols+` FROM roles r WHERE r.id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpx.Err(404, "角色不存在")
	}
	return r, err
}

// RoleUsers 角色下的用户。
func (s *Service) RoleUsers(ctx context.Context, id string) ([]*User, error) {
	if _, err := s.GetRole(ctx, id); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT user_id FROM user_roles WHERE role_id=?`, id)
	if err != nil {
		return nil, err
	}
	var ids []string
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, uid)
	}
	rows.Close()
	out := []*User{}
	for _, uid := range ids {
		u, err := s.GetUser(ctx, uid)
		if err != nil {
			continue
		}
		out = append(out, u)
	}
	return out, nil
}

func (s *Service) roleDup(ctx context.Context, name, code, selfID string) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles WHERE code=? AND id<>?`, code, selfID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return httpx.Err(400, "角色编码「"+code+"」已存在")
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM roles WHERE name=? AND id<>?`, name, selfID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return httpx.Err(400, "角色名称「"+name+"」已存在")
	}
	return nil
}

// cleanPerms 去重并丢弃未知权限码；自定义角色不允许 *。
func cleanPerms(in []string) []string {
	known := map[string]bool{}
	for _, c := range perm.All() {
		known[c] = true
	}
	seen := map[string]bool{}
	out := []string{}
	for _, c := range in {
		if known[c] && !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	return out
}

func scopesJSON(in []json.RawMessage) string {
	if in == nil {
		in = []json.RawMessage{}
	}
	b, err := json.Marshal(in)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func validRoleIn(in *RoleInput, withCode bool) error {
	in.Name, in.Code, in.Description = strings.TrimSpace(in.Name), strings.TrimSpace(in.Code), strings.TrimSpace(in.Description)
	if in.Name == "" || len([]rune(in.Name)) > 64 {
		return httpx.Err(400, "请输入角色名称（不超过 64 字）")
	}
	if withCode && !roleCodeRe.MatchString(in.Code) {
		return httpx.Err(400, "角色编码为小写字母开头，可含数字与下划线（2~32 位）")
	}
	if len([]rune(in.Description)) > 255 {
		return httpx.Err(400, "角色描述不超过 255 字")
	}
	return nil
}

func (s *Service) CreateRole(ctx context.Context, in RoleInput) (*Role, error) {
	if err := validRoleIn(&in, true); err != nil {
		return nil, err
	}
	if err := s.roleDup(ctx, in.Name, in.Code, ""); err != nil {
		return nil, err
	}
	id := newID("r")
	pb, _ := json.Marshal(cleanPerms(in.Permissions))
	if _, err := s.db.ExecContext(ctx, `INSERT INTO roles(id,name,code,description,builtin,permissions,data_scopes,created_at) VALUES(?,?,?,?,0,?,?,?)`,
		id, in.Name, in.Code, in.Description, string(pb), scopesJSON(in.DataScopes), time.Now().UTC()); err != nil {
		return nil, err
	}
	return s.GetRole(ctx, id)
}

func (s *Service) CopyRole(ctx context.Context, srcID, name, code string) (*Role, error) {
	src, err := s.GetRole(ctx, srcID)
	if err != nil {
		return nil, err
	}
	in := RoleInput{Name: name, Code: code, Description: src.Description}
	if err := validRoleIn(&in, true); err != nil {
		return nil, err
	}
	if err := s.roleDup(ctx, in.Name, in.Code, ""); err != nil {
		return nil, err
	}
	perms := src.Permissions
	if contains(perms, "*") { // 复制超级管理员 → 展开为全部具体权限，自定义角色不持有 *
		perms = perm.All()
	}
	pb, _ := json.Marshal(perms)
	id := newID("r")
	if _, err := s.db.ExecContext(ctx, `INSERT INTO roles(id,name,code,description,builtin,permissions,data_scopes,created_at) VALUES(?,?,?,?,0,?,?,?)`,
		id, in.Name, in.Code, in.Description, string(pb), string(src.DataScopes), time.Now().UTC()); err != nil {
		return nil, err
	}
	return s.GetRole(ctx, id)
}

func (s *Service) UpdateRole(ctx context.Context, id string, in RoleInput) (*Role, error) {
	cur, err := s.GetRole(ctx, id)
	if err != nil {
		return nil, err
	}
	if cur.Builtin {
		return nil, httpx.Err(400, "内置角色不可修改，请「复制为新角色」后再调整")
	}
	in.Code = cur.Code
	if err := validRoleIn(&in, false); err != nil {
		return nil, err
	}
	if err := s.roleDup(ctx, in.Name, cur.Code, id); err != nil {
		return nil, err
	}
	pb, _ := json.Marshal(cleanPerms(in.Permissions))
	if _, err := s.db.ExecContext(ctx, `UPDATE roles SET name=?,description=?,permissions=?,data_scopes=? WHERE id=?`, in.Name, in.Description, string(pb), scopesJSON(in.DataScopes), id); err != nil {
		return nil, err
	}
	return s.GetRole(ctx, id)
}

func (s *Service) DeleteRole(ctx context.Context, id string) (string, error) {
	r, err := s.GetRole(ctx, id)
	if err != nil {
		return "", err
	}
	if r.Builtin {
		return "", httpx.Err(400, "内置角色不可删除")
	}
	if r.UserCount > 0 {
		return "", httpx.Err(400, "该角色下仍有用户，请先调整用户角色")
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM roles WHERE id=?`, id)
	return r.Name, err
}

// RolePerms 给定角色集合的权限并集（用于「不能授予超出自己的权限」校验）。含 * 返回 ["*"]。
func (s *Service) RolePerms(ctx context.Context, roleIDs []string) ([]string, error) {
	set := map[string]bool{}
	for _, id := range roleIDs {
		var raw string
		if err := s.db.QueryRowContext(ctx, `SELECT permissions FROM roles WHERE id=?`, id).Scan(&raw); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return nil, err
		}
		var ps []string
		_ = json.Unmarshal([]byte(raw), &ps)
		for _, p := range ps {
			set[p] = true
		}
	}
	if set["*"] {
		return []string{"*"}, nil
	}
	out := []string{}
	for p := range set {
		out = append(out, p)
	}
	return out, nil
}

// CleanPerms 暴露给 handler 做越权校验（与落库口径一致）。
func CleanPerms(in []string) []string { return cleanPerms(in) }
