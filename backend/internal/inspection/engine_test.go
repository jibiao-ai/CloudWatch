package inspection

import (
	"testing"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

func fp2(v float64) *float64 { return &v }

func TestNormalize(t *testing.T) {
	c := DefaultConfig()
	if e := c.Normalize(); len(e) != 0 {
		t.Fatalf("默认配置应通过校验: %v", e)
	}
	c.Thresholds.StorageWarn, c.Thresholds.StorageBad = 90, 80
	if e := c.Normalize(); e["storage"] == "" {
		t.Fatal("预警阈值大于异常阈值应报错")
	}
	c = DefaultConfig()
	c.Thresholds.RunwayWarn, c.Thresholds.RunwayBad = 30, 90
	if e := c.Normalize(); e["runway"] == "" {
		t.Fatal("天数口径：异常必须小于预警")
	}
	c = DefaultConfig()
	c.Thresholds.SSDLifeBad = 101
	if e := c.Normalize(); e["ssdLife"] == "" {
		t.Fatal("超出范围应报错")
	}
	c = DefaultConfig()
	c.Schedule.Time = "25:00"
	if e := c.Normalize(); e["time"] == "" {
		t.Fatal("非法执行时间应报错")
	}
	c = DefaultConfig()
	for _, d := range Catalog {
		c.Disabled = append(c.Disabled, d.Key)
	}
	if e := c.Normalize(); e["disabled"] == "" {
		t.Fatal("不能停用全部检查项")
	}
}

func TestGradeAndScore(t *testing.T) {
	if grade(70, 70, 85) != Warn || grade(85, 70, 85) != Bad || grade(69.9, 70, 85) != OK {
		t.Fatal("grade 边界错误")
	}
	if worse(OK, Warn) != Warn || worse(Bad, Warn) != Bad || worse(NA, OK) != OK {
		t.Fatal("worse 错误")
	}
	cases := []struct {
		c    Counts
		want int
	}{
		{Counts{OK: 10}, 100},
		{Counts{OK: 10, NA: 4}, 100}, // 未采集不参与评分
		{Counts{OK: 10, Warn: 2, Bad: 1}, 88},
		{Counts{OK: 11, Bad: 3, NA: 7}, 82},
		{Counts{OK: 3, Warn: 6, Bad: 11, NA: 1}, 43}, // 此前被算成 0 分
		{Counts{OK: 99, Warn: 1}, 94},                // 有预警不应满分
		{Counts{OK: 99, Bad: 1}, 89},                 // 有异常不应显示优秀
		{Counts{Bad: 20}, 15},
		{Counts{NA: 3}, 0}, // 全部未采集无法评估
	}
	for _, tc := range cases {
		if got := scoreOf(tc.c); got != tc.want {
			t.Fatalf("scoreOf(%+v)=%d，期望 %d", tc.c, got, tc.want)
		}
	}
	if s := scoreOf(Counts{Bad: 1000}); s < 1 {
		t.Fatal("有采集数据时评分不应为 0")
	}
	if overallOf(Counts{OK: 3, Warn: 1}) != Warn || overallOf(Counts{OK: 1, Bad: 1}) != Bad || overallOf(Counts{NA: 2}) != NA || overallOf(Counts{OK: 2}) != OK {
		t.Fatal("overallOf 错误")
	}
}

func TestScheduleDue(t *testing.T) {
	s := Schedule{Enabled: true, Mode: "daily", Time: "02:00", Weekday: 1}
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, analytics.CST) // 周一
	if _, ok := scheduleDue(s, day.Add(2*time.Hour+10*time.Minute)); !ok {
		t.Fatal("02:10 应在触发窗口内")
	}
	if _, ok := scheduleDue(s, day.Add(1*time.Hour+59*time.Minute)); ok {
		t.Fatal("02:00 前不应触发")
	}
	if _, ok := scheduleDue(s, day.Add(2*time.Hour+31*time.Minute)); ok {
		t.Fatal("超过 30 分钟窗口不应触发")
	}
	s.Mode = "weekly"
	s.Weekday = 2
	if _, ok := scheduleDue(s, day.Add(2*time.Hour+5*time.Minute)); ok {
		t.Fatal("周一不应触发周二的任务")
	}
	s.Weekday = 1
	if _, ok := scheduleDue(s, day.Add(2*time.Hour+5*time.Minute)); !ok {
		t.Fatal("周一应触发")
	}
	s.Enabled = false
	if _, ok := scheduleDue(s, day.Add(2*time.Hour+5*time.Minute)); ok {
		t.Fatal("未启用不应触发")
	}
}

