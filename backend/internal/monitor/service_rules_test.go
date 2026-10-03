package monitor

import (
	"strings"
	"testing"
)

func f(v float64) *float64 { return &v }

func TestOnly35ServicesShown(t *testing.T) {
	n := 0
	for name := range serviceKinds {
		if !IsShownService(name) {
			t.Fatalf("%s should be shown", name)
		}
		n++
	}
	if n != 35 {
		t.Fatalf("want 35 services, got %d", n)
	}
	if IsShownService("service_unknown_extra_state") {
		t.Fatal("extra metric must be hidden")
	}
}

func TestServiceHealthKinds(t *testing.T) {
	cases := []struct {
		name string
		v    float64
		ok   bool
	}{
		{"service_authentication_api_state", 1, true},
		{"service_authentication_api_state", 0, false},
		{"service_compute_state", 0, true},
		{"service_compute_state", 3, false},
		{"service_control_api_state", 100, true},
		{"service_control_api_state", 66.7, false},
		{"service_block_storage_backup_state", 2, true},
		{"service_block_storage_backup_state", 0, false},
	}
	for _, c := range cases {
		sv := Service{Name: c.name, State: f(c.v)}
		applyHealth(&sv)
		if sv.Healthy == nil || *sv.Healthy != c.ok {
			t.Errorf("%s=%v want healthy=%v got %v", c.name, c.v, c.ok, sv.Healthy)
		}
	}
	sv := Service{Name: "service_compute_state"}
	applyHealth(&sv)
	if sv.Healthy != nil {
		t.Error("nil state must give nil healthy")
	}
}

func TestFilterServices(t *testing.T) {
	in := []Service{{Name: "service_compute_state", State: f(0)}, {Name: "mysql_up", State: f(1)}}
	out := filterServices(in)
	if len(out) != 1 || out[0].Healthy == nil || !*out[0].Healthy {
		t.Fatalf("unexpected %+v", out)
	}
}

func TestBriefEMLAErr(t *testing.T) {
	raw := []byte(`{"results":[{"metric_name":"m","data":null,"error":"{\"error\":{\"message\":\"boom\",\"code\":500,\"title\":\"Internal Server Error\"}}"}]}`)
	ms, err := ParseEMLA(raw)
	if err != nil || len(ms) != 1 {
		t.Fatalf("parse: %v %v", err, ms)
	}
	if !strings.Contains(ms[0].Err, "HTTP 500") || !strings.Contains(ms[0].Err, "boom") {
		t.Fatalf("err=%q", ms[0].Err)
	}
}
