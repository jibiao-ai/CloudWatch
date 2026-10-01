package capacity

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// 每个 *Row 函数把接口返回的原始对象（raw，完整保留）加工为：平铺的展示 / 排序字段 + 中文文案 + raw。

func setLab(r Row, key string, m map[string]lab, code string) {
	l := pick(m, code)
	r[key], r[key+"Text"], r[key+"Tone"] = code, l.Text, l.Tone
}

// ---- 计算节点：GET /v2.1/os-hypervisors/detail ----

func nodeRow(h map[string]any) Row {
	r := Row{"id": str(h, "id"), "raw": h}
	host := str(h, "hypervisor_hostname")
	svc := obj(h, "service")
	r["hostname"], r["name"] = host, shortHost(host)
	r["hostIp"] = str(h, "host_ip")
	setLab(r, "state", hvState, str(h, "state"))
	setLab(r, "enabled", hvStatus, str(h, "status"))
	r["disabledReason"] = str(svc, "disabled_reason")
	r["serviceHost"] = str(svc, "host")
	r["hypervisorType"], r["hypervisorVersion"] = str(h, "hypervisor_type"), str(h, "hypervisor_version")
	vcpus, vused := flt(h, "vcpus"), flt(h, "vcpus_used")
	cr, rr := flt(h, "cpu_allocation_ratio"), flt(h, "ram_allocation_ratio")
	memT, memU := flt(h, "memory_mb"), flt(h, "memory_mb_used")
	r["vcpus"], r["vcpusUsed"], r["cpuRatio"] = vcpus, vused, cr
	vcap := mul(vcpus, cr)
	r["vcpusCap"], r["vcpuPercent"] = vcap, pct(vused, vcap)
	r["memoryMb"], r["memoryMbUsed"], r["ramRatio"], r["freeRamMb"] = memT, memU, rr, flt(h, "free_ram_mb")
	mcap := mul(memT, rr)
	r["memoryMbCap"], r["memPercent"] = mcap, pct(memU, mcap)
	lg, lu := flt(h, "local_gb"), flt(h, "local_gb_used")
	r["localGb"], r["localGbUsed"], r["freeDiskGb"], r["diskAvailLeast"] = lg, lu, flt(h, "free_disk_gb"), flt(h, "disk_available_least")
	r["diskPercent"] = pct(lu, lg)
	r["runningVms"], r["workload"] = flt(h, "running_vms"), flt(h, "current_workload")
	r["uptime"] = str(h, "uptime")
	// cpu_info 是 JSON 字符串（文档示例）：取架构 / 型号 / 厂商 / 拓扑
	var ci map[string]any
	switch t := h["cpu_info"].(type) {
	case string:
		_ = json.Unmarshal([]byte(t), &ci)
	case map[string]any:
		ci = t
	}
	if ci != nil {
		r["cpuArch"], r["cpuModel"], r["cpuVendor"] = str(ci, "arch"), str(ci, "model"), str(ci, "vendor")
		if tp := obj(ci, "topology"); tp != nil {
			r["cpuTopology"] = fmt.Sprintf("%s 路 / %s 核 / %s 线程", str(tp, "sockets"), str(tp, "cores"), str(tp, "threads"))
		}
	}
	return r
}

// ---- 虚拟机：GET /v2.1/servers/detail ----

