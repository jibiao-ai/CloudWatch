package monitor

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/db"
)

// 需要真实数据库：CW_TEST_DSN 未设置时跳过。
func TestApplySyncAutoAck(t *testing.T) {
	dsn := os.Getenv("CW_TEST_DSN")
	if dsn == "" {
		t.Skip("未设置 CW_TEST_DSN")
	}
	d, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	s := NewStore(d)
	ctx := context.Background()
	const pid = "t-autoack"
	clean := func() { _, _ = d.Exec(`DELETE FROM alert_events WHERE provider_id=?`, pid) }
	clean()
	defer clean()
	start := time.Now().UTC().Add(-time.Hour).Truncate(time.Millisecond)
	mk := func(fp string) *Parsed {
		return &Parsed{Fingerprint: fp, Severity: "warning", Name: "测试告警" + fp, AlertType: "others", StartsAt: start, EndsAt: start.Add(10 * time.Minute)}
	}
	state := func(fp string) (status string, acked bool, by string) {
		if err := d.QueryRow(`SELECT status,acked,acked_by FROM alert_events WHERE provider_id=? AND fingerprint=?`, pid, fp).Scan(&status, &acked, &by); err != nil {
			t.Fatal(err)
		}
		return
	}
	// 1) 告警中：未确认
	if _, err := s.ApplySync(ctx, pid, []*Parsed{mk("a"), mk("b")}, nil); err != nil {
		t.Fatal(err)
	}
	if st, ack, _ := state("a"); st != "firing" || ack {
		t.Fatalf("告警中应未确认: %s %v", st, ack)
	}
	// 人工确认 b
	if _, err := d.Exec(`UPDATE alert_events SET acked=1,acked_by='alice',acked_at=UTC_TIMESTAMP(3) WHERE provider_id=? AND fingerprint='b'`, pid); err != nil {
		t.Fatal(err)
	}
	// 2) 下一轮拉取不再出现 a、b → 自动恢复 → a 自动确认；b 保留 alice
	time.Sleep(20 * time.Millisecond)
	if _, err := s.ApplySync(ctx, pid, []*Parsed{}, nil); err != nil {
		t.Fatal(err)
	}
	if st, ack, by := state("a"); st != "resolved" || !ack || by != AutoAckBy {
		t.Fatalf("a 恢复后应自动确认: %s %v %q", st, ack, by)
	}
	if st, ack, by := state("b"); st != "resolved" || !ack || by != "alice" {
		t.Fatalf("b 应保留人工确认人: %s %v %q", st, ack, by)
	}
	// 3) 云平台直接返回已恢复记录 → 同样自动确认
	if _, err := s.ApplySync(ctx, pid, []*Parsed{}, []*Parsed{mk("c")}); err != nil {
		t.Fatal(err)
	}
	if st, ack, by := state("c"); st != "resolved" || !ack || by != AutoAckBy {
		t.Fatalf("c 直接恢复应自动确认: %s %v %q", st, ack, by)
	}
	// 4) 复发：a 再次告警中 → 撤销系统自动确认；b（人工）保持
	if _, err := s.ApplySync(ctx, pid, []*Parsed{mk("a"), mk("b")}, nil); err != nil {
		t.Fatal(err)
	}
	if st, ack, _ := state("a"); st != "firing" || ack {
		t.Fatalf("a 复发应回到未确认: %s %v", st, ack)
	}
	if st, ack, by := state("b"); st != "firing" || !ack || by != "alice" {
		t.Fatalf("b 人工确认应保持: %s %v %q", st, ack, by)
	}
	// 5) 关联记录：同指纹其它记录
	var id int64
	_ = d.QueryRow(`SELECT id FROM alert_events WHERE provider_id=? AND fingerprint='a'`, pid).Scan(&id)
	rel, err := s.Related(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(rel) != 0 {
		t.Fatalf("同指纹同 fired_at 为同一行，应无其它关联: %d", len(rel))
	}
	// 同指纹、不同触发时间 → 一条新记录，可互相关联
	later := mk("a")
	later.StartsAt = start.Add(30 * time.Minute)
	later.EndsAt = later.StartsAt.Add(5 * time.Minute)
	if _, err := s.ApplySync(ctx, pid, nil, []*Parsed{later}); err != nil {
		t.Fatal(err)
	}
	rel, _ = s.Related(ctx, id)
	if len(rel) != 1 || rel[0].Status != "resolved" || !rel[0].Acked {
		t.Fatalf("应关联到 1 条已恢复且已自动确认的记录: %+v", rel)
	}
}
