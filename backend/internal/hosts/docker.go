package hosts

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Docker 通过 docker.sock 的 Engine API 访问容器（无需 docker CLI）。
type Docker struct {
	sock string
	hc   *http.Client
}

func NewDocker(sock string) *Docker {
	return &Docker{sock: sock, hc: &http.Client{Transport: &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", sock)
		},
		DisableKeepAlives: true,
	}}}
}

type Container struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Image string `json:"image"`
	State string `json:"state"`
}

func (d *Docker) do(ctx context.Context, method, path string, q url.Values, body io.Reader, ctype string) (*http.Response, error) {
	u := "http://docker" + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, err
	}
	if ctype != "" {
		req.Header.Set("Content-Type", ctype)
	}
	resp, err := d.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接 Docker（%s）: %w", d.sock, err)
	}
	return resp, nil
}

func (d *Docker) json(ctx context.Context, method, path string, q url.Values, in, out any, okStatus ...int) error {
	var body io.Reader
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
	}
	resp, err := d.do(ctx, method, path, q, body, "application/json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	ok := resp.StatusCode/100 == 2
	for _, s := range okStatus {
		ok = ok || resp.StatusCode == s
	}
	if !ok {
		var m struct{ Message string }
		_ = json.Unmarshal(raw, &m)
		if m.Message == "" {
			m.Message = strings.TrimSpace(string(raw))
		}
		return fmt.Errorf("Docker API %d: %s", resp.StatusCode, m.Message)
	}
	if out != nil && len(raw) > 0 {
		return json.Unmarshal(raw, out)
	}
	return nil
}

func (d *Docker) Ping(ctx context.Context) error {
	resp, err := d.do(ctx, "GET", "/_ping", nil, nil, "")
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("Docker _ping 返回 %d", resp.StatusCode)
	}
	return nil
}

func (d *Docker) Running(ctx context.Context) ([]Container, error) {
	var raw []struct {
		ID, Image, State string
		Names            []string
	}
	if err := d.json(ctx, "GET", "/containers/json", nil, nil, &raw); err != nil {
		return nil, err
	}
	out := make([]Container, 0, len(raw))
	for _, c := range raw {
		n := c.ID[:12]
		if len(c.Names) > 0 {
			n = strings.TrimPrefix(c.Names[0], "/")
		}
		out = append(out, Container{ID: c.ID, Name: n, Image: c.Image, State: c.State})
	}
	return out, nil
}

// Inject 把受管段写入容器的 /etc/hosts。依次尝试：
//  1. 宿主机直写：后端与 Docker 同机时，直接改 inspect 返回的 HostsPath（不依赖容器内任何命令）；
//  2. docker exec：以 root 在容器内用 sh+awk 幂等替换（适用于后端本身运行在容器里、仅挂载了 docker.sock 的情形）；
//  3. 归档写入：PUT /containers/{id}/archive（无 shell 的精简镜像）。
//
// 返回实际采用的方式。
func (d *Docker) Inject(ctx context.Context, id, block string) (string, error) {
	var info struct {
		HostsPath  string
		HostConfig struct{ NetworkMode string }
	}
	if err := d.json(ctx, "GET", "/containers/"+id+"/json", nil, nil, &info); err != nil {
		return "", err
	}
	if info.HostConfig.NetworkMode == "host" {
		return "", errors.New("host 网络模式的容器共用宿主机 hosts，请在「本机 hosts」中同步")
	}
	var errs []string
	if p := info.HostsPath; p != "" {
		if _, err := os.Stat(p); err == nil {
			if _, werr := writeHostFile(p, block); werr == nil {
				return "宿主机直写", nil
			} else {
				errs = append(errs, "直写: "+werr.Error())
			}
		}
	}
	if err := d.execInject(ctx, id, block); err == nil {
		return "容器内执行", nil
	} else {
		errs = append(errs, "exec: "+err.Error())
	}
	if err := d.archiveInject(ctx, id, block); err == nil {
		return "归档写入", nil
	} else {
		errs = append(errs, "archive: "+err.Error())
	}
	return "", errors.New(strings.Join(errs, "；"))
}

// writeHostFile 容器 hosts 文件只能原地覆盖（它是 bind mount）。
func writeHostFile(path, block string) (bool, error) {
	cur, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	next := Merge(string(cur), block)
	if Same(next, string(cur)) {
		return false, nil
	}
	st, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	return true, os.WriteFile(path, []byte(next), st.Mode().Perm())
}

