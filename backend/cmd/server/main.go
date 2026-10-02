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

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/api"
	"github.com/jibiao-ai/cloudwatch/internal/audit"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/bootstrap"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/config"
	"github.com/jibiao-ai/cloudwatch/internal/db"
	"github.com/jibiao-ai/cloudwatch/internal/hosts"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
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
	hm := hosts.NewManager(hosts.NewStore(d))
	pm := provider.NewManager(d, provider.NewStore(d, box))
	mm := monitor.NewManager(monitor.NewStore(d), pm, st)
	cm := capacity.NewManager(capacity.NewStore(d), pm)
	ast := analytics.NewStore(d)
	sm := analytics.NewSampler(d, ast, cm.Store, mm.Store, pm)
	srv := &api.Server{DB: d, Providers: pm, Monitor: mm, Capacity: cm, Settings: st, Auth: au, Audit: audit.New(d), Retention: retention.New(d, st, au), Hosts: hm, Analytics: &analytics.Engine{St: ast, Cap: cm.Store, Mon: mm.Store}}
	srv.Retention.Start(ctx)
	pm.Start(ctx) // 平台按「同步间隔」后台自动同步；重启时中断的任务置失败
	cm.Start(ctx) // 资产管理：物理节点 / 计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 存储池（间隔不低于 5 分钟）
	sm.Start(ctx) // 运营分析：把资源数量 / 云主机使用率 / 状态历史按时间积累下来
	mm.Start(ctx) // 性能指标采集 + 告警同步（间隔复用平台同步间隔）
	hm.Start(ctx) // 启动即按库中配置同步 hosts / DNS / Docker，重启后自动恢复

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
