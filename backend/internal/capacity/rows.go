package capacity

import (
	"sort"
	"strings"
)

// 每个 *Row 函数把接口返回的原始对象（raw，完整保留）加工为：平铺的展示 / 排序字段 + 中文文案 + raw。

func setLab(r Row, key string, m map[string]lab, code string) {
	l := pick(m, code)
	r[key], r[key+"Text"], r[key+"Tone"] = code, l.Text, l.Tone
}

// lookups 采集时的辅助映射：项目 ID→名称、规格、云硬盘、安全组（接口失败时对应映射为空，回退显示原始 ID）。
type lookups struct {
	proj    map[string]string
	flavors map[string]map[string]any
	vols    map[string]map[string]any
	sgs     map[string]map[string]any
}

func (l *lookups) project(id string) string {
	if id == "" {
		return ""
	}
	if n := l.proj[id]; n != "" {
		return n
	}
	return id
}

// ---- 物理节点：GET coaster.<根域名>/v2/nodes（文档 4.1.11） ----

// maskIPMI 物理节点的 BMC 账号密码属于敏感信息：不落库、不返回前端。
func maskIPMI(n map[string]any) map[string]any {
	out := make(map[string]any, len(n))
	for k, v := range n {
		out[k] = v
	}
	if _, ok := out["ipmi_info"]; ok {
		out["ipmi_info"] = map[string]any{"username": "******", "password": "******"}
	}
	return out
}

func physRow(n map[string]any) Row {
	n = maskIPMI(n)
	meta := obj(n, "meta")
	sys, cpu, mem := obj(meta, "system"), obj(meta, "cpu"), obj(meta, "memory")
	r := Row{"id": first(str(n, "uuid"), str(n, "id"), str(n, "hostname")), "raw": n}
	r["hostname"] = first(str(n, "hostname"), str(n, "name"), str(n, "fqdn"))
	r["name"] = r["hostname"]
	r["ip"] = str(n, "ip")
	r["model"] = first(str(n, "platform_name"), str(sys, "product"))
	r["manufacturer"] = first(str(n, "manufacturer"), str(sys, "manufacturer"))
	r["serial"] = first(str(n, "serial"), str(sys, "serial"))
	cpuModel := ""
	if sp := list(cpu, "spec"); len(sp) > 0 {
		if m, ok := sp[0].(map[string]any); ok {
			cpuModel = str(m, "model")
		}
	}
	r["cpuModel"] = cpuModel
	r["cpuVendor"], r["cpuSockets"] = str(cpu, "vendor"), flt(cpu, "real")
	r["cpuCores"] = first2num(flt(cpu, "total"), flt(n, "cpu_total"))
	memBytes := flt(mem, "total")
	r["memoryBytes"] = memBytes
	if memBytes != nil {
		g := *memBytes / (1 << 30)
		r["memoryGb"] = &g
	}
	ifs := list(meta, "interfaces")
	r["nicCount"] = float64(len(ifs))
	nics := make([]map[string]any, 0, len(ifs))
	for _, x := range ifs {
		if m, ok := x.(map[string]any); ok {
			nics = append(nics, map[string]any{"name": str(m, "name"), "mac": str(m, "mac"), "state": str(m, "state"), "speed": str(m, "current_speed"), "model": str(m, "model")})
		}
	}
	r["interfaces"] = nics
	ds := list(meta, "disks")
	disks := make([]map[string]any, 0, len(ds))
	for _, x := range ds {
		if m, ok := x.(map[string]any); ok {
			d := map[string]any{"name": str(m, "name"), "size": m["size"], "model": str(m, "model")}
			if hw := list(m, "hw_info"); len(hw) > 0 {
				if h0, ok := hw[0].(map[string]any); ok {
					d["serial"], d["mediaType"], d["interfaceType"] = str(h0, "serial_num"), str(h0, "media_type"), str(h0, "interface_type")
				}
			}
			disks = append(disks, d)
		}
	}
	r["disks"], r["diskCount"] = disks, float64(len(disks))
	r["totalDiskBytes"] = flt(meta, "total_disk_size")
	r["memorySlots"], r["memoryMaxBytes"] = flt(mem, "slots"), flt(mem, "maximum_capacity")
	r["biosVersion"], r["bmcVersion"] = str(sys, "bios_version"), str(sys, "bmc_version")
	r["arch"], r["numaNodes"] = str(meta, "arch"), flt(meta, "numa_nodes")
	r["ipmiIp"], r["mac"] = str(n, "ipmi_ip"), str(n, "mac")
	r["fqdn"], r["platformName"] = first(str(n, "fqdn"), str(sys, "fqdn")), str(n, "platform_name")
	var roles []string
	for _, x := range list(n, "role_list") {
		roles = append(roles, toStr(x))
	}
	r["roles"] = joinUniq(roles, ", ")
	r["provisionStatus"], r["clusterId"], r["timestamp"] = str(n, "provision_status"), str(n, "cluster_id"), str(n, "timestamp")
	r["errorMsg"] = str(n, "error_msg")
	setLab(r, "status", physStatus, strings.ToLower(str(n, "status")))
	if o := boolean(n["online"]); o != nil {
		r["online"] = zhBool(o, "在线", "离线")
	}
	return r
}