func TestChecks(t *testing.T) {
	c := DefaultConfig()
	snap := &monitor.Snapshot{
		Summary: &monitor.Summary{Storage: monitor.Cap{UsedPercent: fp2(88), TotalBytes: fp2(1e12), UsedBytes: fp2(8.8e11), FreeBytes: fp2(1.2e11)}},
		Disks: []monitor.Disk{
			{Node: "n1", Device: "sda", Type: "SSD", UsedLife: "95%", Healthy: "ok"},
			{Node: "n1", Device: "sdb", Type: "SSD", UsedLife: "10%", Healthy: "ok"},
			{Node: "n2", Device: "sdc", Type: "HDD", UsedLife: "-", Healthy: "ok"},
		},
	}
	in := &Input{Plat: capacity.Platform{ID: "p", Name: "测试"}, Snap: snap, Now: time.Now()}
	if it := checkStoCap(in, c); it.Status != Bad {
		t.Fatalf("存储 88%% 应为异常, got %s", it.Status)
	}
	it := checkDiskLife(in, c)
	if it.Status != Bad || len(it.Tables) != 1 || len(it.Tables[0].Rows) != 1 {
		t.Fatalf("固态盘寿命判定错误: %+v", it)
	}
	if it := checkDiskSmart(in, c); it.Status != OK {
		t.Fatalf("SMART 应正常: %+v", it)
	}
	snap.Disks[2].Healthy = "failed"
	if it := checkDiskSmart(in, c); it.Status != Bad {
		t.Fatalf("SMART failed 应异常: %+v", it)
	}
	// 没有任何数据时不应 panic，且全部为未采集 / 有明确结论
	empty := &Input{Plat: capacity.Platform{ID: "p2", Name: "空"}, Now: time.Now()}
	pr := Evaluate(empty, c)
	if len(pr.Items) != len(Catalog) {
		t.Fatalf("应输出 %d 项, got %d", len(Catalog), len(pr.Items))
	}
	for _, it := range pr.Items {
		if it.Status == "" || it.Name == "" || it.Group == "" {
			t.Fatalf("检查项字段不完整: %+v", it)
		}
	}
	// 停用检查项
	c.Disabled = []string{"disk_life", "vm_zombie"}
	pr = Evaluate(snapInput(snap), c)
	if len(pr.Items) != len(Catalog)-2 {
		t.Fatalf("停用后应少 2 项, got %d", len(pr.Items))
	}
}

func snapInput(s *monitor.Snapshot) *Input {
	return &Input{Plat: capacity.Platform{ID: "p", Name: "测试"}, Snap: s, Now: time.Now()}
}

func TestCatalogGroups(t *testing.T) {
	gs := map[string]bool{}
	for _, g := range Groups {
		gs[g] = true
	}
	seen := map[string]bool{}
	for _, d := range Catalog {
		if !gs[d.Group] {
			t.Fatalf("检查项 %s 的分组 %q 不在 Groups 中", d.Key, d.Group)
		}
		if seen[d.Key] {
			t.Fatalf("重复 key %s", d.Key)
		}
		seen[d.Key] = true
		if checkers[d.Key] == nil {
			t.Fatalf("缺少检查函数 %s", d.Key)
		}
		for _, bad := range []string{"许可", "维保"} {
			if contains(d.Name+d.Desc, bad) {
				t.Fatalf("检查项 %s 不应含 %s", d.Key, bad)
			}
		}
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
