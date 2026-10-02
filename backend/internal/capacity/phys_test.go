package capacity

import "testing"

func TestPhysExcludesNova(t *testing.T) {
	cases := map[string]bool{
		"OpenStack Nova":         true,
		"openstack  nova":        true,
		" OpenStack Nova ":       true,
		"PowerEdge R740":         false,
		"H3C UniServer R4930 G7": false,
		"":                       false,
	}
	for model, want := range cases {
		n := map[string]any{"hostname": "h", "platform_name": model}
		if got := isNovaModel(physRow(n)); got != want {
			t.Errorf("model %q: got %v want %v", model, got, want)
		}
	}
	// platform_name 缺失时回退 meta.system.product
	n := map[string]any{"hostname": "h", "meta": map[string]any{"system": map[string]any{"product": "OpenStack Nova"}}}
	if !isNovaModel(physRow(n)) {
		t.Error("fallback product should be recognized")
	}
}

func TestPortFloatingAndNA(t *testing.T) {
	for owner, want := range map[string]bool{"compute:nova": true, "compute:az1": true, "network:floatingip": false, "network:dhcp": false, "network:router_interface": false, "": false} {
		if got := isComputePort(map[string]any{"device_owner": owner}); got != want {
			t.Fatalf("owner %q: got %v want %v", owner, got, want)
		}
	}
	r := portRow(map[string]any{"id": "p1", "status": "N/A"}, nil, nil, nil, false, false, &lookups{})
	if r["statusText"] != "未知" {
		t.Fatalf("status text: %v", r["statusText"])
	}
}
