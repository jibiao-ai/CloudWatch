package inspection

import (
	"archive/zip"
	"bytes"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"strings"
	"time"

	"github.com/jibiao-ai/cloudwatch/internal/analytics"
)

// Brand 报告封面 / 页眉页脚使用的品牌信息（取自「系统配置」）。
type Brand struct {
	Name      string
	Subtitle  string
	Copyright string
	Logo      []byte // PNG / JPEG；SVG 等不受支持的格式留空即可
	LogoMime  string
}

var cnNum = []string{"零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"}

func cn(i int) string {
	if i >= 0 && i < len(cnNum) {
		return cnNum[i]
	}
	return fmt.Sprint(i)
}

func h1(text string, pageBreak bool) string {
	return para{style: "Heading1", pbr: pageBreak, runs: []run{{text: text}}}.xml()
}
func h2(text string) string { return para{style: "Heading2", runs: []run{{text: text}}}.xml() }
func h3(text string) string { return para{style: "Heading3", runs: []run{{text: text}}}.xml() }
func body(text string) string {
	return para{runs: []run{{text: text}}}.xml()
}

func statusRun(s string) run {
	return run{text: StatusText[s], bold: true, color: statusColor(s)}
}

// logoExt 判定 logo 的媒体扩展名与尺寸；不受支持时返回 ok=false。
func logoInfo(b Brand) (ext string, w, h int, ok bool) {
	if len(b.Logo) == 0 {
		return
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b.Logo))
	if err != nil || cfg.Width == 0 || cfg.Height == 0 {
		return
	}
	switch format {
	case "png":
		ext = "png"
	case "jpeg":
		ext = "jpeg"
	default:
		return
	}
	return ext, cfg.Width, cfg.Height, true
}

// fit 把图片按比例缩放到 maxH（EMU 高度）以内。
func fit(w, h int, maxH, maxW int64) (int64, int64) {
	cx, cy := int64(w), int64(h)
	cy2 := maxH
	cx2 := cx * cy2 / cy
	if cx2 > maxW {
		cx2 = maxW
		cy2 = cy * cx2 / cx
	}
	return cx2, cy2
}

func (r *Report) dateText() string { return r.FinishedAt.In(analytics.CST).Format("2006-01-02") }