func vmRow(s map[string]any) Row {
	r := Row{"id": str(s, "id"), "name": str(s, "name"), "raw": s}
	setLab(r, "status", vmStatus, strings.ToLower(str(s, "status")))
	r["vmState"], r["taskState"] = str(s, "OS-EXT-STS:vm_state"), str(s, "OS-EXT-STS:task_state")
	r["powerState"] = ""
	if p := flt(s, "OS-EXT-STS:power_state"); p != nil {
		r["powerState"] = powerState[int(*p)]
	}
	host := str(s, "OS-EXT-SRV-ATTR:host")
	hyp := str(s, "OS-EXT-SRV-ATTR:hypervisor_hostname")
	r["node"] = shortHost(first(host, hyp))
	r["instanceName"], r["az"] = str(s, "OS-EXT-SRV-ATTR:instance_name"), str(s, "OS-EXT-AZ:availability_zone")
	var ips, macs []string
	if ad := obj(s, "addresses"); ad != nil {
		for _, k := range sortedKeys(ad) {
			l, _ := ad[k].([]any)
			for _, x := range l {
				if m, ok := x.(map[string]any); ok {
					ips = append(ips, str(m, "addr"))
					macs = append(macs, str(m, "OS-EXT-IPS-MAC:mac_addr"))
				}
			}
		}
	}
	r["ips"], r["macs"] = joinUniq(ips, ", "), joinUniq(macs, ", ")
	fl := obj(s, "flavor")
	r["flavor"] = first(str(fl, "original_name"), str(fl, "name"), str(fl, "id"))
	r["vcpus"], r["ramMb"], r["diskGb"] = flt(fl, "vcpus"), flt(fl, "ram"), flt(fl, "disk")
	if im := obj(s, "image"); im != nil {
		r["imageId"] = str(im, "id")
	} else {
		r["imageId"] = "" // 从云硬盘启动的云主机 image 为空字符串
	}
	r["projectId"], r["userId"], r["keyName"] = str(s, "tenant_id"), str(s, "user_id"), str(s, "key_name")
	r["createdAt"], r["updatedAt"], r["launchedAt"] = str(s, "created"), str(s, "updated"), str(s, "OS-SRV-USG:launched_at")
	r["hostStatus"], r["description"] = str(s, "host_status"), str(s, "description")
	r["locked"] = zhBool(boolean(s["locked"]), "已锁定", "未锁定")
	var sg []string
	for _, x := range list(s, "security_groups") {
		if m, ok := x.(map[string]any); ok {
			sg = append(sg, str(m, "name"))
		}
	}
	r["securityGroups"] = joinUniq(sg, ", ")
	r["volumeCount"] = float64(len(list(s, "os-extended-volumes:volumes_attached")))
	return r
}

func first(a ...string) string {
	for _, s := range a {
		if s != "" {
			return s
		}
	}
	return ""
}

// ---- 云硬盘：GET /v3/{project_id}/volumes/detail ----

func volumeRow(v map[string]any, vmName map[string]string) Row {
	r := Row{"id": str(v, "id"), "name": str(v, "name"), "raw": v}
	setLab(r, "status", volStatus, strings.ToLower(str(v, "status")))
	r["sizeGb"] = flt(v, "size")
	r["volumeType"], r["az"] = str(v, "volume_type"), str(v, "availability_zone")
	r["bootable"] = zhBool(boolean(v["bootable"]), "是", "否")
	r["encrypted"] = zhBool(boolean(v["encrypted"]), "已加密", "未加密")
	r["multiattach"] = zhBool(boolean(v["multiattach"]), "共享盘", "非共享")
	var sid, sname, dev, hosts []string
	for _, x := range list(v, "attachments") {
		if m, ok := x.(map[string]any); ok {
			id := str(m, "server_id")
			sid = append(sid, id)
			sname = append(sname, first(vmName[id], id))
			dev = append(dev, str(m, "device"))
			hosts = append(hosts, shortHost(str(m, "host_name")))
		}
	}
	r["serverIds"], r["serverNames"] = joinUniq(sid, ", "), joinUniq(sname, ", ")
	r["devices"], r["attachHosts"] = joinUniq(dev, ", "), joinUniq(hosts, ", ")
	r["attachCount"] = float64(len(sid))
	r["backend"] = str(v, "os-vol-host-attr:host")
	r["projectId"], r["userId"] = str(v, "os-vol-tenant-attr:tenant_id"), str(v, "user_id")
	r["createdAt"], r["updatedAt"] = str(v, "created_at"), str(v, "updated_at")
	r["description"], r["snapshotId"], r["sourceVolId"] = str(v, "description"), str(v, "snapshot_id"), str(v, "source_volid")
	r["replicationStatus"], r["migrationStatus"] = str(v, "replication_status"), str(v, "migration_status")
	r["nameId"], r["consistencyGroupId"] = str(v, "os-vol-mig-status-attr:name_id"), str(v, "consistencygroup_id")
	r["imageName"] = str(obj(v, "volume_image_metadata"), "image_name")
	return r
}

// ---- 虚拟网卡：GET /v2.0/ports ----

