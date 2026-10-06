package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
	"github.com/jibiao-ai/cloudwatch/internal/provider"
)

func userQuery(r *http.Request, paged bool) auth.UserQuery {
	g := r.URL.Query().Get
	q := auth.UserQuery{Keyword: g("keyword"), Status: g("status"), RoleID: g("roleId"), SortKey: g("sortKey"), SortOrder: g("sortOrder")}
	if paged {
		q.Page, _ = strconv.Atoi(g("page"))
		q.PageSize, _ = strconv.Atoi(g("pageSize"))
		if q.Page < 1 {
			q.Page = 1
		}
		if q.PageSize < 1 || q.PageSize > 200 {
			q.PageSize = 10
		}
	}
	return q
}

func (s *Server) userList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Auth.ListUsers(r.Context(), userQuery(r, true))
	if err != nil {
		return err
	}
	httpx.OK(w, pg)
	return nil
}

var userStatusCN = map[string]string{"active": "正常", "disabled": "已禁用", "locked": "已锁定"}

func (s *Server) userExport(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	pg, err := s.Auth.ListUsers(r.Context(), userQuery(r, false))
	if err != nil {
		return err
	}
	rows := make([][]any, 0, len(pg.List))
	for _, u := range pg.List {
		last := ""
		if u.LastLoginAt != nil {
			last = u.LastLoginAt.In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")
		}
		rows = append(rows, []any{u.Username, u.Name, u.Email, u.Phone, u.Department, u.Source, strings.Join(u.RoleNames, "、"), userStatusCN[u.Status], last})
	}
	s.rec(r, p, "user", "export", "导出用户列表（"+strconv.Itoa(len(rows))+" 条）", "/system/users", nil, nil, t0)
	return writeXlsx(w, "users.xlsx", []xSheet{{Name: "用户", Head: []string{"用户名", "姓名", "邮箱", "手机", "部门", "来源", "角色", "状态", "最后登录"}, Rows: rows}})
}

func (s *Server) userCreate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in auth.UserInput
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	// 不能授予超出自己权限的角色（避免有「新增用户」权限的人给自己人提权）
	if err := s.checkGrant(r, p, in.RoleIDs); err != nil {
		s.rec(r, p, "user", "create", in.Username, "/system/users", in, err, t0)
		return err
	}
	u, pw, err := s.Auth.CreateUser(r.Context(), in)
	target := in.Username
	if u != nil {
		target = u.Username
	}
	s.rec(r, p, "user", "create", target, "/system/users", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{
		"id": u.ID, "username": u.Username, "name": u.Name, "email": u.Email, "phone": u.Phone, "department": u.Department,
		"source": u.Source, "status": u.Status, "mustChangePassword": u.MustChangePassword, "failCount": u.FailCount,
		"lockedUntil": u.LockedUntil, "lastLoginAt": u.LastLoginAt, "createdAt": u.CreatedAt, "roleIds": u.RoleIDs, "roleNames": u.RoleNames,
		"initialPassword": pw,
	})
	return nil
}

// checkGrant 非超级管理员只能授予「自己已拥有权限范围内」的角色。
func (s *Server) checkGrant(r *http.Request, p *auth.Principal, roleIDs []string) error {
	if p.Can("*") {
		return nil
	}
	ps, err := s.Auth.RolePerms(r.Context(), roleIDs)
	if err != nil {
		return err
	}
	for _, c := range ps {
		if !p.Can(c) {
			return httpx.Err(403, "不能授予超出自身权限的角色")
		}
	}
	return nil
}

func (s *Server) userUpdate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in auth.UserInput
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if in.RoleIDs != nil {
		if err := s.checkGrant(r, p, in.RoleIDs); err != nil {
			return err
		}
	}
	u, err := s.Auth.UpdateUser(r.Context(), r.PathValue("id"), p.User.ID, in)
	target := r.PathValue("id")
	if u != nil {
		target = u.Username
	}
	s.rec(r, p, "user", "update", target, "/system/users", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, u)
	return nil
}