func first2num(a ...*float64) *float64 {
	for _, v := range a {
		if v != nil {
			return v
		}
	}
	return nil
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
	return r
}

// ---- 虚拟机：GET /v2.1/servers/detail ----

func vmRow(s map[string]any, lk *lookups) Row {
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
	// 规格：优先按规格 ID 取 Nova 规格详情的名称 / vCPU / 内存；微版本 2.47+ 的云主机详情内嵌规格（无 ID）则取 original_name。
	fd := lk.flavors[str(fl, "id")]
	if fd == nil && str(fl, "original_name") != "" {
		for _, f := range lk.flavors {
			if str(f, "name") == str(fl, "original_name") {
				fd = f
				break
			}
		}
	}
	r["flavor"] = first(str(fd, "name"), str(fl, "original_name"), str(fl, "name"), str(fl, "id"))
	r["flavorId"] = first(str(fl, "id"), str(fd, "id"))
	pick2 := func(k string) *float64 { return first2num(flt(fd, k), flt(fl, k)) }
	r["vcpus"], r["ramMb"] = pick2("vcpus"), pick2("ram") // 规格里的 disk 不是真实系统盘，不再输出
	if im := obj(s, "image"); im != nil {
		r["imageId"] = str(im, "id")
	} else {
		r["imageId"] = "" // 从云硬盘启动的云主机 image 为空字符串
	}
	r["projectId"], r["userId"], r["keyName"] = str(s, "tenant_id"), str(s, "user_id"), str(s, "key_name")
	r["projectName"] = lk.project(str(s, "tenant_id"))
	r["createdAt"], r["updatedAt"], r["launchedAt"] = str(s, "created"), str(s, "updated"), str(s, "OS-SRV-USG:launched_at")
	r["hostStatus"], r["description"] = str(s, "host_status"), str(s, "description")
	r["locked"] = zhBool(boolean(s["locked"]), "已锁定", "未锁定")
	var sg []string
	sgDetail := []map[string]any{}
	for _, x := range list(s, "security_groups") {
		m, ok := x.(map[string]any)
		if !ok {
			continue
		}
		sg = append(sg, str(m, "name"))
		sgDetail = append(sgDetail, sgInfo(str(m, "name"), str(s, "tenant_id"), lk))
	}
	r["securityGroups"], r["securityGroupList"] = joinUniq(sg, ", "), sgDetail
	// 关联云硬盘：bootable 或设备名为 /dev/vda 的为系统盘，其余为数据盘
	disks := []map[string]any{}
	sysN, dataN := 0, 0
	for _, x := range list(s, "os-extended-volumes:volumes_attached") {
		m, ok := x.(map[string]any)
		if !ok {
			continue
		}
		id := str(m, "id")
		v := lk.vols[id]
		dev, size, vtype, vname, vstatus := "", any(nil), "", "", ""
		for _, a := range list(v, "attachments") {
			if am, ok := a.(map[string]any); ok && str(am, "server_id") == str(s, "id") {
				dev = str(am, "device")
			}
		}
		if v != nil {
			size, vtype, vname, vstatus = v["size"], str(v, "volume_type"), str(v, "name"), str(v, "status")
		}
		sys := (v != nil && boolean(v["bootable"]) != nil && *boolean(v["bootable"])) || dev == "/dev/vda"
		kind := "数据盘"
		if sys {
			kind, sysN = "系统盘", sysN+1
		} else {
			dataN++
		}
		disks = append(disks, map[string]any{"id": id, "name": first(vname, id), "kind": kind, "device": dev, "size": size, "volumeType": vtype, "status": pick(volStatus, vstatus).Text})
	}
	sort.SliceStable(disks, func(i, j int) bool { return disks[i]["kind"] == "系统盘" && disks[j]["kind"] != "系统盘" })
	r["disks"] = disks
	r["volumeCount"], r["sysDiskCount"], r["dataDiskCount"] = float64(len(disks)), float64(sysN), float64(dataN)
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

func volumeRow(v map[string]any, vmName map[string]string, lk *lookups) Row {
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
	r["projectName"] = lk.project(str(v, "os-vol-tenant-attr:tenant_id"))
	r["createdAt"], r["updatedAt"] = str(v, "created_at"), str(v, "updated_at")
	r["description"], r["snapshotId"], r["sourceVolId"] = str(v, "description"), str(v, "snapshot_id"), str(v, "source_volid")
	r["replicationStatus"], r["migrationStatus"] = str(v, "replication_status"), str(v, "migration_status")
	r["nameId"], r["consistencyGroupId"] = str(v, "os-vol-mig-status-attr:name_id"), str(v, "consistencygroup_id")
	r["imageName"] = str(obj(v, "volume_image_metadata"), "image_name")
	return r
}

// ---- 虚拟网卡：GET /v2.0/ports ----

func portRow(p map[string]any, netName, subCIDR, vmName map[string]string, okNet, okSub bool, lk *lookups) Row {
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
	r["projectName"] = lk.project(toStr(r["projectId"]))
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

// sgInfo 安全组详情：名称 / 描述 / 规则（Nova 云主机详情里只有安全组名称，按「名称 + 项目」到 Neutron 安全组中找规则）。
func sgInfo(name, project string, lk *lookups) map[string]any {
	out := map[string]any{"name": name, "description": "", "rules": []map[string]any{}}
	var g map[string]any
	for _, c := range lk.sgs {
		if str(c, "name") != name {
			continue
		}
		if g == nil || first(str(c, "project_id"), str(c, "tenant_id")) == project {
			g = c
		}
	}
	if g == nil {
		return out
	}
	out["id"], out["description"] = str(g, "id"), str(g, "description")
	rules := []map[string]any{}
	for _, x := range list(g, "security_group_rules") {
		m, ok := x.(map[string]any)
		if !ok {
			continue
		}
		dir := "入方向"
		if str(m, "direction") == "egress" {
			dir = "出方向"
		}
		port := "全部"
		if lo, hi := str(m, "port_range_min"), str(m, "port_range_max"); lo != "" {
			port = lo
			if hi != "" && hi != lo {
				port = lo + "-" + hi
			}
		}
		rules = append(rules, map[string]any{
			"direction": dir, "ethertype": str(m, "ethertype"), "protocol": first(str(m, "protocol"), "全部"), "port": port,
			"remote": first(str(m, "remote_ip_prefix"), str(m, "remote_group_id"), "任意"),
		})
	}
	out["rules"], out["ruleCount"] = rules, float64(len(rules))
	return out
}
