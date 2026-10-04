package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/capacity"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

// xcol 导出列：标题 + 取值函数。
type xcol struct {
	Title string
	Get   func(capacity.Row) any
}

func col(title, key string) xcol { return xcol{title, func(r capacity.Row) any { return xv(r[key]) }} }
func colT(title, key string) xcol {
	return xcol{title, func(r capacity.Row) any { return xtime(r[key]) }}
}
func colR(title, key string, d int) xcol {
	return xcol{title, func(r capacity.Row) any { return xround(r[key], d) }}
}

// colDiv 数值除以 div 后保留 2 位小数（如字节 → GiB）。
func colDiv(title, key string, div float64) xcol {
	return xcol{title, func(r capacity.Row) any {
		if f, ok := xv(r[key]).(float64); ok {
			return xround(f/div, 2)
		}
		return ""
	}}
}

func colFirst(title string, keys ...string) xcol {
	return xcol{title, func(r capacity.Row) any {
		for _, k := range keys {
			if v := xv(r[k]); v != "" {
				return v
			}
		}
		return ""
	}}
}

var capExport = map[string][]xcol{
	"phys": {col("主机名", "hostname"), col("所属云平台", "providerName"), col("控制台 IP", "consoleIp"), col("序列号", "serial"), col("型号", "model"), col("CPU 型号", "cpuModel"),
		col("CPU 核数", "cpuCores"), colDiv("内存大小(GiB)", "memoryBytes", 1<<30), col("网卡数量", "nicCount"), col("状态", "statusText"), col("管理 IP", "ip"), col("带外 IP", "ipmiIp")},
	"nodes": {col("节点名称", "name"), col("管理 IP", "hostIp"), col("所属云平台", "providerName"), col("控制台 IP", "consoleIp"), col("CPU 核数", "vcpus"),
		col("vCPU 已用", "vcpusUsed"), col("vCPU 容量", "vcpusCap"), colR("vCPU 使用率(%)", "vcpuPercent", 1), col("内存已用(MiB)", "memoryMbUsed"), col("内存容量(MiB)", "memoryMbCap"),
		colR("内存使用率(%)", "memPercent", 1), col("运行虚拟机数", "runningVms"), col("运行状态", "stateText"), col("服务状态", "enabledText"), col("虚拟化类型", "hypervisorType")},
	"vms": {col("虚拟机名称", "name"), col("虚机 IP", "ips"), col("规格名称", "flavor"), col("vCPU", "vcpus"), col("内存(MiB)", "ramMb"), col("UUID", "id"), col("状态", "statusText"),
		col("项目名称", "projectName"), col("所属云平台", "providerName"), col("控制台 IP", "consoleIp"), col("计算节点", "node"), colT("创建时间", "createdAt")},
	"volumes": {col("云硬盘名称", "name"), col("UUID", "id"), col("所属云平台", "providerName"), col("控制台 IP", "consoleIp"), col("项目名称", "projectName"), col("状态", "statusText"),
		col("容量(GiB)", "sizeGb"), col("云硬盘类型", "volumeType"), col("挂载虚拟机", "serverNames"), col("挂载点", "devices"), col("启动盘", "bootable"), colT("创建时间", "createdAt")},
	"ports": {col("网卡名称", "name"), col("IP 地址", "ips"), col("MAC 地址", "mac"), col("UUID", "id"), col("状态", "statusText"), colFirst("所属网络", "networkName", "networkId"),
		col("所属云平台", "providerName"), col("控制台 IP", "consoleIp"), col("项目名称", "projectName"), col("挂载虚拟机", "deviceName"), colT("创建时间", "createdAt")},
	"pools": {colFirst("后端名称", "backendName", "poolName"), col("所属云平台", "providerName"), col("控制台 IP", "consoleIp"), col("总容量(GiB)", "totalGb"), col("剩余容量(GiB)", "freeGb"),
		col("已分配容量(GiB)", "allocatedGb"), col("精简置备总容量(GiB)", "provisionedGb"), col("已用容量(GiB)", "usedGb"),
		{"存储使用率(%)", func(r capacity.Row) any {
			u, ok1 := xv(r["usedGb"]).(float64)
			t, ok2 := xv(r["totalGb"]).(float64)
			if !ok1 || !ok2 || t <= 0 {
				return ""
			}
			return xround(u/t*100, 1)
		}}, col("供应商", "vendorText"), col("后端状态", "statusText")},
}

var capTitle = map[string]string{"phys": "物理节点", "nodes": "计算节点", "vms": "虚拟机", "volumes": "云硬盘", "ports": "虚拟网卡", "pools": "集群存储"}

// capacityExport GET /capacity/{kind}/export?keyword=&providerId=&status=&sortKey=&sortOrder=  导出当前筛选结果（不分页）。
func (s *Server) capacityExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	kind := r.PathValue("kind")
	cols, ok := capExport[kind]
	if _, known := capacity.Kinds[kind]; !known || !ok {
		return httpx.Err(404, "不支持的导出类型："+kind)
	}
	plats, err := s.Capacity.Platforms(r.Context())
	if err != nil {
		return err
	}
	g := r.URL.Query().Get
	pg, err := s.Capacity.Store.Search(r.Context(), plats, capacity.Query{Kind: kind, Keyword: g("keyword"), ProviderID: g("providerId"), Status: g("status"), SortKey: g("sortKey"), SortOrder: g("sortOrder"), All: true})
	if err != nil {
		return err
	}
	list := pg.List
	if len(list) > maxExportRows {
		list = list[:maxExportRows]
	}
	head := make([]string, len(cols))
	for i, c := range cols {
		head[i] = c.Title
	}
	rows := make([][]any, 0, len(list))
	for _, row := range list {
		line := make([]any, len(cols))
		for j, c := range cols {
			line[j] = c.Get(row)
		}
		rows = append(rows, line)
	}
	title := capTitle[kind]
	s.rec(r, p, "capacity", "export", "导出配置中心「"+title+"」（"+strconv.Itoa(len(rows))+" 条）", "/capacity?tab="+kind, nil, nil, t0)
	return writeXlsx(w, "capacity-"+kind+".xlsx", []xSheet{{Name: title, Head: head, Rows: rows}})
}