const injectScript = `f=/etc/hosts; t=/tmp/.cwh.$$; ` +
	`awk 'BEGIN{b=ENVIRON["CW_BEGIN"];e=ENVIRON["CW_END"];s=0} {l=$0; sub(/[ \r]+$/,"",l); if(l==b){s=1;next} if(l==e){s=0;next} if(!s)print}' "$f" > "$t" || exit 11; ` +
	`if [ -n "$CW_BLOCK" ]; then printf '%s\n' "$CW_BLOCK" >> "$t" || exit 12; fi; ` +
	`cat "$t" > "$f" || exit 13; rm -f "$t"`

func (d *Docker) execInject(ctx context.Context, id, block string) error {
	var ex struct{ Id string }
	cfg := map[string]any{
		"AttachStdout": true, "AttachStderr": true, "User": "root",
		"Env": []string{"CW_BEGIN=" + BeginMark, "CW_END=" + EndMark, "CW_BLOCK=" + strings.TrimRight(block, "\n")},
		"Cmd": []string{"sh", "-c", injectScript},
	}
	if err := d.json(ctx, "POST", "/containers/"+id+"/exec", nil, cfg, &ex); err != nil {
		return err
	}
	resp, err := d.do(ctx, "POST", "/exec/"+ex.Id+"/start", nil, strings.NewReader(`{"Detach":false,"Tty":false}`), "application/json")
	if err != nil {
		return err
	}
	out, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("exec start %d", resp.StatusCode)
	}
	var ins struct {
		ExitCode int
		Running  bool
	}
	if err := d.json(ctx, "GET", "/exec/"+ex.Id+"/json", nil, nil, &ins); err != nil {
		return err
	}
	if ins.ExitCode != 0 {
		return fmt.Errorf("退出码 %d %s", ins.ExitCode, strings.TrimSpace(sanitize(out)))
	}
	return nil
}

func sanitize(b []byte) string {
	return strings.Map(func(r rune) rune {
		if r < 32 && r != '\n' {
			return -1
		}
		return r
	}, string(b))
}

// archiveInject 读取容器现有 /etc/hosts（GET archive），合并后整体写回。
func (d *Docker) archiveInject(ctx context.Context, id, block string) error {
	q := url.Values{"path": {"/etc/hosts"}}
	resp, err := d.do(ctx, "GET", "/containers/"+id+"/archive", q, nil, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("读取容器 hosts 失败(%d)", resp.StatusCode)
	}
	tr := tar.NewReader(resp.Body)
	if _, err := tr.Next(); err != nil {
		return err
	}
	cur, err := io.ReadAll(io.LimitReader(tr, 4<<20))
	if err != nil {
		return err
	}
	next := Merge(string(cur), block)
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	_ = tw.WriteHeader(&tar.Header{Name: "hosts", Mode: 0o644, Size: int64(len(next)), ModTime: time.Now()})
	_, _ = tw.Write([]byte(next))
	_ = tw.Close()
	r2, err := d.do(ctx, "PUT", "/containers/"+id+"/archive", url.Values{"path": {"/etc"}}, &buf, "application/x-tar")
	if err != nil {
		return err
	}
	defer r2.Body.Close()
	if r2.StatusCode/100 != 2 {
		b, _ := io.ReadAll(io.LimitReader(r2.Body, 4<<10))
		return fmt.Errorf("写入失败(%d) %s", r2.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

// ContainerHasBlock 检查容器 hosts 是否已含期望的受管段（GET archive，只读）。
func (d *Docker) ContainerHasBlock(ctx context.Context, id, block string) (bool, error) {
	resp, err := d.do(ctx, "GET", "/containers/"+id+"/archive", url.Values{"path": {"/etc/hosts"}}, nil, "")
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return false, fmt.Errorf("读取失败(%d)", resp.StatusCode)
	}
	tr := tar.NewReader(resp.Body)
	if _, err := tr.Next(); err != nil {
		return false, err
	}
	cur, _ := io.ReadAll(io.LimitReader(tr, 4<<20))
	return Same(Merge(string(cur), block), string(cur)), nil
}

// WatchStarts 订阅容器 start 事件（断线自动重连），容器重启后 Docker 会重建 /etc/hosts，需要重新注入。
func (d *Docker) WatchStarts(ctx context.Context, onStart func(id, name string)) {
	backoff := 2 * time.Second
	for ctx.Err() == nil {
		q := url.Values{"filters": {`{"type":["container"],"event":["start"]}`}}
		resp, err := d.do(ctx, "GET", "/events", q, nil, "")
		if err == nil && resp.StatusCode == 200 {
			backoff = 2 * time.Second
			dec := json.NewDecoder(resp.Body)
			for {
				var ev struct {
					ID    string
					Actor struct{ Attributes map[string]string }
				}
				if dec.Decode(&ev) != nil {
					break
				}
				onStart(ev.ID, ev.Actor.Attributes["name"])
			}
			resp.Body.Close()
		} else if resp != nil {
			resp.Body.Close()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}
