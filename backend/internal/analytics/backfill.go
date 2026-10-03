package analytics

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

// 历史回填：策略统计窗口为 30 天，若只靠实时采样需要等满 30 天才能出结果。
// 云平台 Gnocchi 保存有历史聚合数据，首次接入（以及每 7 天）按天回填过去 30 天的汇总，
// 只补库里还没有的日期（INSERT IGNORE），不覆盖已有的实时累计；今天的数据仍由实时采样累计。
const (
	backfillDays   = 30
	backfillEvery  = 7 * 24 * time.Hour
	backfillMaxVMs = 300
)

func (m *Sampler) maybeBackfill(ctx context.Context, id, name string) {
	cur := m.St.cursorOf(ctx, id)
	if !cur.bf.IsZero() && time.Since(cur.bf) < backfillEvery {
		return
	}
	snap, err := m.Mon.Snapshot(ctx, id)
	if err != nil || snap == nil || len(snap.VMs) == 0 {
		return
	}
	m.bfMu.Lock()
	if m.bfOn == nil {
		m.bfOn = map[string]bool{}
	}
	if m.bfOn[id] {
		m.bfMu.Unlock()
		return
	}
	m.bfOn[id] = true
	m.bfMu.Unlock()
	go func() {
		defer func() { m.bfMu.Lock(); delete(m.bfOn, id); m.bfMu.Unlock() }()
		bctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
		defer cancel()
		n, err := m.Backfill(bctx, id, snap.VMs)
		if err != nil {
			log.Printf("运营分析历史回填：平台 %s 失败: %v", name, err)
			return
		}
		log.Printf("运营分析历史回填：平台 %s 完成，回填 %d 条按天汇总", name, n)
		_ = m.St.setCursor(context.Background(), id, "last_backfill_at", time.Now())
	}()
}

// Backfill 读取运行中云主机最近 30 天的按天聚合（Gnocchi 粒度 86400），写入按天汇总表。返回写入条数。
func (m *Sampler) Backfill(ctx context.Context, id string, vms []monitor.VM) (int, error) {
	cn, _, err := m.Prov.Connect(ctx, id)
	if err != nil {
		return 0, err
	}
	since := time.Now().In(CST).AddDate(0, 0, -backfillDays)
	since = time.Date(since.Year(), since.Month(), since.Day(), 0, 0, 0, 0, CST)
	today := time.Now().In(CST).Format("2006-01-02")

	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)
	days := map[string]*DailyUsage{} // vm|day → 汇总
	get := func(vm, day string) *DailyUsage {
		k := vm + "|" + day
		d := days[k]
		if d == nil {
			d = &DailyUsage{VM: vm, Day: day}
			days[k] = d
		}
		return d
	}
	count := 0
	for i := range vms {
		if !strings.EqualFold(vms[i].Status, "ACTIVE") || count >= backfillMaxVMs {
			continue
		}
		count++
		wg.Add(1)
		sem <- struct{}{}
		go func(vid string) {
			defer wg.Done()
			defer func() { <-sem }()
			series := func(metric, agg string) map[string]float64 {
				pts, err := monitor.Measures(ctx, cn, vid, metric, since, 86400, agg)
				if err != nil {
					return nil
				}
				out := make(map[string]float64, len(pts))
				for _, p := range pts {
					day := time.UnixMilli(p.T).UTC().Format("2006-01-02")
					if day >= today {
						continue
					}
					out[day] = p.V
				}
				return out
			}
			// 扩展指标：资源上存在的候选名中取第一个有数据的
			have, _ := monitor.ResourceMetrics(ctx, cn, vid)
			ext := func(key, agg string) map[string]float64 {
				for _, name := range monitor.ExtMetrics[key] {
					if !have[name] {
						continue
					}
					if s := series(name, agg); len(s) > 0 {
						return s
					}
				}
				return nil
			}
			cpuA, cpuX, cpuN := series("cpu_util", "mean"), series("cpu_util", "max"), series("cpu_util", "min")
			memA, memX, memN := series("memory.util", "mean"), series("memory.util", "max"), series("memory.util", "min")
			wr := series("disk.write.bytes.rate", "mean")
			rdy, swp, lat, fs := ext("ready", "mean"), ext("swap", "max"), ext("lat", "mean"), ext("fs", "max")

			mu.Lock()
			defer mu.Unlock()
			for day, v := range cpuA {
				d := get(vid, day)
				d.CPUSum, d.CPUN, d.CPUMax, d.CPUMin = v, 1, pick(cpuX, day, v), pick(cpuN, day, v)
			}
			for day, v := range memA {
				d := get(vid, day)
				d.MemSum, d.MemN, d.MemMax, d.MemMin = v, 1, pick(memX, day, v), pick(memN, day, v)
			}
			for day, v := range wr {
				d := get(vid, day)
				d.WSum, d.WN = v/1024, 1
			}
			for day, v := range rdy {
				d := get(vid, day)
				d.ReadySum, d.ReadyN = v, 1
			}
			for day, v := range swp {
				d := get(vid, day)
				d.SwapMax, d.SwapN = v, 1
			}
			for day, v := range lat {
				d := get(vid, day)
				d.LatSum, d.LatN = v, 1
			}
			for day, v := range fs {
				d := get(vid, day)
				d.FsMax, d.FsN = v, 1
			}
		}(vms[i].ID)
	}
	wg.Wait()
	list := make([]DailyUsage, 0, len(days))
	for _, d := range days {
		list = append(list, *d)
	}
	if err := m.St.backfillUsage(ctx, id, list); err != nil {
		return 0, err
	}
	return len(list), nil
}

func pick(m map[string]float64, day string, def float64) float64 {
	if v, ok := m[day]; ok {
		return v
	}
	return def
}
