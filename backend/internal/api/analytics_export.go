package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

func pctCell(p *float64) any {
	if p == nil {
		return ""
	}
	return xround(*p, 1)
}

func ratesSheet(name string, r analytics.RatesOut) xSheet {
	rows := [][]any{
		{"CPU", pctCell(r.Alloc["cpu"]), pctCell(r.Use["cpu"])},
		{"内存", pctCell(r.Alloc["mem"]), pctCell(r.Use["mem"])},
		{"集群存储", pctCell(r.Alloc["storage"]), pctCell(r.Use["storage"])},
	}
	return xSheet{Name: name, Head: []string{"资源", "分配率(%)", "使用率(%)"}, Rows: rows}
}

func distSheet(name, label, unit string, d []analytics.Dist) xSheet {
	rows := make([][]any, 0, len(d))
	for _, x := range d {
		rows = append(rows, []any{x.Label, x.Value})
	}
	return xSheet{Name: name, Head: []string{label, "数量(" + unit + ")"}, Rows: rows}
}

// distSheetTB 容量分布（后端以 GiB 计）→ TB（÷1024，保留 2 位小数）。
func distSheetTB(name, label string, d []analytics.Dist) xSheet {
	rows := make([][]any, 0, len(d))
	for _, x := range d {
		rows = append(rows, []any{x.Label, xround(float64(x.Value)/1024, 2)})
	}
	return xSheet{Name: name, Head: []string{label, "容量(TB)"}, Rows: rows}
}

