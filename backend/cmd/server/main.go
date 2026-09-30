// CloudWatch 后端入口。配置：仅引导项走环境变量（CW_DB_DSN / CW_ADDR / CW_SECRET_KEY / CW_ADMIN_PASSWORD / CW_SEED_DEMO），
// 其余所有业务参数都在「系统配置」页面录入并存库。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/api"
	"github.com/jibiao-ai/cloudwatch/internal/audit"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/bootstrap"
	"github.com/jibiao-ai/cloudwatch/internal/config"
	"github.com/jibiao-ai/cloudwatch/internal/db"
	"github.com/jibiao-ai/cloudwatch/internal/retention"
	"github.com/jibiao-ai/cloudwatch/internal/secrets"
	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	d, err := db.Open(cfg.DSN)
	if err != nil {
		log.Fatalf("连接数据库失败: %v", err)
	}
	defer d.Close()
	if err := db.Migrate(d); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := bootstrap.Run(ctx, d, cfg); err != nil {
		log.Fatalf("初始化失败: %v", err)
	}
	box, err := secrets.Load(d, cfg.SecretKey)
	if err != nil {
		log.Fatalf("加载加密密钥失败: %v", err)
	}
	st := settings.New(d, box)
	au := auth.New(d, st)
	srv := &api.Server{DB: d, Settings: st, Auth: au, Audit: audit.New(d), Retention: retention.New(d, st, au)}
	srv.Retention.Start(ctx)

	hs := &http.Server{
		Addr: cfg.Addr, Handler: srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 120 * time.Second,
		MaxHeaderBytes: 1 << 16,
	}
	go func() {
		log.Printf("CloudWatch 后端已启动 %s", cfg.Addr)
		if err := hs.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	sc, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = hs.Shutdown(sc)
	log.Printf("已优雅退出")
}
