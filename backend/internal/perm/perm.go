// Package perm 权限码字典与菜单树（与前端 data/permissions.js、mock/menus.js 保持一致）。
// 用户的实际权限由角色决定并存库；菜单可见性以 /auth/me 返回为准。
package perm

import "strings"

type Module struct {
	Code    string
	Menu    string
	Buttons []string
}

var Modules = []Module{
	{"dashboard", "dashboard:view", nil},
	{"provider", "provider:view", []string{"provider:create", "provider:update", "provider:delete", "provider:verify", "provider:sync", "provider:write_switch", "provider:export"}},
	{"user", "user:view", []string{"user:create", "user:update", "user:toggle", "user:unlock", "user:delete", "user:reset_password", "user:export"}},
	{"role", "role:view", []string{"role:create", "role:update", "role:delete"}},
	{"audit", "audit:view", []string{"audit:export", "audit:clean"}},
	{"domain", "domain:view", []string{"domain:update", "domain:verify"}},
	{"settings", "settings:view", []string{"settings:update"}},
	// 「统一资源管理 / 统一资源视图」暂时隐藏（尚无真实功能）；恢复时取消注释此行及下方 tree 中的两项。
	// {"resource", "resource:view", nil},
	{"inspection", "inspection:view", []string{"inspection:run", "inspection:export", "inspection:config", "inspection:delete"}},
	{"monitor", "monitor:view", []string{"monitor:collect", "monitor:export"}},
	{"capacity", "capacity:view", []string{"capacity:collect", "capacity:export"}},
	{"alert", "alert:view", []string{"alert:ack", "alert:sync", "alert:export"}},
	{"topology", "topology:view", nil},
	{"analytics", "analytics:view", []string{"analytics:ignore", "analytics:policy_update", "analytics:export"}},
}

func All() []string {
	var out []string
	for _, m := range Modules {
		out = append(out, m.Menu)
		out = append(out, m.Buttons...)
	}
	return out
}

func Filter(keep func(code string) bool) []string {
	var out []string
	for _, c := range All() {
		if keep(c) {
			out = append(out, c)
		}
	}
	return out
}

func HasPrefixAny(code string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(code, p) {
			return true
		}
	}
	return false
}

type MenuItem struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	Path       string `json:"path,omitempty"`
	Permission string `json:"permission,omitempty"`
	Icon       string `json:"icon"`
	Planned    bool   `json:"planned,omitempty"`
}
type MenuGroup struct {
	Code     string     `json:"code"`
	Name     string     `json:"name"`
	Icon     string     `json:"icon"`
	Children []MenuItem `json:"children"`
}

func planned(code, name, group, perm, icon string) MenuItem {
	return MenuItem{Code: code, Name: name, Path: "/planned/" + group, Permission: perm, Icon: icon, Planned: true}
}

var tree = []MenuGroup{
	{"overview", "平台概览", "LayoutDashboard", []MenuItem{{Code: "dashboard", Name: "平台概览", Path: "/dashboard", Permission: "dashboard:view", Icon: "Gauge"}}},
	// 暂时隐藏：
	// {"resource-mgmt", "统一资源管理", "Boxes", []MenuItem{planned("resource-mgmt-home", "资源纳管", "resource-mgmt", "resource:view", "Boxes")}},
	// {"resource-view", "统一资源视图", "LayoutList", []MenuItem{planned("resource-view-home", "资源总览", "resource-view", "resource:view", "LayoutList")}},
	{"monitor", "监控中心", "Activity", []MenuItem{{Code: "monitor-home", Name: "监控总览", Path: "/monitor", Permission: "monitor:view", Icon: "Activity"}}},
	{"capacity", "配置中心", "Database", []MenuItem{{Code: "capacity-home", Name: "配置总览", Path: "/capacity", Permission: "capacity:view", Icon: "Database"}}},
	{"alert", "告警中心", "BellRing", []MenuItem{{Code: "alert-home", Name: "告警列表", Path: "/alerts", Permission: "alert:view", Icon: "BellRing"}}},
	{"topology", "资源拓扑", "Network", []MenuItem{{Code: "topology-home", Name: "全链路拓扑", Path: "/topology", Permission: "topology:view", Icon: "Network"}}},
	{"analytics", "运营中心", "ChartPie", []MenuItem{{Code: "analytics-home", Name: "运营总览", Path: "/analytics", Permission: "analytics:view", Icon: "ChartPie"}}},
	{"inspection", "自动巡检", "ClipboardCheck", []MenuItem{{Code: "inspection-home", Name: "巡检报告", Path: "/inspection", Permission: "inspection:view", Icon: "ClipboardCheck"}}},
	{"provider", "平台管理", "Server", []MenuItem{{Code: "provider-home", Name: "平台管理", Path: "/system/providers", Permission: "provider:view", Icon: "Server"}}},
	{"user", "用户管理", "Users", []MenuItem{{Code: "user-home", Name: "用户管理", Path: "/system/users", Permission: "user:view", Icon: "Users"}}},
	{"role", "角色管理", "ShieldCheck", []MenuItem{{Code: "role-home", Name: "角色管理", Path: "/system/roles", Permission: "role:view", Icon: "ShieldCheck"}}},
	{"audit", "审计日志", "ScrollText", []MenuItem{{Code: "audit-home", Name: "审计日志", Path: "/system/audit", Permission: "audit:view", Icon: "ScrollText"}}},
	{"domain", "域名配置", "Globe", []MenuItem{{Code: "domain-home", Name: "域名配置", Path: "/system/domain", Permission: "domain:view", Icon: "Globe"}}},
	{"settings", "系统配置", "SlidersHorizontal", []MenuItem{{Code: "settings-home", Name: "系统配置", Path: "/system/settings", Permission: "settings:view", Icon: "SlidersHorizontal"}}},
}

func BuildMenus(perms []string) []MenuGroup {
	set := map[string]bool{}
	for _, p := range perms {
		set[p] = true
	}
	can := func(c string) bool { return set["*"] || set[c] }
	out := []MenuGroup{}
	for _, g := range tree {
		ng := MenuGroup{Code: g.Code, Name: g.Name, Icon: g.Icon, Children: []MenuItem{}}
		for _, it := range g.Children {
			if can(it.Permission) {
				ng.Children = append(ng.Children, it)
			}
		}
		if len(ng.Children) > 0 {
			out = append(out, ng)
		}
	}
	return out
}
