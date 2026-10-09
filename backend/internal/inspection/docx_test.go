package inspection

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

func sampleReport() *Report {
	now := time.Date(2026, 10, 3, 9, 30, 0, 0, time.UTC)
	mk := func(name string) PlatformReport {
		return PlatformReport{
			ProviderID: "p1", Name: name, EnvType: "SMTX OS", ConsoleIP: "10.0.0.1", CollectedAt: &now,
			Overall: Warn, Score: 86, Counts: Counts{OK: 15, Warn: 3, Bad: 1, NA: 2},
			Env:     []KV{{"平台名称", name}, {"管理地址", "10.0.0.1"}},
			Summary: "共巡检 21 项：正常 15，预警 3，异常 1。",
			Advices: []string{"尽快处理磁盘寿命告警", "清理长期关机云主机"},
			Items: []Item{
				{Key: "svc_state", Group: "平台服务", Name: "服务状态", Status: OK, Value: "全部正常", Detail: "所有服务运行正常", Standard: "服务状态为 running"},
				{Key: "disk_life", Group: "磁盘", Name: "固态盘寿命", Status: Bad, Value: "1 块 ≥ 90%", Detail: "存在寿命即将耗尽的固态盘", Standard: "已用寿命 ≥ 90% 异常", Advice: "更换磁盘",
					Tables: []Table{{Title: "固态盘寿命明细", Cols: []string{"节点", "磁盘", "已用寿命", "状态"}, Rows: [][]string{{"node-1", "sda", "95%", "异常"}, {"node-2", "sdb", "82%", "预警"}}, More: 3}}},
				{Key: "vm_zombie", Group: "云主机", Name: "僵尸云主机", Status: NA, Value: "-", Detail: "未采集", Standard: "-"},
			},
		}
	}
	r := &Report{ID: 1, Title: "南京环境巡检", Trigger: "manual", Operator: "admin", OperatorNm: "管理员", StartedAt: now, FinishedAt: now.Add(time.Minute),
		Overall: Warn, Score: 86, Counts: Counts{OK: 15, Warn: 3, Bad: 1, NA: 2}, Summary: "整体良好", Platforms: []PlatformReport{mk("南京环境"), mk("北京环境")}, Config: DefaultConfig()}
	return r
}

func TestBuildDocx(t *testing.T) {
	data, err := BuildDocx(sampleReport(), Brand{Name: "CloudWatch", Subtitle: "云平台观测", Copyright: "© 2026"})
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	var all strings.Builder
	for _, f := range zr.File {
		rc, _ := f.Open()
		b, _ := io.ReadAll(rc)
		rc.Close()
		if strings.HasSuffix(f.Name, ".xml") || strings.HasSuffix(f.Name, ".rels") {
			d := xml.NewDecoder(bytes.NewReader(b))
			for {
				if _, e := d.Token(); e != nil {
					if e != io.EOF {
						t.Fatalf("%s 不是合法 XML: %v", f.Name, e)
					}
					break
				}
			}
			all.Write(b)
		}
	}
	s := all.String()
	for _, bad := range []string{"许可", "维保", "综合评估"} {
		if strings.Contains(s, bad) {
			t.Fatalf("报告不应包含 %q", bad)
		}
	}
	if !strings.Contains(s, "健康评分") {
		t.Fatal("缺少健康评分")
	}
	if !strings.Contains(s, "云平台自动巡检报告") {
		t.Fatal("缺少封面标题")
	}
	if p := os.Getenv("DOCX_OUT"); p != "" {
		_ = os.WriteFile(p, data, 0o644)
	}
}

func TestCleanSummary(t *testing.T) {
	cases := map[string]string{
		"共 21 个检查项：正常 15。综合评估：平台整体运行【预警】，健康评分 86。": "共 21 个检查项：正常 15。健康评分 86。",
		"未采集 1。综合评估：【异常】，平均健康评分 63。":               "未采集 1。平均健康评分 63。",
		"无法给出综合评估。请先采集。":                           "无法给出健康评分。请先采集。",
	}
	for in, want := range cases {
		if got := CleanSummary(in); got != want {
			t.Fatalf("CleanSummary(%q)=%q 期望 %q", in, got, want)
		}
	}
}
