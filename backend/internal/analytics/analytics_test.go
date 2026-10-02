package analytics

import (
	"strings"
	"testing"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/capacity"
)

func fp(v float64) *float64 { return &v }

func upgrade() Policy {
	p := Policy{Kind: KindShortage, Name: "建议升配", Enabled: true, WindowDays: 10, Conds: []Cond{
		{Field: "cpuMax", Op: ">=", Value: 90.0}, {Field: "memMax", Op: ">=", Value: 90.0, Join: "OR"}}}
	if e := p.Validate(); len(e) > 0 {
		panic(e)
	}
	return p
}

func TestEvalOr(t *testing.T) {
	p := upgrade()
	ok, why := p.Eval(VMFacts{Status: "active", CPUMax: fp(95), MemMax: fp(10), DaysWithData: 1})
	if !ok || !strings.Contains(why, "CPU使用率最大值 95.0%") {
		t.Fatalf("want hit, got %v %q", ok, why)
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", CPUMax: fp(50), MemMax: fp(60)}); ok {
		t.Fatal("should not hit")
	}
}

func TestEvalLowNeedsFullWindow(t *testing.T) {
	p := Policy{Kind: KindExcess, Name: "建议降配", Enabled: true, WindowDays: 10, Conds: []Cond{{Field: "cpuMax", Op: "<=", Value: 1.0}}}
	_ = p.Validate()
	if ok, _ := p.Eval(VMFacts{Status: "active", CPUMax: fp(0.5), DaysWithData: 3}); ok {
		t.Fatal("window not full must not hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", CPUMax: fp(0.5), DaysWithData: 10}); !ok {
		t.Fatal("full window should hit")
	}
}

