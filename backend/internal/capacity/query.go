package capacity

import (
	"context"
	"sort"
	"strings"
)

// Query 列表查询：全部平台聚合 → 平台 / 状态筛选 → 关键字搜索 → 排序 → 分页。
type Query struct {
	Kind, Keyword, ProviderID, Status string
	SortKey, SortOrder                string
	Page, PageSize                    int
}

type Facet struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Tone  string `json:"tone"`
	Count int    `json:"count"`
}

type PageResult struct {
	List     []Row   `json:"list"`
	Total    int     `json:"total"`
	All      int     `json:"all"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
	Facets   []Facet `json:"facets"`
}

func hide(r Row) Row {
	out := make(Row, len(r))
	for k, v := range r {
		if k != "_s" {
			out[k] = v
		}
	}
	return out
}

// cmpVal 比较两个行值：数值按大小、字符串按自然序（忽略大小写）；空值恒排最后。
func cmpVal(a, b any) (c int, aNil, bNil bool) {
	an, bn := a == nil || toStr(a) == "", b == nil || toStr(b) == ""
	if an || bn {
		return 0, an, bn
	}
	fa, oa := a.(float64)
	fb, ob := b.(float64)
	if oa && ob {
		switch {
		case fa < fb:
			return -1, false, false
		case fa > fb:
			return 1, false, false
		}
		return 0, false, false
	}
	return natCmp(strings.ToLower(toStr(a)), strings.ToLower(toStr(b))), false, false
}

// Search 查询某类资源。
func (s *Store) Search(ctx context.Context, plats []Platform, q Query) (*PageResult, error) {
	var base []Row
	for _, p := range plats {
		if q.ProviderID != "" && q.ProviderID != p.ID {
			continue
		}
		e, err := s.load(ctx, p)
		if err != nil {
			return nil, err
		}
		base = append(base, e.rows[q.Kind]...)
	}
	// 状态分面：按「平台筛选后」统计，便于下拉显示各状态数量
	fc := map[string]*Facet{}
	var order []string
	for _, r := range base {
		code := toStr(r["status"])
		if r["status"] == nil {
			code = toStr(r["state"])
		}
		if code == "" {
			continue
		}
		f := fc[code]
		if f == nil {
			f = &Facet{Value: code, Label: toStr(first2(r["statusText"], r["stateText"], code)), Tone: toStr(first2(r["statusTone"], r["stateTone"], "default"))}
			fc[code] = f
			order = append(order, code)
		}
		f.Count++
	}
	sort.Strings(order)
	facets := make([]Facet, 0, len(order))
	for _, c := range order {
		facets = append(facets, *fc[c])
	}

	kw := strings.ToLower(strings.TrimSpace(q.Keyword))
	words := strings.Fields(kw) // 多个关键字（空格分隔）需同时命中
	rows := make([]Row, 0, len(base))
	for _, r := range base {
		if q.Status != "" {
			code := toStr(r["status"])
			if r["status"] == nil {
				code = toStr(r["state"])
			}
			if code != q.Status {
				continue
			}
		}
		if len(words) > 0 {
			t, _ := r["_s"].(string)
			hit := true
			for _, w := range words {
				if !strings.Contains(t, w) {
					hit = false
					break
				}
			}
			if !hit {
				continue
			}
		}
		rows = append(rows, r)
	}
	if q.SortKey != "" && validKey(q.SortKey) {
		desc := q.SortOrder == "desc"
		sort.SliceStable(rows, func(i, j int) bool {
			c, an, bn := cmpVal(rows[i][q.SortKey], rows[j][q.SortKey])
			if an || bn {
				return !an && bn // 空值恒在最后，不受升降序影响
			}
			if desc {
				return c > 0
			}
			return c < 0
		})
	}
	if q.PageSize < 1 || q.PageSize > 200 {
		q.PageSize = 10
	}
	if q.Page < 1 {
		q.Page = 1
	}
	from := (q.Page - 1) * q.PageSize
	if from > len(rows) {
		from = 0
		q.Page = 1
	}
	to := from + q.PageSize
	if to > len(rows) {
		to = len(rows)
	}
	out := make([]Row, 0, to-from)
	for _, r := range rows[from:to] {
		out = append(out, hide(r))
	}
	return &PageResult{List: out, Total: len(rows), All: len(base), Page: q.Page, PageSize: q.PageSize, Facets: facets}, nil
}

func first2(a ...any) any {
	for _, v := range a {
		if v != nil && toStr(v) != "" {
			return v
		}
	}
	return ""
}

func validKey(k string) bool {
	for _, c := range k {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') {
			return false
		}
	}
	return k != "" && k != "raw"
}
