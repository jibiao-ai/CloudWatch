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

func TestKeepPort(t *testing.T) {
	vms := newVMIndex([]map[string]any{{
		"id": "vm-1",
		"addresses": map[string]any{"net": []any{
			map[string]any{"OS-EXT-IPS-MAC:mac_addr": "FA:16:3E:48:25:81", "OS-EXT-IPS:type": "fixed"},
		}},
	}})
	cases := []struct {
		name string
		p    map[string]any
		want bool
	}{
		{"compute:nova", map[string]any{"device_owner": "compute:nova"}, true},
		{"compute:AZ-uuid", map[string]any{"device_owner": "compute:6a1c-uuid", "device_id": "vm-1"}, true},
		{"empty owner, device_id is VM", map[string]any{"device_owner": "", "device_id": "vm-1"}, true},
		{"trunk subport by MAC", map[string]any{"device_owner": "trunk:subport", "mac_address": "fa:16:3e:48:25:81"}, true},
		{"floating ip", map[string]any{"device_owner": "network:floatingip", "device_id": "vm-1"}, false},
		{"router interface", map[string]any{"device_owner": "network:router_interface"}, false},
		{"router gateway", map[string]any{"device_owner": "network:router_gateway"}, false},
		{"dhcp", map[string]any{"device_owner": "network:dhcp"}, false},
		{"unattached", map[string]any{"device_owner": "", "device_id": "", "mac_address": "fa:16:3e:00:00:01"}, false},
	}
	for _, c := range cases {
		if got := keepPort(c.p, vms); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
	r := portRow(map[string]any{"id": "p1", "status": "N/A"}, nil, nil, nil, false, false, &lookups{})
	if r["statusText"] != "未知" {
		t.Fatalf("status text: %v", r["statusText"])
	}
}

func TestNovaKeys(t *testing.T) {
	r := physRow(map[string]any{"hostname": "Node-7.cloud.local", "ip": "10.10.1.10", "platform_name": "OpenStack Nova"})
	got := map[string]bool{}
	for _, k := range novaKeys(r) {
		got[k] = true
	}
	for _, k := range []string{"node-7", "node-7.cloud.local", "10.10.1.10"} {
		if !got[k] {
			t.Errorf("missing key %q in %v", k, got)
		}
	}
	if ShortName("10.10.1.10") != "10.10.1.10" || ShortName("NODE-1.a.b") != "node-1" {
		t.Error("ShortName")
	}
}

func TestHasLink(t *testing.T) {
	raw := []byte(`[{"rel":"previous","href":"x"}]`)
	if !hasLink(raw, "previous") || hasLink(raw, "next") || hasLink(nil, "next") {
		t.Fatal("hasLink")
	}
}