func TestEvalAndBeforeOr(t *testing.T) {
	// 关机>=30 AND 实例状态=待回收 OR 运行>=30 AND CPU最大<=1（AND 先于 OR 结合）
	p := Policy{Name: "组合", WindowDays: 10, Conds: []Cond{
		{Field: "shutdownDays", Op: ">=", Value: 30.0}, {Field: "status", Op: "=", Value: "shutoff", Join: "AND"},
		{Field: "runningDays", Op: ">=", Value: 30.0, Join: "OR"}, {Field: "cpuMax", Op: "<=", Value: 1.0, Join: "AND"}}}
	if e := p.Validate(); len(e) > 0 {
		t.Fatal(e)
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", RunningDays: 40, CPUMax: fp(0.5), DaysWithData: 10}); !ok {
		t.Fatal("running 40d with low cpu should hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "shutoff", ShutdownDays: 40}); !ok {
		t.Fatal("shutoff 40d should hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", RunningDays: 5, CPUMax: fp(0.5), DaysWithData: 10}); ok {
		t.Fatal("running 5d must not hit")
	}
}

func TestShutdownOnlyWhenShutoff(t *testing.T) {
	p := Policy{Name: "回收", WindowDays: 10, Conds: []Cond{{Field: "shutdownDays", Op: ">=", Value: 30.0}, {Field: "status", Op: "=", Value: "soft_deleted", Join: "OR"}}}
	_ = p.Validate()
	if ok, _ := p.Eval(VMFacts{Status: "active", ShutdownDays: 99}); ok {
		t.Fatal("active vm has no shutdown time")
	}
	if ok, _ := p.Eval(VMFacts{Status: "shutoff", ShutdownDays: 31}); !ok {
		t.Fatal("shutoff 31d should hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "soft_deleted"}); !ok {
		t.Fatal("soft_deleted should hit")
	}
}

func TestValidate(t *testing.T) {
	bad := []Policy{
		{Name: "", WindowDays: 10, Conds: []Cond{{Field: "cpuMax", Op: ">=", Value: 1.0}}},
		{Name: "x", WindowDays: 0, Conds: []Cond{{Field: "cpuMax", Op: ">=", Value: 1.0}}},
		{Name: "x", WindowDays: 10},
		{Name: "x", WindowDays: 10, Conds: []Cond{{Field: "nope", Op: ">=", Value: 1.0}}},
		{Name: "x", WindowDays: 10, Conds: []Cond{{Field: "cpuMax", Op: "=", Value: 1.0}}},
		{Name: "x", WindowDays: 10, Conds: []Cond{{Field: "cpuMax", Op: ">=", Value: 101.0}}},
		{Name: "x", WindowDays: 10, Conds: []Cond{{Field: "cpuMax", Op: ">=", Value: 1.0}, {Field: "memMax", Op: ">=", Value: 1.0}}},
		{Name: "x", WindowDays: 10, Conds: []Cond{{Field: "status", Op: "=", Value: "bogus"}}},
	}
	for i, p := range bad {
		if len(p.Validate()) == 0 {
			t.Errorf("case %d should be invalid", i)
		}
	}
}

func TestReasonText(t *testing.T) {
	p := upgrade()
	want := "针对过去10天的数据分析,CPU使用率最大值 大于等于 90% OR 内存使用率最大值 大于等于 90%,建议提高其计算资源分配"
	if got := p.ReasonText(); got != want {
		t.Fatalf("got %q", got)
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

func TestFactsOf(t *testing.T) {
	now := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	r := capacity.Row{"status": "shutoff"}
	f := factsOf(r, vmState{Status: "shutoff", Since: now.Add(-48 * time.Hour)}, true, nil, now)
	if f.ShutdownDays != 2 {
		t.Fatalf("%+v", f)
	}
	f = factsOf(r, vmState{Status: "active", Since: now.Add(-48 * time.Hour)}, true, nil, now)
	if f.ShutdownDays != 0 {
		t.Fatal("stale state must be ignored")
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

func mk(kind, name string, conds ...Cond) Policy {
	p := Policy{Kind: kind, Name: name, Enabled: true, WindowDays: 10, Conds: conds}
	if e := p.Validate(); len(e) > 0 {
		panic(e)
	}
	return p
}

func TestZombie(t *testing.T) {
	p := mk(KindZombie, "僵尸型虚拟机", Cond{Field: "status", Op: "=", Value: "active"}, Cond{Field: "writeAvg", Op: "<", Value: 1.0, Join: "AND"})
	if ok, why := p.Eval(VMFacts{Status: "active", WriteAvg: fp(0.35), WriteDays: 10}); !ok || !strings.Contains(why, "写I/O平均速率 0.35KiB/s") {
		t.Fatalf("zombie should hit: %v %q", ok, why)
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", WriteAvg: fp(0.35), WriteDays: 4}); ok {
		t.Fatal("window not full must not hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", WriteAvg: fp(1.0), WriteDays: 10}); ok {
		t.Fatal("1KiB/s is not < 1")
	}
	if ok, _ := p.Eval(VMFacts{Status: "shutoff", WriteAvg: fp(0), WriteDays: 10}); ok {
		t.Fatal("shutoff vm is not a zombie")
	}
	if ok, _ := p.Eval(VMFacts{Status: "active", WriteDays: 10}); ok {
		t.Fatal("no write data must not hit")
	}
}

func TestExcessAndShortage(t *testing.T) {
	ex := mk(KindExcess, "资源过剩虚拟机", Cond{Field: "cpuMax", Op: "<", Value: 10.0}, Cond{Field: "memMax", Op: "<", Value: 10.0, Join: "OR"})
	if ok, _ := ex.Eval(VMFacts{Status: "active", CPUMax: fp(9.9), MemMax: fp(50), DaysWithData: 10}); !ok {
		t.Fatal("cpu persistently <10 should hit")
	}
	if ok, _ := ex.Eval(VMFacts{Status: "active", CPUMax: fp(10), MemMax: fp(50), DaysWithData: 10}); ok {
		t.Fatal("10 is not < 10")
	}
	if ok, _ := ex.Eval(VMFacts{Status: "active", CPUMax: fp(1), MemMax: fp(1), DaysWithData: 9}); ok {
		t.Fatal("9 of 10 days must not hit")
	}
	if ok, _ := ex.Eval(VMFacts{Status: "shutoff", CPUMax: fp(1), MemMax: fp(1), DaysWithData: 10}); ok {
		t.Fatal("usage rules only apply to running vms")
	}
	sh := mk(KindShortage, "资源不足虚拟机", Cond{Field: "cpuMin", Op: ">", Value: 90.0}, Cond{Field: "memMin", Op: ">", Value: 90.0, Join: "OR"})
	if ok, why := sh.Eval(VMFacts{Status: "active", CPUMin: fp(90.5), MemMin: fp(30), DaysWithData: 10}); !ok || !strings.Contains(why, "CPU使用率最小值 90.5%") {
		t.Fatalf("cpu persistently >90 should hit: %v %q", ok, why)
	}
	if ok, _ := sh.Eval(VMFacts{Status: "active", CPUMin: fp(60), CPUMax: fp(99), MemMin: fp(30), DaysWithData: 10}); ok {
		t.Fatal("a single dip below 90 breaks 'persistently'")
	}
	if ok, _ := sh.Eval(VMFacts{Status: "active", CPUMin: fp(95), MemMin: fp(95), DaysWithData: 3}); ok {
		t.Fatal("window not full must not hit")
	}
	if want := "针对过去10天的数据分析,CPU使用率最小值 大于 90% OR 内存使用率最小值 大于 90%,建议提高其计算资源分配"; sh.ReasonText() != want {
		t.Fatalf("got %q", sh.ReasonText())
	}
}

func TestLongOff(t *testing.T) {
	p := mk(KindLongOff, "长期关机虚机", Cond{Field: "shutdownDays", Op: ">=", Value: 30.0}, Cond{Field: "status", Op: "=", Value: "soft_deleted", Join: "OR"})
	if ok, _ := p.Eval(VMFacts{Status: "shutoff", ShutdownDays: 30}); !ok {
		t.Fatal("30 days should hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "shutoff", ShutdownDays: 29.9}); ok {
		t.Fatal("29.9 days must not hit")
	}
	if ok, _ := p.Eval(VMFacts{Status: "soft_deleted"}); !ok {
		t.Fatal("pending-recycle should hit")
	}
	if !strings.HasSuffix(p.ReasonText(), "建议删除以释放计算、存储资源") {
		t.Fatal(p.ReasonText())
	}
}

func TestKinds(t *testing.T) {
	if len(Kinds) != 4 || !IsKind("zombie") || IsKind("downgrade") {
		t.Fatal("kinds")
	}
}
