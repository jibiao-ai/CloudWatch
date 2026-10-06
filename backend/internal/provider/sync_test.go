package provider

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSameOrigin(t *testing.T) {
	got := sameOrigin("http://cinder.h5deves.cheryfs.cn:80/v3/p1/volumes?all_tenants=1&limit=1000",
		"http://cinder-api.openstack.svc.cluster.local:8776/v3/p1/volumes?all_tenants=1&limit=1000&marker=abc")
	want := "http://cinder.h5deves.cheryfs.cn:80/v3/p1/volumes?all_tenants=1&limit=1000&marker=abc"
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

// 服务端返回集群内部域名的 next 链接时，仍应沿用首次请求的主机完成翻页。
func TestCountAllRewritesNextHost(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("marker") == "" {
			fmt.Fprint(w, `{"volumes":[{"id":"1"},{"id":"2"}],"volumes_links":[{"rel":"next","href":"http://cinder-api.openstack.svc.cluster.local:8776/v3/p/volumes?marker=2"}]}`)
			return
		}
		fmt.Fprint(w, `{"volumes":[{"id":"3"}]}`)
	}))
	defer srv.Close()
	c := &Client{}
	n, err := c.countAll(context.Background(), srv.Client(), "t", srv.URL+"/v3/p/volumes?limit=2", "volumes")
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}