// BuildDocx 生成 Word（.docx）巡检报告。
func BuildDocx(r *Report, b Brand) ([]byte, error) {
	if b.Name == "" {
		b.Name = "CloudWatch"
	}
	ext, lw, lh, hasLogo := logoInfo(b)
	var bd strings.Builder
	bd.WriteString(cover(r, b, hasLogo, lw, lh))
	bd.WriteString(h1("一、巡检结论总览", true))
	bd.WriteString(overview(r))
	for i, p := range r.Platforms {
		bd.WriteString(platformChapter(i+2, p, len(r.Platforms) > 1))
	}
	bd.WriteString(recordChapter(len(r.Platforms)+2, r))
	sect := fmt.Sprintf(`<w:sectPr><w:headerReference w:type="default" r:id="rIdHd"/><w:footerReference w:type="default" r:id="rIdFt"/><w:pgSz w:w="%d" w:h="16838"/><w:pgMar w:top="1418" w:right="%d" w:bottom="1304" w:left="%d" w:header="567" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr>`, pageW, margin, margin)
	doc := xmlHead + `<w:document ` + nsMain + `><w:body>` + bd.String() + sect + `</w:body></w:document>`

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	put := func(name, content string) error {
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(content))
		return err
	}
	var hcx, hcy int64
	if hasLogo {
		hcx, hcy = fit(lw, lh, 300000, 900000)
	}
	when := r.FinishedAt.UTC().Format(time.RFC3339)
	files := []struct{ n, c string }{
		{"[Content_Types].xml", contentTypes(hasLogo, ext)},
		{"_rels/.rels", rootRels},
		{"word/document.xml", doc},
		{"word/_rels/document.xml.rels", docRels(hasLogo, ext)},
		{"word/styles.xml", stylesXML()},
		{"word/settings.xml", settingsXML},
		{"word/header1.xml", headerXML(b, hasLogo, hcx, hcy)},
		{"word/footer1.xml", footerXML(b)},
		{"docProps/core.xml", coreXML(r.Title, b.Name, when)},
		{"docProps/app.xml", appXML},
	}
	if hasLogo {
		files = append(files, struct{ n, c string }{"word/_rels/header1.xml.rels", headerRels(ext)})
	}
	for _, f := range files {
		if err := put(f.n, f.c); err != nil {
			return nil, err
		}
	}
	if hasLogo {
		w, err := zw.Create("word/media/logo." + ext)
		if err != nil {
			return nil, err
		}
		if _, err := w.Write(b.Logo); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func cover(r *Report, b Brand, hasLogo bool, lw, lh int) string {
	var s strings.Builder
	s.WriteString(spacer(1200))
	if hasLogo {
		cx, cy := fit(lw, lh, 1000000, 2400000)
		s.WriteString(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>` + pic("100", cx, cy, "logo") + `</w:p>`)
	}
	s.WriteString(para{align: "center", after: 60, runs: []run{{text: b.Name, bold: true, color: colNavy, size: 40}}}.xml())
	if b.Subtitle != "" {
		s.WriteString(para{align: "center", after: 600, runs: []run{{text: b.Subtitle, color: colGrey, size: 24}}}.xml())
	} else {
		s.WriteString(spacer(600))
	}
	scope := r.Title
	if len(r.Platforms) == 1 {
		scope = r.Platforms[0].Name
	} else {
		var ns []string
		for _, p := range r.Platforms {
			ns = append(ns, p.Name)
		}
		scope = joinMax(ns, 4)
	}
	// 深蓝色标题带
	w := scale(1)
	band := []trow{{height: 2400, cells: []cell{{fill: colNavy, vAlign: "center", paras: []para{
		{align: "center", before: 240, after: 80, runs: []run{{text: scope, bold: true, color: "FFFFFF", size: 40}}},
		{align: "center", after: 240, runs: []run{{text: "云平台自动巡检报告", bold: true, color: "FFFFFF", size: 52}}},
	}}}}}
	s.WriteString(table(w, band))
	s.WriteString(spacer(500))
	s.WriteString(para{align: "center", after: 120, runs: []run{{text: "健康评分：", size: 28}, {text: fmt.Sprint(r.Score), bold: true, color: statusColor(r.Overall), size: 40}}}.xml())
	s.WriteString(para{align: "center", after: 60, runs: []run{{text: "巡检日期：" + r.dateText(), size: 26}}}.xml())
	trig := "手动发起"
	if r.Trigger == "schedule" {
		trig = "定时巡检"
	}
	s.WriteString(para{align: "center", after: 60, runs: []run{{text: "巡检方式：" + trig + "（只读，未对平台做任何变更）", color: colGrey, size: 21}}}.xml())
	s.WriteString(spacer(1800))
	s.WriteString(para{align: "center", runs: []run{{text: b.Copyright, color: colGrey, size: 21}}}.xml())
	return s.String()
}

func countsRow(c Counts) []string {
	return []string{fmt.Sprint(c.OK), fmt.Sprint(c.Warn), fmt.Sprint(c.Bad), fmt.Sprint(c.NA)}
}

func overview(r *Report) string {
	var s strings.Builder
	s.WriteString(para{after: 120, runs: []run{{text: r.Summary}}}.xml())
	tr := []trow{
		{cells: []cell{{text: "巡检结果统计", fill: colNavy, color: "FFFFFF", bold: true, span: 5, size: 19}}, header: true},
		{cells: []cell{{text: "健康评分", fill: colHead, bold: true, align: "center"}, {text: "正常", fill: colHead, bold: true, align: "center"}, {text: "预警", fill: colHead, bold: true, align: "center"}, {text: "异常", fill: colHead, bold: true, align: "center"}, {text: "未采集", fill: colHead, bold: true, align: "center"}}},
	}
	cs := countsRow(r.Counts)
	tr = append(tr, trow{height: 460, cells: []cell{
		{text: fmt.Sprint(r.Score), bold: true, color: statusColor(r.Overall), align: "center", size: 24},
		{text: cs[0], bold: true, color: colOK, align: "center", size: 24},
		{text: cs[1], bold: true, color: colWarn, align: "center", size: 24},
		{text: cs[2], bold: true, color: colBad, align: "center", size: 24},
		{text: cs[3], bold: true, color: colNA, align: "center", size: 24},
	}})
	s.WriteString(table(scale(1, 1, 1, 1, 1), tr))
	s.WriteString(spacer(120))
	if len(r.Platforms) > 1 {
		var rows [][]string
		for _, p := range r.Platforms {
			rows = append(rows, []string{p.Name, firstNonEmpty(envText[p.EnvType], p.EnvType), fmt.Sprint(p.Score), fmt.Sprint(p.Counts.OK), fmt.Sprint(p.Counts.Warn), fmt.Sprint(p.Counts.Bad)})
		}
		s.WriteString(titledTable("各云平台巡检结果", []string{"云平台", "环境", "健康评分", "正常", "预警", "异常"}, rows, []int{32, 14, 18, 12, 12, 12}, "", 2))
	}
	// 需关注事项
	var focus [][]string
	for _, p := range r.Platforms {
		for _, it := range p.Items {
			if it.Status == Bad || it.Status == Warn {
				focus = append(focus, []string{p.Name, it.Group + " / " + it.Name, StatusText[it.Status], it.Value})
			}
		}
	}
	if len(focus) > 0 {
		s.WriteString(titledTable("需要关注的事项", []string{"云平台", "巡检项", "结果", "关键数据"}, focus, []int{20, 26, 9, 45}, "", 2))
	} else {
		s.WriteString(para{runs: []run{{text: "本次巡检未发现异常或预警项。", bold: true, color: colOK}}}.xml())
	}
	return s.String()
}

var groupOrder = Groups

func platformChapter(no int, p PlatformReport, multi bool) string {
	var s strings.Builder
	title := fmt.Sprintf("%s、巡检详情", cn(no))
	if multi {
		title = fmt.Sprintf("%s、%s 巡检详情", cn(no), p.Name)
	}
	s.WriteString(h1(title, true))
	s.WriteString(h2("1. 平台环境信息"))
	s.WriteString(kvTable("环境信息", p.Env))
	for _, n := range p.Notes {
		s.WriteString(para{style: "Note", runs: []run{{text: "提示：" + n}}}.xml())
	}
	s.WriteString(h2("2. 巡检结果总览"))
	rows := make([][]string, 0, len(p.Items))
	for _, it := range p.Items {
		rows = append(rows, []string{it.Group, it.Name, StatusText[it.Status], it.Value})
	}
	s.WriteString(titledTable(fmt.Sprintf("巡检结果总览（评分 %d，正常 %d / 预警 %d / 异常 %d / 未采集 %d）", p.Score, p.Counts.OK, p.Counts.Warn, p.Counts.Bad, p.Counts.NA),
		[]string{"分类", "巡检项", "结果", "关键数据"}, rows, []int{13, 24, 9, 54}, "", 2))
	sec := 3
	for _, g := range groupOrder {
		var its []Item
		for _, it := range p.Items {
			if it.Group == g {
				its = append(its, it)
			}
		}
		if len(its) == 0 {
			continue
		}
		s.WriteString(h2(fmt.Sprintf("%d. %s", sec, g)))
		sec++
		for _, it := range its {
			s.WriteString(itemBlock(it))
		}
	}
	s.WriteString(h2(fmt.Sprintf("%d. 巡检结论与建议", sec)))
	s.WriteString(para{after: 100, runs: []run{{text: p.Summary}}}.xml())
	for i, a := range p.Advices {
		s.WriteString(para{style: "Advice", runs: []run{{text: fmt.Sprintf("%d. ", i+1), bold: true, color: colNavy}, {text: a}}}.xml())
	}
	return s.String()
}

func itemBlock(it Item) string {
	var s strings.Builder
	s.WriteString(para{style: "Heading3", runs: []run{{text: it.Name + "　"}, statusRun(it.Status)}}.xml())
	w := scale(14, 86)
	kv := func(k, v string, color string, bold bool) trow {
		return trow{cells: []cell{{text: k, fill: colHead, bold: true}, {text: v, color: color, bold: bold}}}
	}
	rows := []trow{kv("关键数据", dash(it.Value), "", true)}
	if it.Detail != "" {
		rows = append(rows, kv("检查说明", it.Detail, "", false))
	}
	if it.Standard != "" {
		rows = append(rows, kv("判定标准", it.Standard, colGrey, false))
	}
	if it.Advice != "" && (it.Status == Bad || it.Status == Warn) {
		rows = append(rows, kv("处理建议", it.Advice, statusColor(it.Status), false))
	}
	s.WriteString(table(w, rows))
	s.WriteString(spacer(80))
	for _, t := range it.Tables {
		note := t.Note
		if t.More > 0 {
			note = strings.TrimSpace(fmt.Sprintf("%s 另有 %d 条未列出，完整数据请在系统中查看。", note, t.More))
		}
		sc := -1
		for i, c := range t.Cols {
			if c == "判定" || c == "状态" && len(t.Rows) > 0 && isStatusWord(t.Rows[0], i) {
				sc = i
			}
		}
		s.WriteString(titledTable(t.Title, t.Cols, t.Rows, colWeights(t), note, sc))
	}
	return s.String()
}

func isStatusWord(r []string, i int) bool {
	if i >= len(r) {
		return false
	}
	switch r[i] {
	case "正常", "预警", "异常", "未采集":
		return true
	}
	return false
}

// colWeights 按列内容长度估算列宽权重。
func colWeights(t Table) []int {
	n := len(t.Cols)
	w := make([]int, n)
	for i, c := range t.Cols {
		w[i] = runeLen(c) + 2
	}
	for _, r := range t.Rows {
		for i := 0; i < n && i < len(r); i++ {
			if l := runeLen(r[i]) + 2; l > w[i] {
				w[i] = l
			}
		}
	}
	for i := range w {
		if w[i] < 6 {
			w[i] = 6
		}
		if w[i] > 36 {
			w[i] = 36
		}
	}
	return w
}

func runeLen(s string) int {
	n := 0
	for _, r := range s {
		if r > 0x2E80 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

func recordChapter(no int, r *Report) string {
	var s strings.Builder
	s.WriteString(h1(fmt.Sprintf("%s、巡检记录", cn(no)), false))
	trig := "手动发起"
	if r.Trigger == "schedule" {
		trig = "定时巡检"
	}
	refreshed := "否（使用最近一次已采集的数据）"
	if r.Refreshed {
		refreshed = "是（巡检前已实时调用平台接口采集）"
	}
	op := firstNonEmpty(r.OperatorNm, r.Operator, "—")
	kv := []KV{
		{"巡检任务编号", firstNonEmpty(r.TaskID, "—")},
		{"触发方式", trig},
		{"发起人", op},
		{"开始时间", cst(r.StartedAt)},
		{"完成时间", cst(r.FinishedAt)},
		{"耗时", fmt.Sprintf("%.1f 秒", r.FinishedAt.Sub(r.StartedAt).Seconds())},
		{"实时刷新数据", refreshed},
		{"巡检范围", fmt.Sprintf("%d 个云平台、%d 个检查项", len(r.Platforms), itemCount(r))},
	}
	s.WriteString(kvTable("本次巡检记录", kv))
	t := r.Config.Thresholds
	rows := [][]string{
		{"固态盘已用寿命", fmt.Sprintf("%g%%", t.SSDLifeWarn), fmt.Sprintf("%g%%", t.SSDLifeBad)},
		{"物理磁盘使用率", fmt.Sprintf("%g%%", t.DiskUsageWarn), fmt.Sprintf("%g%%", t.DiskUsageBad)},
		{"存储集群容量使用率", fmt.Sprintf("%g%%", t.StorageWarn), fmt.Sprintf("%g%%", t.StorageBad)},
		{"容量预计写满天数（≤）", fmt.Sprintf("%g 天", t.RunwayWarn), fmt.Sprintf("%g 天", t.RunwayBad)},
		{"存储池使用率", fmt.Sprintf("%g%%", t.PoolWarn), fmt.Sprintf("%g%%", t.PoolBad)},
		{"云平台 vCPU 使用率", fmt.Sprintf("%g%%", t.VCPUWarn), fmt.Sprintf("%g%%", t.VCPUBad)},
		{"云平台内存使用率", fmt.Sprintf("%g%%", t.MemWarn), fmt.Sprintf("%g%%", t.MemBad)},
		{"节点 CPU 使用率", fmt.Sprintf("%g%%", t.NodeCPUWarn), fmt.Sprintf("%g%%", t.NodeCPUBad)},
		{"节点内存使用率", fmt.Sprintf("%g%%", t.NodeMemWarn), fmt.Sprintf("%g%%", t.NodeMemBad)},
		{"节点磁盘 I/O 使用率", fmt.Sprintf("%g%%", t.DiskIOWarn), fmt.Sprintf("%g%%", t.DiskIOBad)},
		{"节点磁盘 I/O 延迟", fmt.Sprintf("%g ms", t.LatencyWarn), fmt.Sprintf("%g ms", t.LatencyBad)},
		{"云主机 CPU / 内存偏高", fmt.Sprintf("CPU ≥ %g%%", t.VMCPUHigh), fmt.Sprintf("内存 ≥ %g%%", t.VMMemHigh)},
	}
	s.WriteString(titledTable("本次巡检采用的判定阈值", []string{"指标", "预警阈值", "异常阈值"}, rows, []int{44, 28, 28},
		"阈值可在「自动巡检 → 巡检设置」中调整；云主机 CPU / 内存偏高按「当前值或近 30 天平均值 ≥ 阈值」判定，不区分预警 / 异常。", -1))
	s.WriteString(para{style: "Note", before: 200, runs: []run{{text: "本报告由系统自动生成，数据来源于云平台监控接口与资源接口，巡检过程为只读采集，不会对云平台做任何变更。"}}}.xml())
	return s.String()
}

func itemCount(r *Report) int {
	n := 0
	for _, p := range r.Platforms {
		n += len(p.Items)
	}
	return n
}
