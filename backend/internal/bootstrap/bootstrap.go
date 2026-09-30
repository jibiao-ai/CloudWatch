// Package bootstrap 首次启动的初始化：内置角色、admin 账号、（可选）演示账号。
// 已有数据时只补缺，不覆盖；绝不重置已存在账号的密码。
package bootstrap

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/config"
	"github.com/jibiao-ai/cloudwatch/internal/perm"
)

type role struct {
	ID, Name, Code, Desc string
	Builtin              bool
	Perms                []string
	Scopes               []map[string]string
}

func roles() []role {
	no := func(prefixes ...string) func(string) bool {
		return func(c string) bool { return !perm.HasPrefixAny(c, prefixes...) }
	}
	viewOnly := perm.Filter(func(c string) bool {
		return strings.HasSuffix(c, ":view") && !perm.HasPrefixAny(c, "role:", "user:", "settings:", "domain:")
	})
	return []role{
		{"r1", "超级管理员", "super_admin", "拥有全部功能权限与数据权限，内置不可修改", true, []string{"*"}, nil},
		{"r2", "云平台运维", "cloud_ops", "平台管理、资源、巡检、监控、告警的日常运维", true,
			perm.Filter(func(c string) bool { return no("role:", "user:", "settings:")(c) && c != "audit:clean" }), nil},
		{"r3", "只读观察员", "viewer", "只读查看资源与监控数据", true, viewOnly, nil},
		{"r4", "安全审计员", "auditor", "审计日志查看与导出", true, []string{"dashboard:view", "audit:view", "audit:export"}, nil},
		{"r5", "生产 SRE（自定义）", "prod_sre", "仅可访问生产与灾备平台", false,
			perm.Filter(no("role:", "user:", "settings:", "audit:clean")),
			[]map[string]string{{"type": "provider", "value": "p1", "effect": "deny"}, {"type": "provider", "value": "p3", "effect": "deny"}}},
	}
}

const pwChars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

func randomPassword() string {
	b := make([]byte, 14)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(pwChars))))
		b[i] = pwChars[n.Int64()]
	}
	return string(b) + "@7a" // 保证满足默认复杂度（大小写/数字/特殊字符）
}

type demoUser struct {
	ID, Username, Name, Email, Dept, Source, Status string
	Roles                                           []string
	MustChange                                      bool
}

var demo = []demoUser{
	{"u2", "zhangwei", "张伟", "zhangwei@cheryfs.cn", "基础架构组", "ldap", "active", []string{"r2"}, false},
	{"u3", "lina", "李娜", "lina@cheryfs.cn", "基础架构组", "ldap", "active", []string{"r5"}, false},
	{"u4", "wangfang", "王芳", "wangfang@cheryfs.cn", "运维中心", "local", "active", []string{"r3"}, false},
	{"u5", "liuyang", "刘洋", "liuyang@cheryfs.cn", "信息安全部", "sso", "active", []string{"r4"}, false},
	{"u6", "chenjie", "陈杰", "chenjie@cheryfs.cn", "运维中心", "local", "disabled", []string{"r2", "r3"}, false},
	{"u7", "zhaolei", "赵磊", "zhaolei@cheryfs.cn", "运维中心", "local", "active", []string{"r3"}, false},
	{"u8", "sunmei", "孙美", "sunmei@cheryfs.cn", "基础架构组", "local", "active", []string{"r2"}, true},
}

func Run(ctx context.Context, db *sql.DB, cfg *config.Config) error {
	now := time.Now().UTC()
	for _, r := range roles() {
		p, _ := json.Marshal(r.Perms)
		sc := r.Scopes
		if sc == nil {
			sc = []map[string]string{}
		}
		s, _ := json.Marshal(sc)
		// 只在角色不存在时插入，避免覆盖管理员已调整的权限
		if _, err := db.ExecContext(ctx, `INSERT IGNORE INTO roles(id,name,code,description,builtin,permissions,data_scopes,created_at) VALUES(?,?,?,?,?,?,?,?)`,
			r.ID, r.Name, r.Code, r.Desc, r.Builtin, string(p), string(s), now); err != nil {
			return err
		}
	}
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE username='admin'`).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		pw, generated := cfg.AdminPassword, false
		mustChange := true
		if pw == "" && cfg.SeedDemo {
			pw, mustChange = "CloudWatch@2026", false // 仅演示模式：与前端演示账号一致
		}
		if pw == "" {
			pw, generated = randomPassword(), true
		}
		h, err := auth.HashPassword(pw)
		if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO users(id,username,name,email,department,source,status,password_hash,must_change_password,password_changed_at,created_at) VALUES('u1','admin','系统管理员','admin@cloudwatch.local','云平台部','local','active',?,?,?,?)`, h, mustChange, now, now); err != nil {
			return err
		}
		_, _ = db.ExecContext(ctx, `INSERT IGNORE INTO user_roles(user_id,role_id) VALUES('u1','r1')`)
		if generated {
			log.Printf("============================================================")
			log.Printf(" 已创建初始管理员  账号: admin   初始密码: %s", pw)
			log.Printf(" 该密码仅在此处输出一次，首次登录将被强制修改。")
			log.Printf("============================================================")
		} else {
			log.Printf("已创建初始管理员 admin（密码来自 CW_ADMIN_PASSWORD，首次登录需修改）")
		}
	}
	if cfg.SeedDemo {
		return seedDemo(ctx, db, cfg, now)
	}
	return nil
}

func seedDemo(ctx context.Context, db *sql.DB, cfg *config.Config, now time.Time) error {
	pw := cfg.AdminPassword
	if pw == "" {
		pw = "CloudWatch@2026"
	}
	h, err := auth.HashPassword(pw)
	if err != nil {
		return err
	}
	for _, d := range demo {
		res, err := db.ExecContext(ctx, `INSERT IGNORE INTO users(id,username,name,email,department,source,status,password_hash,must_change_password,password_changed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
			d.ID, d.Username, d.Name, d.Email, d.Dept, d.Source, d.Status, h, d.MustChange, now, now)
		if err != nil {
			return err
		}
		if c, _ := res.RowsAffected(); c == 0 {
			continue
		}
		for _, r := range d.Roles {
			_, _ = db.ExecContext(ctx, `INSERT IGNORE INTO user_roles(user_id,role_id) VALUES(?,?)`, d.ID, r)
		}
	}
	log.Printf("已写入演示账号（CW_SEED_DEMO=true，仅限开发/演示环境）")
	return nil
}