func portRow(p map[string]any, netName, subCIDR, vmName map[string]string, okNet, okSub bool) Row {
	r := Row{"id": str(p, "id"), "name": str(p, "name"), "raw": p}
	setLab(r, "status", portStatus, strings.ToLower(str(p, "status")))
	r["mac"], r["networkId"] = str(p, "mac_address"), str(p, "network_id")
	r["networkName"] = ""
	if okNet {
		r["networkName"] = netName[str(p, "network_id")]
	}
	var ips, subs []string
	for _, x := range list(p, "fixed_ips") {
		if m, ok := x.(map[string]any); ok {
			ips = append(ips, str(m, "ip_address"))
			sid := str(m, "subnet_id")
			if okSub && subCIDR[sid] != "" {
				subs = append(subs, subCIDR[sid])
			} else {
				subs = append(subs, sid)
			}
		}
	}
	r["ips"], r["subnets"] = joinUniq(ips, ", "), joinUniq(subs, ", ")
	r["deviceId"], r["deviceOwner"] = str(p, "device_id"), str(p, "device_owner")
	r["deviceOwnerText"] = deviceOwnerZh(str(p, "device_owner"))
	r["deviceName"] = vmName[str(p, "device_id")]
	r["bindingHost"] = shortHost(str(p, "binding:host_id"))
	vt, ft := str(p, "binding:vnic_type"), str(p, "binding:vif_type")
	r["vnicType"], r["vifType"] = vt, ft
	r["vnicTypeText"], r["vifTypeText"] = first(vnicType[vt], vt), first(vifType[ft], ft)
	r["adminState"] = zhBool(boolean(p["admin_state_up"]), "已启用", "已禁用")
	r["portSecurity"] = zhBool(boolean(p["port_security_enabled"]), "已开启", "未开启")
	r["sgCount"] = float64(len(list(p, "security_groups")))
	r["projectId"] = first(str(p, "project_id"), str(p, "tenant_id"))
	r["createdAt"], r["updatedAt"], r["description"] = str(p, "created_at"), str(p, "updated_at"), str(p, "description")
	return r
}

// ---- 集群存储：GET /v3/{project_id}/scheduler-stats/get_pools?detail=True ----

func poolRow(p map[string]any) Row {
	c := obj(p, "capabilities")
	if c == nil {
		c = map[string]any{}
	}
	r := Row{"id": str(p, "name"), "name": str(p, "name"), "raw": p}
	r["poolName"] = first(str(c, "pool_name"), str(p, "name"))
	r["backendName"] = str(c, "volume_backend_name")
	r["vendorName"], r["vendorText"] = str(c, "vendor_name"), vendorText(str(c, "vendor_name"))
	r["protocol"], r["protocolText"] = str(c, "storage_protocol"), protocolText(str(c, "storage_protocol"))
	setLab(r, "status", backendState, strings.ToLower(str(c, "backend_state")))
	r["driverVersion"] = str(c, "driver_version")
	tot, free := flt(c, "total_capacity_gb"), flt(c, "free_capacity_gb")
	r["totalGb"], r["freeGb"] = tot, free
	r["allocatedGb"], r["provisionedGb"] = flt(c, "allocated_capacity_gb"), flt(c, "provisioned_capacity_gb")
	used := sub(tot, free)
	r["usedGb"], r["usedPercent"] = used, pct(used, tot)
	r["thin"] = zhBool(boolean(c["thin_provisioning_support"]), "支持", "不支持")
	r["maxRatio"], r["reservedPercent"] = flt(c, "max_over_subscription_ratio"), flt(c, "reserved_percentage")
	r["multiattach"] = zhBool(boolean(c["multiattach"]), "支持", "不支持")
	r["replication"] = zhBool(boolean(c["replication_enabled"]), "已启用", "未启用")
	r["locationInfo"], r["timestamp"] = str(c, "location_info"), str(c, "timestamp")
	return r
}

// sortRows 采集后按名称自然序排好，保证无排序参数时顺序稳定。
func sortRows(rows []Row, key string) {
	sort.SliceStable(rows, func(i, j int) bool { return natLess(toStr(rows[i][key]), toStr(rows[j][key])) })
}

// natLess 自然序比较：数字段按数值比较（vm-2 < vm-10、192.168.1.9 < 192.168.1.10）。
func natLess(a, b string) bool { return natCmp(a, b) < 0 }

func natCmp(a, b string) int {
	i, j := 0, 0
	for i < len(a) && j < len(b) {
		ca, cb := a[i], b[j]
		if ca >= '0' && ca <= '9' && cb >= '0' && cb <= '9' {
			si := i
			for i < len(a) && a[i] >= '0' && a[i] <= '9' {
				i++
			}
			sj := j
			for j < len(b) && b[j] >= '0' && b[j] <= '9' {
				j++
			}
			na, nb := strings.TrimLeft(a[si:i], "0"), strings.TrimLeft(b[sj:j], "0")
			if len(na) != len(nb) {
				if len(na) < len(nb) {
					return -1
				}
				return 1
			}
			if na != nb {
				if na < nb {
					return -1
				}
				return 1
			}
			continue
		}
		if ca != cb {
			if ca < cb {
				return -1
			}
			return 1
		}
		i++
		j++
	}
	switch {
	case len(a)-i < len(b)-j:
		return -1
	case len(a)-i > len(b)-j:
		return 1
	}
	return 0
}
