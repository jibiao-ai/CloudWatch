package settings

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"regexp"
	"strings"

	_ "golang.org/x/image/webp"
)

const assetPrefix = "/api/assets/"

type assetRule struct {
	maxBytes int
	mimes    map[string]bool
	minSide  int // logo：宽高均不小于；bg：宽度不小于
	maxSide  int
	isLogo   bool
	label    string
}

var (
	logoRule = assetRule{maxBytes: 512 << 10, mimes: map[string]bool{"image/png": true, "image/jpeg": true, "image/svg+xml": true}, minSide: 64, maxSide: 1024, isLogo: true, label: "Logo"}
	bgRule   = assetRule{maxBytes: 2 << 20, mimes: map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}, minSide: 1200, maxSide: 4096, label: "登录背景"}
	dataRe   = regexp.MustCompile(`^data:([a-zA-Z0-9.+/-]+);base64,(.+)$`)
	svgBad   = regexp.MustCompile(`(?is)<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']\s*(https?:|data:)`)
)

// resolveAsset 把前端提交的图片字段落库：
//
//	"" → 清空；"/api/assets/<id>" → 必须存在且类型匹配；"data:*;base64,…" → 校验后入库并返回新地址。
func (s *Store) resolveAsset(ctx context.Context, tx *sql.Tx, kind, val string, rule assetRule, field string) (string, FieldErrors) {
	e := FieldErrors{}
	val = strings.TrimSpace(val)
	if val == "" {
		return "", e
	}
	if strings.HasPrefix(val, assetPrefix) {
		id := strings.TrimPrefix(val, assetPrefix)
		var k string
		if err := tx.QueryRowContext(ctx, `SELECT kind FROM assets WHERE id=?`, id).Scan(&k); err != nil || k != kind {
			e[field] = rule.label + "文件不存在，请重新上传"
			return "", e
		}
		return val, e
	}
	m := dataRe.FindStringSubmatch(val)
	if m == nil {
		e[field] = rule.label + "格式不正确"
		return "", e
	}
	mime := strings.ToLower(m[1])
	raw, err := base64.StdEncoding.DecodeString(m[2])
	if err != nil {
		e[field] = rule.label + "数据损坏"
		return "", e
	}
	if len(raw) > rule.maxBytes {
		e[field] = fmt.Sprintf("%s 不能超过 %dKB", rule.label, rule.maxBytes>>10)
		return "", e
	}
	// 以内容嗅探为准，不信任声明的 MIME
	sniff := http.DetectContentType(raw)
	if mime == "image/svg+xml" {
		txt := strings.TrimSpace(string(raw))
		if !(rule.mimes[mime]) || !strings.Contains(strings.ToLower(txt), "<svg") || svgBad.MatchString(txt) {
			e[field] = rule.label + "SVG 不合法或包含不安全内容"
			return "", e
		}
	} else {
		if !rule.mimes[mime] || !strings.HasPrefix(sniff, "image/") || (!strings.HasPrefix(sniff, mime) && !(mime == "image/webp" && sniff == "image/webp")) {
			e[field] = rule.label + "文件类型不受支持"
			return "", e
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(raw))
		if err != nil {
			e[field] = rule.label + "图片无法解析"
			return "", e
		}
		if cfg.Width > rule.maxSide || cfg.Height > rule.maxSide {
			e[field] = fmt.Sprintf("%s 边长不能超过 %dpx", rule.label, rule.maxSide)
			return "", e
		}
		if rule.isLogo && (cfg.Width < rule.minSide || cfg.Height < rule.minSide) {
			e[field] = fmt.Sprintf("Logo 至少 %d×%dpx", rule.minSide, rule.minSide)
			return "", e
		}
		if !rule.isLogo && cfg.Width < rule.minSide {
			e[field] = fmt.Sprintf("背景图宽度至少 %dpx", rule.minSide)
			return "", e
		}
	}
	id := newID("as")
	if _, err := tx.ExecContext(ctx, `INSERT INTO assets(id,kind,mime,size,data,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(3))`, id, kind, mime, len(raw), raw); err != nil {
		e[field] = "保存图片失败"
		return "", e
	}
	return assetPrefix + id, e
}

// gcAssets 删除不再被品牌配置引用的图片。
func (s *Store) gcAssets(ctx context.Context, tx *sql.Tx, b Brand) error {
	keep := []any{}
	ph := []string{}
	for _, u := range []string{b.LogoURL, b.LoginBgURL} {
		if strings.HasPrefix(u, assetPrefix) {
			keep = append(keep, strings.TrimPrefix(u, assetPrefix))
			ph = append(ph, "?")
		}
	}
	q := `DELETE FROM assets`
	if len(keep) > 0 {
		q += ` WHERE id NOT IN (` + strings.Join(ph, ",") + `)`
	}
	_, err := tx.ExecContext(ctx, q, keep...)
	return err
}

type Asset struct {
	Mime string
	Data []byte
}

var ErrNotFound = errors.New("not found")

func (s *Store) GetAsset(ctx context.Context, id string) (*Asset, error) {
	a := &Asset{}
	err := s.db.QueryRowContext(ctx, `SELECT mime,data FROM assets WHERE id=?`, id).Scan(&a.Mime, &a.Data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return a, err
}
