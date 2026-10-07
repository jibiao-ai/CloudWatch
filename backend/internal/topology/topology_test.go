package topology

import (
	"testing"
	"time"
)

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

func TestHostCellsAndOrphan(t *testing.T) {
	g := &Graph{Nodes: []Node{
		{ID: "host:a", Type: THost, Name: "a", Health: HOK}, {ID: "host:b", Type: THost, Name: "b", Health: HWarning},
		{ID: "vm:1", Type: TVM, Health: HDanger}, {ID: "vm:2", Type: TVM, Health: HOff}, {ID: "vm:3", Type: TVM, Health: HOK},
	}, Edges: []Edge{{"host:a", "vm:1", "hosts"}, {"host:a", "vm:2", "hosts"}, {"host:b", "vm:3", "hosts"}}}
	cs := hostCells(g)
	if len(cs) != 2 || cs[0].Name != "a" || cs[0].Health != HDanger || cs[0].VMDanger != 1 || cs[0].VMOff != 1 || cs[0].VMTotal != 2 {
		t.Fatalf("hostCells: %+v", cs)
	}
	sz := 100.0
	now := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	o := orphanOf([]Node{
		{Type: TVolume, Orphan: true, SizeGB: &sz, CreatedAt: "2026-01-01T00:00:00Z", Health: HDanger},
		{Type: TVolume, Orphan: true, SizeGB: &sz, CreatedAt: "2026-10-01T00:00:00"},
		{Type: TVolume, Orphan: false, SizeGB: &sz},
	}, now)
	if o.Count != 2 || o.SizeGB != 200 || o.Idle30 != 1 || o.Idle90 != 1 || o.Danger != 1 {
		t.Fatalf("orphanOf: %+v", o)
	}
}
