package api

import (
	"net/http"

	"github.com/jibiao-ai/cloudwatch/internal/auth"
	"github.com/jibiao-ai/cloudwatch/internal/httpx"
)

type versionItem struct {
	Version    string `json:"version"`
	Title      string `json:"title"`
	ReleasedAt string `json:"releasedAt"`
	Notes      string `json:"notes"`
	Current    bool   `json:"current"`
}

// versions 系统配置 · 版本信息：按发布时间倒序返回全部版本，首条为当前版本。数据来自 app_versions 表。
func (s *Server) versions(w http.ResponseWriter, r *http.Request, p *auth.Principal) error {
	rows, err := s.DB.QueryContext(r.Context(), `SELECT version, title, DATE_FORMAT(released_at,'%Y-%m-%d'), notes FROM app_versions ORDER BY released_at DESC, id DESC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []versionItem{}
	for rows.Next() {
		var v versionItem
		if err := rows.Scan(&v.Version, &v.Title, &v.ReleasedAt, &v.Notes); err != nil {
			return err
		}
		v.Current = len(items) == 0
		items = append(items, v)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	cur := ""
	if len(items) > 0 {
		cur = items[0].Version
	}
	httpx.OK(w, map[string]any{"current": cur, "items": items})
	return nil
}