// analyticsExportSheets GET /analytics/export/{kind}  kind: home | base | vm | disk | policy
// 运营中心各页签的统计数据导出为多工作表 Excel；筛选条件与页面一致（providerId / host / pool / unit）。
func (s *Server) analyticsExportSheets(w http.ResponseWriter, r *http.Request, p *auth.Principal, kind string, t0 time.Time) error {
	ps, err := s.plats(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	var sheets []xSheet
	var title string
	switch kind {
	case "home":
		title = "总览"
		ov, err := s.Analytics.Overview(ctx, ps)
		if err != nil {
			return err
		}
		t := ov.Totals
		sheets = append(sheets, xSheet{Name: "资源数量", Head: []string{"指标", "数量"}, Rows: [][]any{
			{"已对接云平台", t["platforms"]}, {"虚拟机", t["vms"]}, {"磁盘", t["disks"]}, {"计算节点", t["hosts"]}, {"集群存储", t["pools"]}}})
		sheets = append(sheets, ratesSheet("分配率与使用率", ov.Rates))
		plat := make([][]any, 0, len(ov.Platforms))
		for _, x := range ov.Platforms {
			st, at := "未采集", any("")
			if x.CollectedAt != nil {
				st, at = "正常", x.CollectedAt.In(analytics.CST).Format("2006-01-02 15:04:05")
				if !x.OK {
					st = "部分失败"
				}
			}
			plat = append(plat, []any{x.Name, x.ConsoleIP, x.EnvType, st, at, x.VMs, x.Disks, x.Hosts, x.Pools, x.Error})
		}
		sheets = append(sheets, xSheet{Name: "各云平台资源汇总", Head: []string{"所属云平台", "控制台 IP", "环境类型", "采集状态", "最近采集", "云主机", "磁盘", "计算节点", "集群存储", "采集错误"}, Rows: plat})
		sug := make([][]any, 0, len(ov.Suggestions))
		for _, x := range ov.Suggestions {
			en := "启用"
			if !x.Enabled {
				en = "已停用"
			}
			sug = append(sug, []any{x.Name, resLabel(x.ResourceType), en, x.Count})
		}
		sheets = append(sheets, xSheet{Name: "优化建议汇总", Head: []string{"策略", "资源类型", "状态", "命中数量"}, Rows: sug})
	case "base":
		title = "资源分析"
		b, err := s.Analytics.Base(ctx, ps, anFilter(r))
		if err != nil {
			return err
		}
		sheets = append(sheets, ratesSheet("分配率与使用率", b.Rates))
		be := make([][]any, 0, len(b.Backends))
		for _, x := range b.Backends {
			be = append(be, []any{x.Name, x.Platform, x.Pools, xround(x.TotalGb, 2), pctCell(x.AllocPercent), pctCell(x.UsedPercent)})
		}
		sheets = append(sheets, xSheet{Name: "存储后端", Head: []string{"后端名称", "所属云平台", "存储池数", "总容量(GiB)", "分配率(%)", "使用率(%)"}, Rows: be})
		sheets = append(sheets, distSheet("计算节点分布", "所属云平台", "台", b.Hosts), distSheet("集群存储分布", "所属云平台", "个", b.Pools))
		hv := make([][]any, 0, len(b.HostVMs))
		for _, x := range b.HostVMs {
			hv = append(hv, []any{x.Host, x.Running, x.Stopped, x.Running + x.Stopped})
		}
		sheets = append(sheets, xSheet{Name: "计算节点虚拟机分布", Head: []string{"计算节点", "运行中", "已关机/其他", "合计"}, Rows: hv})
	case "vm":
		title = "虚拟机分析"
		v, err := s.Analytics.VMAnalysis(ctx, ps, anFilter(r))
		if err != nil {
			return err
		}
		sheets = append(sheets, distSheet("所属云平台分布", "所属云平台", "台", v.Platforms), distSheet("运行状态", "状态", "台", v.Status))
	case "disk":
		title = "磁盘分析"
		unit := r.URL.Query().Get("unit")
		d, err := s.Analytics.DiskAnalysis(ctx, ps, r.URL.Query().Get("providerId"), unit)
		if err != nil {
			return err
		}
		if unit == "gb" { // 容量统一以 TB 导出（GiB ÷ 1024，保留 2 位小数）
			sheets = append(sheets, distSheetTB("所属云平台分布", "所属云平台", d.Platforms), distSheetTB("挂载状态", "挂载状态", d.Mount), distSheetTB("磁盘类型", "磁盘类型", d.Types))
		} else {
			sheets = append(sheets, distSheet("所属云平台分布", "所属云平台", "块", d.Platforms), distSheet("挂载状态", "挂载状态", "块", d.Mount), distSheet("磁盘类型", "磁盘类型", "块", d.Types))
		}
	case "policy":
		title = "优化策略"
		pl, err := s.Analytics.PolicyList(ctx, ps)
		if err != nil {
			return err
		}
		rows := make([][]any, 0, len(pl.List))
		for _, x := range pl.List {
			typ, en := "自定义", "启用"
			if x.Builtin {
				typ = "内置"
			}
			if !x.Enabled {
				en = "已停用"
			}
			upd := "系统默认"
			if x.UpdatedAt != nil {
				upd = x.UpdatedBy + " · " + x.UpdatedAt.In(analytics.CST).Format("2006-01-02 15:04:05")
			}
			rows = append(rows, []any{x.Name, typ, resLabel(x.ResourceType), en, x.WindowDays, x.Reason, x.ScopeText, x.Advice, upd})
		}
		sheets = append(sheets, xSheet{Name: "优化策略", Head: []string{"策略名称", "类型", "资源类型", "状态", "统计周期(天)", "筛选条件", "范围", "优化建议", "最近修改"}, Rows: rows})
	default:
		return httpx.Err(404, "未知的导出类型")
	}
	n := 0
	for _, sh := range sheets {
		n += len(sh.Rows)
	}
	s.rec(r, p, "analytics", "export", "导出运营中心「"+title+"」（"+strconv.Itoa(len(sheets))+" 张工作表，"+strconv.Itoa(n)+" 行）", "/analytics?tab="+kind, nil, nil, t0)
	return writeXlsx(w, "analytics-"+kind+".xlsx", sheets)
}

func resLabel(t string) string {
	for _, o := range analytics.ResTypes {
		if o.Value == t {
			return o.Label
		}
	}
	return strings.TrimSpace(t)
}
