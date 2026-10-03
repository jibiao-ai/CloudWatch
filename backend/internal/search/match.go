// Package search 全局搜索的纯逻辑：关键字拆分、命中打分与「命中字段」识别（不依赖数据库，便于单测）。
package search

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Field 参与打分的关键字段（按优先级排列）：[0] 为行里的字段名，[1] 为展示给用户的「命中字段」名称。
type Field [2]string

// Words 把关键字按空白拆成小写词；多个词需同时命中。
func Words(q string) []string { return strings.Fields(strings.ToLower(strings.TrimSpace(q))) }

// Str 把任意值转成字符串（数字去掉多余小数位）。
func Str(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e15 {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	}
	return fmt.Sprint(v)
}

// All 判断文本是否包含全部词。
func All(text string, words []string) bool {
	for _, w := range words {
		if !strings.Contains(text, w) {
			return false
		}
	}
	return true
}

// Score 对一行打分：0 完全相等 / 1 前缀 / 2 包含 / 3 仅在其他字段命中；同时返回命中的字段与原值。
// 逗号分隔的多值字段（如多个 IP）按单个值判断完全相等与前缀。
func Score(row map[string]any, words []string, fields []Field) (score int, label, value string) {
	if len(words) == 0 {
		return 3, "", ""
	}
	w := words[0]
	score = 3
	for _, f := range fields {
		raw := Str(row[f[0]])
		if raw == "" {
			continue
		}
		for _, part := range strings.Split(raw, ",") {
			p := strings.ToLower(strings.TrimSpace(part))
			s := 3
			switch {
			case p == w:
				s = 0
			case strings.HasPrefix(p, w):
				s = 1
			case strings.Contains(p, w):
				s = 2
			}
			if s < score {
				score, label, value = s, f[1], strings.TrimSpace(part)
			}
		}
	}
	if score == 3 {
		return 3, "其他字段", ""
	}
	return score, label, value
}
