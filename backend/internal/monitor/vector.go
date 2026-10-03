// Package monitor 性能监控：从 EMLA（/apis/monitoring/v1/ecms/*）采集平台指标，落库并提供查询。
package monitor

import (
	"encoding/json"
	"strconv"
)

// Sample 向量中的一个序列点：标签 + 数值。
type Sample struct {
	Labels map[string]string `json:"labels,omitempty"`
	Value  float64           `json:"value"`
	At     float64           `json:"at,omitempty"`
}

// Metric 一个指标（metric_name）及其所有序列。
type Metric struct {
	Name    string   `json:"name"`
	Samples []Sample `json:"samples"`
	Err     string   `json:"err,omitempty"` // EMLA 在 results[].error 里透出的平台侧错误（HTTP 200 外壳 + 内部 500）
}

// emlaDoc 对应 {"results":[{"metric_name":"x","data":{"resultType":"vector","result":[{"metric":{...},"value":[ts,"v"]}]}}]}
type emlaDoc struct {
	Results []struct {
		MetricName string          `json:"metric_name"`
		Error      json.RawMessage `json:"error"`
		Data       struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Metric map[string]any    `json:"metric"`
				Value  []json.RawMessage `json:"value"`
			} `json:"result"`
		} `json:"data"`
	} `json:"results"`
}

func parseNum(raw json.RawMessage) (float64, bool) {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		f, err := strconv.ParseFloat(s, 64)
		return f, err == nil
	}
	var f float64
	if json.Unmarshal(raw, &f) == nil {
		return f, true
	}
	return 0, false
}

func strLabels(m map[string]any) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		switch t := v.(type) {
		case string:
			out[k] = t
		case float64:
			out[k] = strconv.FormatFloat(t, 'f', -1, 64)
		case bool:
			out[k] = strconv.FormatBool(t)
		}
	}
	return out
}

// ParseEMLA 解析 EMLA 响应为 Metric 列表；无法解析的序列点被跳过（值缺失 / 非数字）。
func ParseEMLA(raw []byte) ([]Metric, error) {
	var d emlaDoc
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	out := make([]Metric, 0, len(d.Results))
	for _, r := range d.Results {
		m := Metric{Name: r.MetricName, Samples: []Sample{}, Err: briefEMLAErr(r.Error)}
		for _, s := range r.Data.Result {
			if len(s.Value) < 2 {
				continue
			}
			v, ok := parseNum(s.Value[1])
			if !ok {
				continue
			}
			ts, _ := parseNum(s.Value[0])
			m.Samples = append(m.Samples, Sample{Labels: strLabels(s.Metric), Value: v, At: ts})
		}
		out = append(out, m)
	}
	return out, nil
}

// Find 按名称查找指标。
func Find(ms []Metric, name string) *Metric {
	for i := range ms {
		if ms[i].Name == name {
			return &ms[i]
		}
	}
	return nil
}

// First 返回指标第一个序列点的值。
func (m *Metric) First() (float64, bool) {
	if m == nil || len(m.Samples) == 0 {
		return 0, false
	}
	return m.Samples[0].Value, true
}

// ByLabel 返回 label=val 的序列点值（status=total/usage/percent 等）。
func (m *Metric) ByLabel(label, val string) (float64, bool) {
	if m == nil {
		return 0, false
	}
	for _, s := range m.Samples {
		if s.Labels[label] == val {
			return s.Value, true
		}
	}
	return 0, false
}

// briefEMLAErr 把 results[].error（字符串化的 JSON：{"error":{"message":..,"code":500,"title":..}}）压缩成一句话。
func briefEMLAErr(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	s := string(raw)
	var str string
	if json.Unmarshal(raw, &str) == nil {
		s = str
	}
	var d struct {
		Error struct {
			Message string `json:"message"`
			Code    int    `json:"code"`
			Title   string `json:"title"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(s), &d) == nil && (d.Error.Code != 0 || d.Error.Message != "") {
		out := "平台侧"
		if d.Error.Code != 0 {
			out += "返回 HTTP " + strconv.Itoa(d.Error.Code)
		} else {
			out += "返回错误"
		}
		if d.Error.Title != "" {
			out += " " + d.Error.Title
		}
		if d.Error.Message != "" {
			out += "：" + d.Error.Message
		}
		return out
	}
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return "平台侧返回错误：" + s
}
