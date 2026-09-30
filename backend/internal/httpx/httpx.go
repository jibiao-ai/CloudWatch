// Package httpx 统一响应结构 {code,message,data}、错误类型与通用中间件。
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
)

type Resp struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// HTTPError 业务错误：Status 为 HTTP 状态码，Code 为业务码（默认等于 Status）。
type HTTPError struct {
	Status int
	Code   int
	Msg    string
	Data   any
}

func (e *HTTPError) Error() string { return e.Msg }

func Err(status int, msg string) *HTTPError {
	return &HTTPError{Status: status, Code: status, Msg: msg}
}
func ErrData(status, code int, msg string, data any) *HTTPError {
	return &HTTPError{Status: status, Code: code, Msg: msg, Data: data}
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func OK(w http.ResponseWriter, data any) { WriteJSON(w, 200, Resp{Code: 0, Message: "ok", Data: data}) }

type Handler func(w http.ResponseWriter, r *http.Request) error

// Wrap 把返回 error 的处理器适配为 http.Handler，统一错误输出；未知错误只记录日志，不向客户端泄露细节。
func Wrap(h Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			var he *HTTPError
			if errors.As(err, &he) {
				WriteJSON(w, he.Status, Resp{Code: he.Code, Message: he.Msg, Data: he.Data})
				return
			}
			log.Printf("ERROR %s %s: %v", r.Method, r.URL.Path, err)
			WriteJSON(w, 500, Resp{Code: 500, Message: "服务内部错误，请稍后重试"})
		}
	})
}

// ReadBody 读取请求体（带大小上限）。
func ReadBody(r *http.Request, max int64) ([]byte, error) {
	b, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, max))
	if err != nil {
		return nil, Err(413, "请求体过大或读取失败")
	}
	return b, nil
}

func DecodeJSON(b []byte, v any) error {
	if len(b) == 0 {
		return Err(400, "请求体不能为空")
	}
	if err := json.Unmarshal(b, v); err != nil {
		return Err(400, "请求体不是合法的 JSON")
	}
	return nil
}

func ClientIP(r *http.Request) string {
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return strings.TrimSpace(v)
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("PANIC %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
				WriteJSON(w, 500, Resp{Code: 500, Message: "服务内部错误，请稍后重试"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		if strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/api/assets/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}
