package hosts

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// StripBlock 去掉文本中的受管段（含起止标记），其余内容原样保留。
func StripBlock(text string) string {
	var out []string
	skip := false
	for _, ln := range strings.Split(text, "\n") {
		t := strings.TrimRight(ln, "\r ")
		switch {
		case t == BeginMark:
			skip = true
		case t == EndMark:
			skip = false
		case !skip:
			out = append(out, ln)
		}
	}
	return strings.Join(out, "\n")
}

// Merge 把受管段并入 hosts 文本：先剔除旧段再追加新段，保证幂等。
func Merge(text, block string) string {
	base := strings.TrimRight(StripBlock(text), "\n")
	if base != "" {
		base += "\n"
	}
	if block == "" {
		return base
	}
	return base + block
}

// WriteLocal 把受管段写入本机 hosts 文件（仅改动受管段，文件其余内容保持不变）。
// 先尝试「临时文件 + rename」原子替换；若目标是挂载点（如容器内 /etc/hosts）则退化为原地覆盖写。
func WriteLocal(path, block string) (changed bool, err error) {
	if !ValidatePath(path) {
		return false, errors.New("hosts 文件路径不合法")
	}
	cur, err := os.ReadFile(path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return false, fmt.Errorf("读取 %s 失败: %w", path, err)
		}
		cur = nil
	}
	next := Merge(string(cur), block)
	if Same(next, string(cur)) {
		return false, nil
	}
	mode := os.FileMode(0o644)
	if st, e := os.Stat(path); e == nil {
		mode = st.Mode().Perm()
	}
	tmp, e := os.CreateTemp(filepath.Dir(path), ".cwhosts-*")
	if e == nil {
		name := tmp.Name()
		_, we := tmp.WriteString(next)
		ce := tmp.Close()
		if we == nil && ce == nil && os.Chmod(name, mode) == nil && os.Rename(name, path) == nil {
			return true, nil
		}
		_ = os.Remove(name)
	}
	if err := os.WriteFile(path, []byte(next), mode); err != nil { // 原地覆盖（保留 inode，适配 bind mount）
		return false, fmt.Errorf("写入 %s 失败（请确认后端进程有写权限）: %w", path, err)
	}
	return true, nil
}

// Same 忽略末尾换行差异的文本比较。
func Same(a, b string) bool {
	return strings.TrimRight(a, "\r\n ") == strings.TrimRight(b, "\r\n ")
}

// LocalInSync 检查本机 hosts 文件中的受管段是否与期望一致。
func LocalInSync(path, block string) (bool, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return block == "", nil
		}
		return false, err
	}
	return Same(Merge(string(b), block), string(b)), nil
}
