package topology

import (
	"testing"

	"github.com/jibiao-ai/cloudwatch/internal/monitor"
)

func TestAttach(t *testing.T) {
	physByName := map[string]string{"node-1": "phys:a", "node-2": "phys:b"}
	physByIP := map[string]string{"10.10.1.2": "phys:b"}
	hostByName := map[string]string{"node-1": "host:node-1"}
	vmByID := map[string]string{"uuid-1": "vm:uuid-1"}

	cases := []struct {
		name string
		a    monitor.Alert
		want string
	}{
		{"云主机 UUID 优先", monitor.Alert{Name: "x", Labels: map[string]string{"instance_id": "uuid-1"}}, "vm:uuid-1"},
		{"物理告警按节点名关联物理节点", monitor.Alert{Name: "磁盘使用率过高", NodeName: "node-1.ecs.local"}, "phys:a"},
		{"计算节点类告警关联计算节点", monitor.Alert{Name: "计算节点 CPU 过高", NodeName: "node-1"}, "host:node-1"},
		{"按主机 IP 关联物理节点", monitor.Alert{Name: "内存告警", HostIP: "10.10.1.2"}, "phys:b"},
		{"标签 node_name", monitor.Alert{Name: "x", Labels: map[string]string{"node_name": "node-2"}}, "phys:b"},
		{"匹配不到", monitor.Alert{Name: "x", NodeName: "none"}, ""},
	}
	for _, c := range cases {
		if got := attach(&c.a, physByName, physByIP, hostByName, vmByID); got != c.want {
			t.Errorf("%s: got %q want %q", c.name, got, c.want)
		}
	}
}

func TestByLoadAndWorse(t *testing.T) {
	hi, mid, lo := 90.0, 75.0, 10.0
	n := Node{Health: HOK}
	byLoad(&n, "CPU 使用率", &lo)
	if n.Health != HOK || len(n.Reasons) != 0 {
		t.Fatalf("low load should stay ok: %+v", n)
	}
	byLoad(&n, "CPU 使用率", &mid)
	if n.Health != HWarning {
		t.Fatalf("75%% should be warning, got %s", n.Health)
	}
	byLoad(&n, "内存使用率", &hi)
	if n.Health != HDanger || len(n.Reasons) != 2 {
		t.Fatalf("90%% should be danger with 2 reasons: %+v", n)
	}
	byLoad(&n, "x", nil) // nil 不应 panic
	if worse(HOK, HDanger) != HDanger || worse(HWarning, HOK) != HWarning {
		t.Fatal("worse ranking wrong")
	}
}

func TestNaturalSort(t *testing.T) {
	ns := []Node{{Name: "node-10"}, {Name: "node-2"}, {Name: "node-1"}}
	sortNodes(ns)
	if ns[0].Name != "node-1" || ns[1].Name != "node-2" || ns[2].Name != "node-10" {
		t.Fatalf("natural sort: %+v", ns)
	}
}

func TestPoolOf(t *testing.T) {
	pools := map[string]string{"h@hdd#hdd": "pool:1", "h@ssd#ssd": "pool:2"}
	for be, want := range map[string]string{"h@hdd#hdd": "pool:1", "other@ssd#ssd": "pool:2", "x@ssd#other": "pool:2", "": "", "x@none#none": ""} {
		if got := poolOf(pools, be); got != want {
			t.Errorf("%q: got %q want %q", be, got, want)
		}
	}
}
