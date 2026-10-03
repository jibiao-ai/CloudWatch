package search

import "testing"

func TestWords(t *testing.T) {
	if got := Words("  Web-01  10.1 "); len(got) != 2 || got[0] != "web-01" || got[1] != "10.1" {
		t.Fatalf("words: %v", got)
	}
	if len(Words("   ")) != 0 {
		t.Fatal("blank should have no words")
	}
}

func TestScoreAndField(t *testing.T) {
	fs := []Field{{"name", "名称"}, {"ips", "IP 地址"}, {"mac", "MAC"}}
	row := map[string]any{"name": "web-01", "ips": "10.0.0.5, 10.0.0.15", "mac": "fa:16:3e:aa:bb:cc"}
	cases := []struct {
		q     string
		score int
		label string
		value string
	}{
		{"web-01", 0, "名称", "web-01"},
		{"web", 1, "名称", "web-01"},
		{"10.0.0.15", 0, "IP 地址", "10.0.0.15"}, // 多 IP 中的第二个完全相等
		{"10.0.0.1", 1, "IP 地址", "10.0.0.15"},  // 前缀
		{"aa:bb", 2, "MAC", "fa:16:3e:aa:bb:cc"},
		{"zzz", 3, "其他字段", ""},
	}
	for _, c := range cases {
		s, l, v := Score(row, Words(c.q), fs)
		if s != c.score || l != c.label || v != c.value {
			t.Errorf("%q: got (%d,%s,%s) want (%d,%s,%s)", c.q, s, l, v, c.score, c.label, c.value)
		}
	}
}

func TestAll(t *testing.T) {
	if !All("web-01 10.0.0.5", []string{"web", "10.0"}) || All("web-01", []string{"web", "db"}) {
		t.Fatal("All mismatch")
	}
}
