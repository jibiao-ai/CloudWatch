package inspection

import (
	"fmt"
	"strings"
)

// ---- 低层 OOXML 构件 ----

const (
	colNavy  = "1A3E72" // 表标题行 / 封面主色
	colBlue  = "1E4D8C" // 标题
	colHead  = "DCE6F4" // 表头浅蓝
	colZebra = "F5F8FC"
	colGrey  = "6B7280"
	colOK    = "2E7D32"
	colWarn  = "E65100"
	colBad   = "C62828"
	colNA    = "757575"

	pageW   = 11906
	margin  = 1134
	contenW = pageW - 2*margin // 9638
)

func statusColor(s string) string {
	switch s {
	case OK:
		return colOK
	case Warn:
		return colWarn
	case Bad:
		return colBad
	}
	return colNA
}

// esc 转义 XML 文本并去除 XML 1.0 不允许的控制字符。
func esc(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\t' || r == '\n' || r == '\r' || (r >= 0x20 && r <= 0xD7FF) || (r >= 0xE000 && r <= 0xFFFD) || r >= 0x10000:
			switch r {
			case '&':
				b.WriteString("&amp;")
			case '<':
				b.WriteString("&lt;")
			case '>':
				b.WriteString("&gt;")
			case '"':
				b.WriteString("&quot;")
			case '\n', '\r':
				b.WriteString(" ")
			default:
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

// run 文本片段。size 为半磅（如 21 = 10.5pt）。
type run struct {
	text  string
	bold  bool
	color string
	size  int
	br    bool // 之前换行
}

func (r run) xml() string {
	var p strings.Builder
	p.WriteString("<w:r><w:rPr>")
	if r.bold {
		p.WriteString("<w:b/><w:bCs/>")
	}
	if r.color != "" {
		p.WriteString(`<w:color w:val="` + r.color + `"/>`)
	}
	if r.size > 0 {
		p.WriteString(fmt.Sprintf(`<w:sz w:val="%d"/><w:szCs w:val="%d"/>`, r.size, r.size))
	}
	p.WriteString("</w:rPr>")
	if r.br {
		p.WriteString("<w:br/>")
	}
	p.WriteString(`<w:t xml:space="preserve">` + esc(r.text) + "</w:t></w:r>")
	return p.String()
}

type para struct {
	style  string
	align  string // left|center|right
	runs   []run
	before int
	after  int
	indent int // 左缩进 twips
	keep   bool
	shade  string
	pbr    bool // 段前分页
}

func (p para) xml() string {
	var b strings.Builder
	b.WriteString("<w:p><w:pPr>")
	if p.style != "" {
		b.WriteString(`<w:pStyle w:val="` + p.style + `"/>`)
	}
	if p.keep {
		b.WriteString("<w:keepNext/>")
	}
	if p.pbr {
		b.WriteString("<w:pageBreakBefore/>")
	}
	if p.shade != "" {
		b.WriteString(`<w:shd w:val="clear" w:color="auto" w:fill="` + p.shade + `"/>`)
	}
	if p.before > 0 || p.after > 0 {
		b.WriteString(fmt.Sprintf(`<w:spacing w:before="%d" w:after="%d"/>`, p.before, p.after))
	}
	if p.indent > 0 {
		b.WriteString(fmt.Sprintf(`<w:ind w:left="%d"/>`, p.indent))
	}
	if p.align != "" {
		b.WriteString(`<w:jc w:val="` + p.align + `"/>`)
	}
	b.WriteString("</w:pPr>")
	for _, r := range p.runs {
		b.WriteString(r.xml())
	}
	b.WriteString("</w:p>")
	return b.String()
}

func tp(text string) para { return para{runs: []run{{text: text}}} }

// cell 表格单元格。
type cell struct {
	text   string
	fill   string
	color  string
	bold   bool
	align  string
	span   int
	size   int
	paras  []para // 优先于 text
	vAlign string
}

type trow struct {
	cells  []cell
	header bool // 重复表头
	height int
}

func (c cell) xml(w int) string {
	var b strings.Builder
	b.WriteString("<w:tc><w:tcPr>")
	b.WriteString(fmt.Sprintf(`<w:tcW w:w="%d" w:type="dxa"/>`, w))
	if c.span > 1 {
		b.WriteString(fmt.Sprintf(`<w:gridSpan w:val="%d"/>`, c.span))
	}
	if c.fill != "" {
		b.WriteString(`<w:shd w:val="clear" w:color="auto" w:fill="` + c.fill + `"/>`)
	}
	va := c.vAlign
	if va == "" {
		va = "center"
	}
	b.WriteString(`<w:vAlign w:val="` + va + `"/></w:tcPr>`)
	if len(c.paras) > 0 {
		for _, p := range c.paras {
			b.WriteString(p.xml())
		}
	} else {
		sz := c.size
		if sz == 0 {
			sz = 18
		}
		parts := strings.Split(c.text, "\n")
		var runs []run
		for i, t := range parts {
			runs = append(runs, run{text: t, bold: c.bold, color: c.color, size: sz, br: i > 0})
		}
		b.WriteString(para{style: "TblText", align: c.align, runs: runs}.xml())
	}
	b.WriteString("</w:tc>")
	return b.String()
}

// table 生成表格；widths 为各列宽（twips），总和应等于 contenW。
func table(widths []int, rows []trow) string {
	var b strings.Builder
	total := 0
	for _, w := range widths {
		total += w
	}
	b.WriteString(`<w:tbl><w:tblPr><w:tblW w:w="` + fmt.Sprint(total) + `" w:type="dxa"/><w:jc w:val="center"/>`)
	b.WriteString(`<w:tblBorders>`)
	for _, e := range []string{"top", "left", "bottom", "right", "insideH", "insideV"} {
		b.WriteString(`<w:` + e + ` w:val="single" w:sz="4" w:space="0" w:color="9AA5B5"/>`)
	}
	b.WriteString(`</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>`)
	b.WriteString("<w:tblGrid>")
	for _, w := range widths {
		b.WriteString(fmt.Sprintf(`<w:gridCol w:w="%d"/>`, w))
	}
	b.WriteString("</w:tblGrid>")
	for _, r := range rows {
		b.WriteString("<w:tr><w:trPr><w:cantSplit/>")
		if r.header {
			b.WriteString("<w:tblHeader/>")
		}
		if r.height > 0 {
			b.WriteString(fmt.Sprintf(`<w:trHeight w:val="%d" w:hRule="atLeast"/>`, r.height))
		}
		b.WriteString("</w:trPr>")
		ci := 0
		for _, c := range r.cells {
			span := c.span
			if span < 1 {
				span = 1
			}
			w := 0
			for k := 0; k < span && ci+k < len(widths); k++ {
				w += widths[ci+k]
			}
			b.WriteString(c.xml(w))
			ci += span
		}
		b.WriteString("</w:tr>")
	}
	b.WriteString("</w:tbl>")
	return b.String()
}

// spacer 表格后的小间距段落。
func spacer(after int) string {
	return fmt.Sprintf(`<w:p><w:pPr><w:spacing w:before="0" w:after="%d"/><w:rPr><w:sz w:val="8"/></w:rPr></w:pPr></w:p>`, after)
}

// scale 按总宽 contenW 等比缩放权重为列宽。
func scale(weights ...int) []int {
	sum := 0
	for _, w := range weights {
		sum += w
	}
	out := make([]int, len(weights))
	used := 0
	for i, w := range weights {
		out[i] = contenW * w / sum
		used += out[i]
	}
	out[len(out)-1] += contenW - used
	return out
}

// titledTable 深蓝标题行 + 浅蓝表头 + 斑马纹数据行（与模板报告风格一致）。
func titledTable(title string, cols []string, rows [][]string, weights []int, note string, statusCol int) string {
	if len(weights) != len(cols) {
		weights = make([]int, len(cols))
		for i := range weights {
			weights[i] = 1
		}
	}
	w := scale(weights...)
	tr := []trow{{cells: []cell{{text: title, fill: colNavy, color: "FFFFFF", bold: true, span: len(cols), size: 19}}, header: true}}
	hc := make([]cell, len(cols))
	for i, c := range cols {
		hc[i] = cell{text: c, fill: colHead, bold: true, align: "center"}
	}
	tr = append(tr, trow{cells: hc, header: true})
	for ri, r := range rows {
		cs := make([]cell, len(cols))
		for i := range cols {
			t := ""
			if i < len(r) {
				t = r[i]
			}
			c := cell{text: t}
			if ri%2 == 1 {
				c.fill = colZebra
			}
			if i == statusCol {
				c.bold, c.align = true, "center"
				switch t {
				case "正常":
					c.color = colOK
				case "预警":
					c.color = colWarn
				case "异常", "严重":
					c.color = colBad
				case "未采集":
					c.color = colNA
				}
			}
			cs[i] = c
		}
		tr = append(tr, trow{cells: cs})
	}
	out := table(w, tr)
	if note != "" {
		out += para{style: "Note", runs: []run{{text: note}}}.xml()
	} else {
		out += spacer(60)
	}
	return out
}

func kvTable(title string, kv []KV) string {
	rows := make([][]string, len(kv))
	for i, x := range kv {
		rows[i] = []string{x.K, x.V}
	}
	w := scale(24, 76)
	tr := []trow{{cells: []cell{{text: title, fill: colNavy, color: "FFFFFF", bold: true, span: 2, size: 19}}, header: true}}
	for i, r := range rows {
		c0 := cell{text: r[0], fill: colHead, bold: true}
		c1 := cell{text: r[1]}
		if i%2 == 1 {
			c1.fill = colZebra
		}
		tr = append(tr, trow{cells: []cell{c0, c1}})
	}
	return table(w, tr) + spacer(60)
}
