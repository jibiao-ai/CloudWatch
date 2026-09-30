// Package config 只承载「进程引导」所需的环境变量（数据库连接、监听地址）。
// 铁律：所有业务参数（平台名称、安全策略、告警渠道、数据保留……）一律在页面录入并入库，
// 不得写进配置文件或环境变量；这里仅有无法在页面配置的引导项。
package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct {
	Addr          string // 监听地址，默认 :8080
	DSN           string // MySQL/MariaDB 连接串（必填）
	SecretKey     string // 可选：渠道密钥加密主密钥；为空则首次启动自动生成并存入数据库
	AdminPassword string // 可选：初始 admin 密码；为空则随机生成并仅在首次启动日志输出一次，且强制首次改密
	SeedDemo      bool   // 仅开发/演示：写入演示账号（与前端 mock 对齐）
}

func Load() (*Config, error) {
	c := &Config{
		Addr:          env("CW_ADDR", ":8080"),
		DSN:           os.Getenv("CW_DB_DSN"),
		SecretKey:     os.Getenv("CW_SECRET_KEY"),
		AdminPassword: os.Getenv("CW_ADMIN_PASSWORD"),
		SeedDemo:      strings.EqualFold(os.Getenv("CW_SEED_DEMO"), "true"),
	}
	if c.DSN == "" {
		return nil, errors.New("缺少环境变量 CW_DB_DSN，例如：user:pass@tcp(127.0.0.1:3306)/cloudwatch")
	}
	return c, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
