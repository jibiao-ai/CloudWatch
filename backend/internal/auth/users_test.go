package auth

import (
	"testing"

	"github.com/jibiao-ai/cloudwatch/internal/settings"
)

// 初始 / 重置密码必须满足任意组合的复杂度策略，否则新用户首次改密或登录会被自家策略拦住。
func TestRandomPasswordMeetsPolicy(t *testing.T) {
	strict := settings.Security{MinLength: 16, RequireUpper: true, RequireLower: true, RequireDigit: true, RequireSpecial: true}
	seen := map[string]bool{}
	for i := 0; i < 300; i++ {
		pw := RandomPassword(strict)
		if miss := CheckPassword(pw, strict); len(miss) > 0 {
			t.Fatalf("密码 %q 不满足策略：%v", pw, miss)
		}
		if len(pw) > 72 {
			t.Fatalf("密码超过 bcrypt 上限")
		}
		if seen[pw] {
			t.Fatalf("随机密码重复")
		}
		seen[pw] = true
	}
	if pw := RandomPassword(settings.Security{MinLength: 4}); len(pw) < 12 {
		t.Fatalf("最小长度应兜底到 12，得到 %d", len(pw))
	}
}

func TestUsernameRule(t *testing.T) {
	for _, ok := range []string{"abc", "Tester.01", "a_b-c"} {
		if !usernameRe.MatchString(ok) {
			t.Errorf("%q 应合法", ok)
		}
	}
	for _, bad := range []string{"ab", "1abc", "a b", "名字abc", ""} {
		if usernameRe.MatchString(bad) {
			t.Errorf("%q 应非法", bad)
		}
	}
}

func TestCleanPerms(t *testing.T) {
	got := CleanPerms([]string{"alert:view", "alert:view", "bogus:x", "*"})
	if len(got) != 1 || got[0] != "alert:view" {
		t.Fatalf("得到 %v", got)
	}
}
