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
	{"resource", "resource:view", nil},
	{"inspection", "inspection:view", nil},
	{"monitor", "monitor:view", []string{"monitor:collect"}},
	{"capacity", "capacity:view", []string{"capacity:collect"}},
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
	{"overview", "概览", "LayoutDashboard", []MenuItem{{Code: "dashboard", Name: "运维概览", Path: "/dashboard", Permission: "dashboard:view", Icon: "Gauge"}}},
	{"resource-mgmt", "统一资源管理", "Boxes", []MenuItem{planned("resource-mgmt-home", "资源纳管", "resource-mgmt", "resource:view", "Boxes")}},
	{"resource-view", "统一资源视图", "LayoutList", []MenuItem{planned("resource-view-home", "资源总览", "resource-view", "resource:view", "LayoutList")}},
	{"inspection", "自动化巡检", "ClipboardCheck", []MenuItem{planned("inspection-home", "巡检任务", "inspection", "inspection:view", "ClipboardCheck")}},
	{"monitor", "监控中心", "Activity", []MenuItem{{Code: "monitor-home", Name: "监控总览", Path: "/monitor", Permission: "monitor:view", Icon: "Activity"}}},
	{"capacity", "资产管理", "Database", []MenuItem{{Code: "capacity-home", Name: "资产总览", Path: "/capacity", Permission: "capacity:view", Icon: "Database"}}},
	{"alert", "告警中心", "BellRing", []MenuItem{{Code: "alert-home", Name: "告警列表", Path: "/alerts", Permission: "alert:view", Icon: "BellRing"}}},
	{"topology", "资源拓扑", "Network", []MenuItem{{Code: "topology-home", Name: "全链路拓扑", Path: "/topology", Permission: "topology:view", Icon: "Network"}}},
	{"analytics", "运营分析", "ChartPie", []MenuItem{
		{Code: "analytics-home", Name: "总览", Path: "/analytics", Permission: "analytics:view", Icon: "LayoutDashboard"},
		{Code: "analytics-base", Name: "基础资源分析", Path: "/analytics/base", Permission: "analytics:view", Icon: "Server"},
		{Code: "analytics-vm", Name: "云主机分析", Path: "/analytics/vm", Permission: "analytics:view", Icon: "Activity"},
		{Code: "analytics-disk", Name: "磁盘分析", Path: "/analytics/disk", Permission: "analytics:view", Icon: "Database"},
		{Code: "analytics-optimize", Name: "云主机优化", Path: "/analytics/optimize", Permission: "analytics:view", Icon: "Gauge"},
		{Code: "analytics-policy", Name: "优化策略", Path: "/analytics/policy", Permission: "analytics:view", Icon: "SlidersHorizontal"},
	}},
	{"system", "系统管理", "Settings2", []MenuItem{
		{Code: "provider", Name: "平台管理", Path: "/system/providers", Permission: "provider:view", Icon: "Server"},
		{Code: "user", Name: "用户管理", Path: "/system/users", Permission: "user:view", Icon: "Users"},
		{Code: "role", Name: "角色管理", Path: "/system/roles", Permission: "role:view", Icon: "ShieldCheck"},
		{Code: "audit", Name: "审计日志", Path: "/system/audit", Permission: "audit:view", Icon: "ScrollText"},
		{Code: "domain", Name: "域名配置", Path: "/system/domain", Permission: "domain:view", Icon: "Globe"},
		{Code: "settings", Name: "系统配置", Path: "/system/settings", Permission: "settings:view", Icon: "SlidersHorizontal"},
	}},
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
