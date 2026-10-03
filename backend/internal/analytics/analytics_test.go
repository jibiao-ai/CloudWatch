package analytics

import (
	"strings"
	"testing"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

func fp(v float64) *float64 { return &v }

// builtin 构造与迁移 0013 中一致的内置策略。
func builtin(res string, days int, conds ...Cond) Policy {
	p := Policy{Name: "t", ResourceType: res, Enabled: true, WindowDays: days, Conds: conds}
	if e := p.Validate(); len(e) > 0 {
		panic(e)
	}
	return p
}

func active() Cond { return Cond{Field: "status", Op: "=", Value: "active", Join: "AND"} }

func usageFacts(status string, days int, kv map[string]float64) Facts {
	f := newFacts(status)
	for k, v := range kv {
		v := v
		f.set(k, &v, days)
	}
	return f
}

func TestVMBuiltinPolicies(t *testing.T) {
	cases := []struct {
		name string
		p    Policy
		hit  Facts
		miss Facts
	}{
		{"vCPU过剩", builtin(ResVM, 30, Cond{Field: "cpuAvg", Op: "<", Value: 15.0}, active()),
			usageFacts("active", 30, map[string]float64{"cpuAvg": 10}), usageFacts("active", 30, map[string]float64{"cpuAvg": 15})},
		{"内存过剩", builtin(ResVM, 30, Cond{Field: "memAvg", Op: "<", Value: 20.0}, active()),
			usageFacts("active", 30, map[string]float64{"memAvg": 19.9}), usageFacts("shutoff", 30, map[string]float64{"memAvg": 5})},
		{"vCPU紧张", builtin(ResVM, 30, Cond{Field: "cpuAvg", Op: ">", Value: 80.0}, Cond{Field: "readyAvg", Op: ">", Value: 10.0, Join: "AND"}, active()),
			usageFacts("active", 1, map[string]float64{"cpuAvg": 90, "readyAvg": 12}), usageFacts("active", 30, map[string]float64{"cpuAvg": 90, "readyAvg": 10})},
		{"内存不足", builtin(ResVM, 30, Cond{Field: "memAvg", Op: ">", Value: 85.0}, Cond{Field: "swap", Op: "=", Value: "yes", Join: "AND"}, active()),
			usageFacts("active", 30, map[string]float64{"memAvg": 90, "swap": 1}), usageFacts("active", 30, map[string]float64{"memAvg": 90, "swap": 0})},
		{"IO压力", builtin(ResVM, 30, Cond{Field: "latAvg", Op: ">", Value: 20.0}, active()),
			usageFacts("active", 30, map[string]float64{"latAvg": 25}), usageFacts("active", 30, map[string]float64{"latAvg": 20})},
		{"磁盘空间高风险", builtin(ResVM, 30, Cond{Field: "fsMax", Op: ">", Value: 90.0}, active()),
			usageFacts("active", 30, map[string]float64{"fsMax": 95}), usageFacts("active", 30, map[string]float64{"fsMax": 90})},
		{"僵尸", builtin(ResVM, 30, Cond{Field: "writeAvg", Op: "<", Value: 1.0}, active()),
			usageFacts("active", 30, map[string]float64{"writeAvg": 0.2}), usageFacts("active", 30, map[string]float64{"writeAvg": 1})},
		{"长期关机", builtin(ResVM, 30, Cond{Field: "status", Op: "=", Value: "shutoff"}, Cond{Field: "shutdownDays", Op: ">", Value: 30.0, Join: "AND"}),
			usageFacts("shutoff", 0, map[string]float64{"shutdownDays": 31}), usageFacts("shutoff", 0, map[string]float64{"shutdownDays": 30})},
	}
	for _, c := range cases {
		if ok, why := c.p.Eval(c.hit); !ok || why == "" {
			t.Errorf("%s: want hit, got %v %q", c.name, ok, why)
		}
		if ok, _ := c.p.Eval(c.miss); ok {
			t.Errorf("%s: want miss", c.name)
		}
	}
}

// 「越低越命中」的条件必须积累满整个统计周期，避免刚开始采样就误判为低负载。
func TestLowNeedsFullWindow(t *testing.T) {
	p := builtin(ResVM, 30, Cond{Field: "cpuAvg", Op: "<", Value: 15.0}, active())
	if ok, _ := p.Eval(usageFacts("active", 5, map[string]float64{"cpuAvg": 1})); ok {
		t.Fatal("window not full must not hit")
	}
	if ok, _ := p.Eval(usageFacts("active", 30, map[string]float64{"cpuAvg": 1})); !ok {
		t.Fatal("full window should hit")
	}
	// 缺少指标（平台未提供）→ 不命中
	if ok, _ := p.Eval(newFacts("active")); ok {
		t.Fatal("missing metric must not hit")
	}
}

func TestUsageOnlyForActive(t *testing.T) {
	p := builtin(ResVM, 30, Cond{Field: "memAvg", Op: ">", Value: 85.0})
	if ok, _ := p.Eval(usageFacts("shutoff", 30, map[string]float64{"memAvg": 99})); ok {
		t.Fatal("usage conds only apply to running VMs")
	}
}

func TestAndBeforeOr(t *testing.T) {
	p := builtin(ResVM, 10,
		Cond{Field: "shutdownDays", Op: ">=", Value: 30.0}, Cond{Field: "status", Op: "=", Value: "shutoff", Join: "AND"},
		Cond{Field: "runningDays", Op: ">=", Value: 30.0, Join: "OR"}, Cond{Field: "cpuMax", Op: "<=", Value: 1.0, Join: "AND"})
	if ok, _ := p.Eval(usageFacts("active", 10, map[string]float64{"runningDays": 40, "cpuMax": 0.5})); !ok {
		t.Fatal("running 40d with low cpu should hit")
	}
	if ok, _ := p.Eval(usageFacts("shutoff", 0, map[string]float64{"shutdownDays": 40})); !ok {
		t.Fatal("shutoff 40d should hit")
	}
	if ok, _ := p.Eval(usageFacts("active", 10, map[string]float64{"runningDays": 5, "cpuMax": 0.5})); ok {
		t.Fatal("running 5d must not hit")
	}
}

func TestHostPoolDiskPolicies(t *testing.T) {
	host := builtin(ResHost, 30, Cond{Field: "cpuAvg", Op: ">", Value: 85.0})
	if ok, _ := host.Eval(usageFacts("", 30, map[string]float64{"cpuAvg": 86})); !ok {
		t.Fatal("host cpu hit")
	}
	if ok, _ := host.Eval(usageFacts("", 30, map[string]float64{"cpuAvg": 85})); ok {
		t.Fatal("host cpu boundary")
	}
	pool := builtin(ResPool, 30, Cond{Field: "usedPercent", Op: ">", Value: 85.0})
	if ok, why := pool.Eval(usageFacts("", 0, map[string]float64{"usedPercent": 90.26})); !ok || !strings.Contains(why, "90.3%") {
		t.Fatalf("pool hit %v %q", ok, why)
	}
	disk := builtin(ResDisk, 30, Cond{Field: "attachCount", Op: "=", Value: 0.0})
	if ok, _ := disk.Eval(usageFacts("", 0, map[string]float64{"attachCount": 0})); !ok {
		t.Fatal("orphan disk hit")
	}
	if ok, _ := disk.Eval(usageFacts("", 0, map[string]float64{"attachCount": 1})); ok {
		t.Fatal("attached disk must not hit")
	}
}

func TestValidate(t *testing.T) {
	ok := Policy{Name: "新策略", ResourceType: ResVM, WindowDays: 30, Conds: []Cond{{Field: "cpuAvg", Op: "<", Value: 15.0}}}
	if e := ok.Validate(); len(e) > 0 {
		t.Fatal(e)
	}
	if ok.Scope.Mode != "all" {
		t.Fatal("scope defaults to all")
	}
	bad := []Policy{
		{Name: "", ResourceType: ResVM, WindowDays: 30, Conds: ok.Conds},
		{Name: "x", ResourceType: "nope", WindowDays: 30, Conds: ok.Conds},
		{Name: "x", ResourceType: ResVM, WindowDays: 0, Conds: ok.Conds},
		{Name: "x", ResourceType: ResVM, WindowDays: 30},
		{Name: "x", ResourceType: ResHost, WindowDays: 30, Conds: []Cond{{Field: "writeAvg", Op: "<", Value: 1.0}}}, // 指标不适用于该资源类型
		{Name: "x", ResourceType: ResVM, WindowDays: 30, Conds: []Cond{{Field: "cpuAvg", Op: "=", Value: 1.0}}},     // 运算符不合法
		{Name: "x", ResourceType: ResVM, WindowDays: 30, Conds: []Cond{{Field: "cpuAvg", Op: "<", Value: 101.0}}},
		{Name: "x", ResourceType: ResVM, WindowDays: 30, Conds: []Cond{{Field: "status", Op: "=", Value: "bogus"}}},
		{Name: "x", ResourceType: ResVM, WindowDays: 30, Conds: ok.Conds, Scope: Scope{Mode: "part"}},
	}
	for i, p := range bad {
		if len(p.Validate()) == 0 {
			t.Errorf("case %d should be invalid", i)
		}
	}
}

func TestScopeMatch(t *testing.T) {
	all := Scope{Mode: "all"}
	if !all.Match("p1", "c1") {
		t.Fatal("all")
	}
	part := Scope{Mode: "part", Items: []string{"p1/c1", "p2"}}
	for _, c := range []struct {
		pid, cl string
		w       bool
	}{{"p1", "c1", true}, {"p1", "c2", false}, {"p2", "x", true}, {"p2", "", true}, {"p3", "c1", false}} {
		if part.Match(c.pid, c.cl) != c.w {
			t.Errorf("%s/%s want %v", c.pid, c.cl, c.w)
		}
	}
}

func TestReasonText(t *testing.T) {
	p := builtin(ResVM, 30, Cond{Field: "cpuAvg", Op: ">", Value: 80.0}, Cond{Field: "readyAvg", Op: ">", Value: 10.0, Join: "AND"}, active())
	p.Advice = "建议提高其 vCPU 配置"
	want := "针对过去30天的数据分析,vCPU平均使用率 大于 80% 且 CPU就绪时间占比 大于 10% 且 电源状态 等于 运行中,建议提高其 vCPU 配置"
	if got := p.ReasonText(); got != want {
		t.Fatalf("got %q\nwant %q", got, want)
	}
}

func TestVMFactsOf(t *testing.T) {
	now := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	r := capacity.Row{"status": "shutoff"}
	f := vmFacts(r, vmState{Status: "shutoff", Since: now.Add(-48 * time.Hour)}, true, nil, now)
	if f.Vals["shutdownDays"] != 2 {
		t.Fatalf("%+v", f)
	}
	f = vmFacts(r, vmState{Status: "active", Since: now.Add(-48 * time.Hour)}, true, nil, now)
	if _, ok := f.Vals["shutdownDays"]; ok {
		t.Fatal("stale state must be ignored")
	}
	sw := 3.0
	f = vmFacts(capacity.Row{"status": "ACTIVE"}, vmState{}, false, &Usage{SwapMax: &sw, SwapDays: 4}, now)
	if f.Vals["swap"] != 1 || f.Days["swap"] != 4 {
		t.Fatalf("swap should map to 1: %+v", f)
	}
}

func TestBackendRates(t *testing.T) {
	x := &plat{Platform: capacity.Platform{ID: "p1", Name: "平台A"}, pools: []capacity.Row{
		{"name": "h1@ceph#pool1", "backendName": "ceph-ssd", "poolName": "pool1", "totalGb": 1000.0, "usedGb": 250.0, "allocatedGb": 500.0},
		{"name": "h2@ceph#pool2", "backendName": "ceph-ssd", "poolName": "pool2", "totalGb": 1000.0, "usedGb": 350.0, "allocatedGb": 300.0},
		{"name": "h1@nfs#p", "backendName": "nfs-1", "poolName": "p", "totalGb": 500.0, "usedGb": 50.0, "allocatedGb": 100.0},
	}}
	got := backendRates([]*plat{x}, Filter{})
	if len(got) != 2 {
		t.Fatalf("each backend once: %+v", got)
	}
	var ceph BackendRate
	for _, b := range got {
		if b.Name == "ceph-ssd" {
			ceph = b
		}
	}
	if ceph.Pools != 2 || ceph.TotalGb != 2000 || ceph.UsedPercent == nil || *ceph.UsedPercent != 30 || *ceph.AllocPercent != 40 {
		t.Fatalf("%+v", ceph)
	}
}

func TestBandOf(t *testing.T) {
	for v, w := range map[float64]int{0: 0, 19.9: 0, 20: 1, 59.9: 2, 60: 3, 80: 4, 100: 4, 130: 4, -5: 0} {
		if bandOf(v) != w {
			t.Errorf("bandOf(%v)=%d want %d", v, bandOf(v), w)
		}
	}
}

func TestPaginateSort(t *testing.T) {
	rows := []map[string]any{{"n": "vm-10", "v": 3.0}, {"n": "vm-2", "v": nil}, {"n": "vm-1", "v": 9.0}}
	pg := Paginate(rows, ListQuery{SortKey: "n", SortOrder: "asc", Page: 1, PageSize: 2})
	if pg.Total != 3 || len(pg.List) != 2 || pg.List[0]["n"] != "vm-1" || pg.List[1]["n"] != "vm-2" {
		t.Fatalf("%+v", pg.List)
	}
	rows = []map[string]any{{"v": nil}, {"v": 3.0}, {"v": 9.0}}
	pg = Paginate(rows, ListQuery{SortKey: "v", SortOrder: "desc", Page: 1, PageSize: 10})
	if pg.List[0]["v"] != 9.0 || pg.List[2]["v"] != nil {
		t.Fatalf("nil must be last: %+v", pg.List)
	}
	pg = Paginate(rows, ListQuery{Page: 99, PageSize: 10})
	if pg.Page != 1 {
		t.Fatal("out-of-range page resets")
	}
}

func TestInitialSince(t *testing.T) {
	now := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	r := capacity.Row{"launchedAt": "2026-09-01T00:00:00.000000", "updatedAt": "2026-09-20T12:00:00Z", "createdAt": "2026-08-01T00:00:00Z"}
	if got := initialSince(r, "active", now); got.Day() != 1 || got.Month() != 9 {
		t.Fatalf("active uses launchedAt, got %v", got)
	}
	if got := initialSince(r, "shutoff", now); got.Day() != 20 {
		t.Fatalf("shutoff uses updatedAt, got %v", got)
	}
	if got := initialSince(capacity.Row{}, "active", now); !got.Equal(now) {
		t.Fatal("fallback now")
	}
}

func TestParseRange(t *testing.T) {
	from, to := ParseRange("2020-01-01", "2026-09-30")
	if to.Sub(from) > 367*24*time.Hour {
		t.Fatal("range capped")
	}
	from, to = ParseRange("", "")
	if !from.Before(to) {
		t.Fatal("default range")
	}
}

func TestStateGroup(t *testing.T) {
	for c, g := range map[string]string{"active": "running", "SHUTOFF": "stopped", "error": "error", "build": "other"} {
		if stateGroup(c) != g {
			t.Errorf("%s", c)
		}
	}
}
