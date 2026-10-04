package api

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
)

// xSheet 导出工作簿中的一张工作表。
type xSheet struct {
	Name string
	Head []string
	Rows [][]any
}

// maxExportRows 单次导出的行数上限（超出截断，避免撑爆内存）。
const maxExportRows = 50000

var sheetNameFix = strings.NewReplacer("/", "-", "\\", "-", "?", "", "*", "", "[", "", "]", "", ":", "")

func sheetName(n string, used map[string]bool) string {
	n = sheetNameFix.Replace(n)
	if r := []rune(n); len(r) > 28 {
		n = string(r[:28])
	}
	if n == "" {
		n = "Sheet"
	}
	base := n
	for i := 2; used[n]; i++ {
		n = fmt.Sprintf("%s%d", base, i)
	}
	used[n] = true
	return n
}

// writeXlsx 把若干工作表写成 .xlsx 响应（表头加粗、冻结首行、统一列宽）。
func writeXlsx(w http.ResponseWriter, filename string, sheets []xSheet) error {
	f := excelize.NewFile()
	used := map[string]bool{}
	bold, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	for i, sh := range sheets {
		name := sheetName(sh.Name, used)
		if i == 0 {
			_ = f.SetSheetName("Sheet1", name)
		} else if _, err := f.NewSheet(name); err != nil {
			return err
		}
		head := make([]any, len(sh.Head))
		for j, h := range sh.Head {
			head[j] = h
		}
		_ = f.SetSheetRow(name, "A1", &head)
		for r, row := range sh.Rows {
			cell, _ := excelize.CoordinatesToCellName(1, r+2)
			line := row
			_ = f.SetSheetRow(name, cell, &line)
		}
		if n := len(sh.Head); n > 0 {
			last, _ := excelize.ColumnNumberToName(n)
			_ = f.SetColWidth(name, "A", last, 20)
			_ = f.SetCellStyle(name, "A1", last+"1", bold)
			_ = f.SetPanes(name, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})
		}
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return err
	}
	h := w.Header()
	h.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	h.Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	_, _ = w.Write(buf.Bytes())
	return nil
}

// xv 把行里的任意值规整为单元格值：空 → ""，*float64 解引用，bool → 是 / 否。
func xv(v any) any {
	switch x := v.(type) {
	case nil:
		return ""
	case *float64:
		if x == nil {
			return ""
		}
		return *x
	case float64, int, int64, string:
		return x
	case bool:
		if x {
			return "是"
		}
		return "否"
	}
	return fmt.Sprint(v)
}

// xtime 接口返回的 ISO 时间（无时区按 UTC）→ 东八区「2006-01-02 15:04:05」；无法解析时原样返回。
func xtime(v any) any {
	s, _ := v.(string)
	if s == "" {
		return ""
	}
	for _, l := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999", "2006-01-02T15:04:05", "2006-01-02 15:04:05"} {
		if t, err := time.ParseInLocation(l, s, time.UTC); err == nil {
			return t.In(analytics.CST).Format("2006-01-02 15:04:05")
		}
	}
	return s
}

// xround 数值保留 d 位小数（非数值原样返回）。
func xround(v any, d int) any {
	v = xv(v)
	if f, ok := v.(float64); ok {
		p := 1.0
		for i := 0; i < d; i++ {
			p *= 10
		}
		return float64(int64(f*p+0.5*sign(f))) / p
	}
	return v
}

func sign(f float64) float64 {
	if f < 0 {
		return -1
	}
	return 1
}