func (s *Server) userSetStatus(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 64<<10)
	if err != nil {
		return err
	}
	var in struct {
		IDs    []string `json:"ids"`
		Status string   `json:"status"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	err = s.Auth.SetStatus(r.Context(), in.IDs, in.Status, p.User.ID)
	label := "启用"
	if in.Status == "disabled" {
		label = "禁用"
	}
	s.rec(r, p, "user", "update", strconv.Itoa(len(in.IDs))+" 个用户（"+label+"）", "/system/users", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, nil)
	return nil
}

func (s *Server) userDelete(batch bool) authed {
	return func(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
		t0 := time.Now()
		ids := []string{}
		if batch {
			b, err := httpx.ReadBody(r, 64<<10)
			if err != nil {
				return err
			}
			var in struct {
				IDs []string `json:"ids"`
			}
			if err := httpx.DecodeJSON(b, &in); err != nil {
				return err
			}
			ids = in.IDs
		} else {
			ids = []string{r.PathValue("id")}
		}
		names, err := s.Auth.DeleteUsers(r.Context(), ids, p.User.ID)
		target := strings.Join(names, "、")
		if len(names) > 1 {
			target = strconv.Itoa(len(names)) + " 个用户（" + target + "）"
		}
		if target == "" {
			target = strings.Join(ids, "、")
		}
		s.rec(r, p, "user", "delete", target, "/system/users", map[string]any{"ids": ids}, err, t0)
		if err != nil {
			return err
		}
		httpx.OK(w, map[string]any{"removed": len(names)})
		return nil
	}
}

func (s *Server) userUnlock(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	name, err := s.Auth.UnlockUser(r.Context(), r.PathValue("id"))
	s.rec(r, p, "user", "update", name+"（解锁）", "/system/users", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, nil)
	return nil
}

func (s *Server) userResetPassword(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	name, pw, err := s.Auth.ResetPassword(r.Context(), r.PathValue("id"))
	s.rec(r, p, "user", "reset_password", name, "/system/users", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"password": pw, "mustChangePassword": true})
	return nil
}

/* ------------------------------- 角色 ------------------------------- */

func (s *Server) roleList(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	g := r.URL.Query().Get
	q := auth.RoleQuery{Keyword: g("keyword"), Type: g("type")}
	paged := g("page") != "" || g("pageSize") != ""
	if paged { // 带分页参数 → 分页（角色管理页）；否则全量数组（用户页角色下拉）
		q.Page, _ = strconv.Atoi(g("page"))
		q.PageSize, _ = strconv.Atoi(g("pageSize"))
		if q.Page < 1 {
			q.Page = 1
		}
		if q.PageSize < 1 || q.PageSize > 200 {
			q.PageSize = 10
		}
	}
	pg, err := s.Auth.ListRoles(r.Context(), q)
	if err != nil {
		return err
	}
	if !paged {
		httpx.OK(w, pg.List)
		return nil
	}
	httpx.OK(w, pg)
	return nil
}

func (s *Server) roleGet(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	ro, err := s.Auth.GetRole(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	httpx.OK(w, ro)
	return nil
}

func (s *Server) roleUsers(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	us, err := s.Auth.RoleUsers(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	httpx.OK(w, us)
	return nil
}

// roleScopeTree 数据权限的可选范围：平台 → 集群 → 资源。目前仅平台一级有真实数据，集群 / 资源层留空。
func (s *Server) roleScopeTree(w http.ResponseWriter, r *http.Request, _ *auth.Principal) error {
	pg, err := s.Providers.Store.List(r.Context(), provider.Query{})
	if err != nil {
		return err
	}
	type clu struct {
		Value     string `json:"value"`
		Label     string `json:"label"`
		Resources []any  `json:"resources"`
	}
	type prv struct {
		Value    string `json:"value"`
		Label    string `json:"label"`
		Clusters []clu  `json:"clusters"`
	}
	out := make([]prv, 0, len(pg.List))
	for _, p := range pg.List {
		out = append(out, prv{Value: p.ID, Label: p.Name, Clusters: []clu{}})
	}
	httpx.OK(w, map[string]any{"providers": out})
	return nil
}

func (s *Server) roleCreate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 256<<10)
	if err != nil {
		return err
	}
	var in auth.RoleInput
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if err := s.checkPermSubset(p, in.Permissions); err != nil {
		return err
	}
	ro, err := s.Auth.CreateRole(r.Context(), in)
	s.rec(r, p, "role", "create", in.Name, "/system/roles", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, ro)
	return nil
}

// checkPermSubset 非超级管理员不能创建 / 编辑出超出自身权限的角色。
func (s *Server) checkPermSubset(p *auth.Principal, perms []string) error {
	if p.Can("*") {
		return nil
	}
	for _, c := range auth.CleanPerms(perms) {
		if !p.Can(c) {
			return httpx.Err(403, "不能授予超出自身权限的功能权限："+c)
		}
	}
	return nil
}

func (s *Server) roleCopy(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 16<<10)
	if err != nil {
		return err
	}
	var in struct {
		Name string `json:"name"`
		Code string `json:"code"`
	}
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	src, err := s.Auth.GetRole(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	if err := s.checkPermSubset(p, src.Permissions); err != nil && !p.Can("*") {
		return err
	}
	ro, err := s.Auth.CopyRole(r.Context(), r.PathValue("id"), in.Name, in.Code)
	s.rec(r, p, "role", "create", in.Name+"（复制自 "+src.Name+"）", "/system/roles", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, ro)
	return nil
}

func (s *Server) roleUpdate(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	b, err := httpx.ReadBody(r, 256<<10)
	if err != nil {
		return err
	}
	var in auth.RoleInput
	if err := httpx.DecodeJSON(b, &in); err != nil {
		return err
	}
	if err := s.checkPermSubset(p, in.Permissions); err != nil {
		return err
	}
	ro, err := s.Auth.UpdateRole(r.Context(), r.PathValue("id"), in)
	target := in.Name
	if ro != nil {
		target = ro.Name
	}
	s.rec(r, p, "role", "update", target, "/system/roles", in, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, ro)
	return nil
}

func (s *Server) roleDelete(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	t0 := time.Now()
	name, err := s.Auth.DeleteRole(r.Context(), r.PathValue("id"))
	if name == "" {
		name = r.PathValue("id")
	}
	s.rec(r, p, "role", "delete", name, "/system/roles", nil, err, t0)
	if err != nil {
		return err
	}
	httpx.OK(w, nil)
	return nil
}
