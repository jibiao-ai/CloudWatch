package capacity

import "strings"

// 中文展示：状态文案 + 颜色语义（success / danger / warning / info / default）。
// 后端统一给出 *Text / *Tone，前端只负责渲染，搜索也可直接用中文关键字。

type lab struct{ Text, Tone string }

func pick(m map[string]lab, code string) lab {
	if v, ok := m[strings.ToLower(code)]; ok {
		return v
	}
	if code == "" {
		return lab{"—", "default"}
	}
	return lab{code, "default"}
}

var vmStatus = map[string]lab{
	"active": {"运行中", "success"}, "shutoff": {"已关机", "default"}, "error": {"异常", "danger"}, "paused": {"已暂停", "warning"},
	"suspended": {"已挂起", "warning"}, "shelved": {"已搁置", "info"}, "shelved_offloaded": {"已搁置", "info"}, "build": {"创建中", "info"},
	"reboot": {"重启中", "info"}, "hard_reboot": {"重启中", "info"}, "migrating": {"迁移中", "info"}, "resize": {"调整中", "info"},
	"verify_resize": {"待确认调整", "info"}, "rescue": {"救援中", "warning"}, "deleted": {"已删除", "default"}, "soft_deleted": {"回收站", "warning"},
}

var volStatus = map[string]lab{
	"available": {"可用", "success"}, "in-use": {"使用中", "info"}, "error": {"异常", "danger"}, "creating": {"创建中", "info"},
	"deleting": {"删除中", "warning"}, "error_deleting": {"删除失败", "danger"}, "error_extending": {"扩容失败", "danger"}, "error_restoring": {"恢复失败", "danger"},
	"attaching": {"挂载中", "info"}, "detaching": {"卸载中", "info"}, "extending": {"扩容中", "info"}, "downloading": {"下载中", "info"},
	"uploading": {"上传中", "info"}, "backing-up": {"备份中", "info"}, "restoring-backup": {"备份恢复中", "info"}, "maintenance": {"维护中", "warning"},
	"reserved": {"已预留", "warning"}, "retyping": {"类型变更中", "info"}, "awaiting-transfer": {"等待转移", "warning"}, "reverting": {"回滚中", "info"},
}

var portStatus = map[string]lab{
	"active": {"运行中", "success"}, "down": {"停止", "default"}, "build": {"创建中", "info"}, "error": {"异常", "danger"}, "n/a": {"未知", "default"},
}

var physStatus = map[string]lab{"ready": {"就绪", "success"}, "discover": {"发现中", "info"}, "provisioning": {"部署中", "info"}, "deploying": {"部署中", "info"},
	"error": {"异常", "danger"}, "offline": {"离线", "danger"}, "maintenance": {"维护中", "warning"}, "deleting": {"删除中", "warning"}, "stopped": {"已停止", "default"}}

var hvState = map[string]lab{"up": {"运行中", "success"}, "down": {"已宕机", "danger"}}
var hvStatus = map[string]lab{"enabled": {"已启用", "success"}, "disabled": {"已禁用", "warning"}}
var backendState = map[string]lab{"up": {"正常", "success"}, "down": {"异常", "danger"}}

var powerState = map[int]string{0: "无状态", 1: "运行", 2: "阻塞", 3: "已暂停", 4: "已关机", 5: "正在关机", 6: "已崩溃", 7: "已挂起"}

var vnicType = map[string]string{"normal": "普通（虚拟网卡）", "direct": "直通（SR-IOV）", "macvtap": "Macvtap", "baremetal": "裸金属", "direct-physical": "物理直通", "virtio-forwarder": "Virtio 转发"}
var vifType = map[string]string{"ovs": "Open vSwitch", "bridge": "Linux Bridge", "unbound": "未绑定", "binding_failed": "绑定失败", "vhostuser": "vhost-user", "distributed": "分布式", "other": "其他"}

func zhBool(b *bool, yes, no string) string {
	if b == nil {
		return "—"
	}
	if *b {
		return yes
	}
	return no
}

// deviceOwnerZh 网卡归属设备类型（文档：device_owner，如 compute:*、network:*）。
func deviceOwnerZh(o string) string {
	switch {
	case o == "":
		return "未使用"
	case strings.HasPrefix(o, "compute:"):
		return "云主机"
	case o == "network:dhcp":
		return "DHCP 服务"
	case o == "network:distributed":
		return "元数据服务"
	case strings.HasPrefix(o, "network:router_interface"):
		return "路由器接口"
	case o == "network:router_gateway":
		return "路由器网关"
	case o == "network:floatingip":
		return "浮动 IP"
	case o == "network:ha_router_replicated_interface":
		return "高可用路由器接口"
	case o == "network:vip" || o == "network:secondary":
		return "虚拟 / 辅助 IP"
	case strings.HasPrefix(o, "network:"):
		return "网络服务（" + strings.TrimPrefix(o, "network:") + "）"
	}
	return o
}

var protocolZh = map[string]string{
	"ceph": "Ceph（RBD）", "rbd": "Ceph（RBD）", "iscsi": "iSCSI", "nfs": "NFS", "fc": "光纤通道（FC）", "fibre_channel": "光纤通道（FC）",
	"nvmeof": "NVMe-oF", "nvme": "NVMe-oF", "lvm": "本地 LVM", "local": "本地存储", "scaleio": "ScaleIO", "iser": "iSER",
}

func protocolText(p string) string {
	if v, ok := protocolZh[strings.ToLower(p)]; ok {
		return v
	}
	if p == "" {
		return "—"
	}
	return p
}

var vendorZh = map[string]string{
	"open source": "开源社区", "easystack": "易捷行云（EasyStack）", "huawei": "华为", "dell emc": "戴尔 EMC", "netapp": "NetApp", "hpe": "惠普企业",
	"hitachi": "日立", "ibm": "IBM", "inspur": "浪潮", "h3c": "新华三", "sangfor": "深信服",
}

func vendorText(v string) string {
	if z, ok := vendorZh[strings.ToLower(strings.TrimSpace(v))]; ok {
		return z
	}
	if v == "" {
		return "—"
	}
	return v
}
