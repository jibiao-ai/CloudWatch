package inspection

import (
	"fmt"
	"strings"
)

const xmlHead = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n"
const nsMain = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`

func contentTypes(hasLogo bool, ext string) string {
	img := ""
	if hasLogo {
		ct := "image/png"
		if ext == "jpeg" {
			ct = "image/jpeg"
		}
		img = fmt.Sprintf(`<Default Extension="%s" ContentType="%s"/>`, ext, ct)
	}
	return xmlHead + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` + img +
		`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
		`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
		`<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
		`<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
		`<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
		`<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
		`<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
}

const rootRels = xmlHead + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`

func docRels(hasLogo bool, ext string) string {
	img := ""
	if hasLogo {
		img = `<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.` + ext + `"/>`
	}
	return xmlHead + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHd" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>` + img + `</Relationships>`
}

func headerRels(ext string) string {
	return xmlHead + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.` + ext + `"/></Relationships>`
}

const settingsXML = xmlHead + `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="420"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`

func coreXML(title, creator, when string) string {
	return xmlHead + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>` + esc(title) + `</dc:title><dc:creator>` + esc(creator) + `</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">` + when + `</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">` + when + `</dcterms:modified></cp:coreProperties>`
}

const appXML = xmlHead + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CloudWatch</Application></Properties>`

func stylesXML() string {
	const font = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑" w:cs="Calibri"/>`
	hd := func(id, name string, lvl, sz int, color string, before, after int) string {
		return fmt.Sprintf(`<w:style w:type="paragraph" w:styleId="%s"><w:name w:val="%s"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="%d" w:after="%d"/><w:outlineLvl w:val="%d"/></w:pPr><w:rPr>%s<w:b/><w:bCs/><w:color w:val="%s"/><w:sz w:val="%d"/><w:szCs w:val="%d"/></w:rPr></w:style>`,
			id, name, before, after, lvl, font, color, sz, sz)
	}
	var b strings.Builder
	b.WriteString(xmlHead + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>` + font + `<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`)
	b.WriteString(`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`)
	b.WriteString(hd("Heading1", "heading 1", 0, 32, colBlue, 360, 160))
	b.WriteString(hd("Heading2", "heading 2", 1, 26, colBlue, 260, 120))
	b.WriteString(hd("Heading3", "heading 3", 2, 23, "2F5F9E", 200, 100))
	b.WriteString(`<w:style w:type="paragraph" w:customStyle="1" w:styleId="TblText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>`)
	b.WriteString(`<w:style w:type="paragraph" w:customStyle="1" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="140"/></w:pPr><w:rPr><w:color w:val="` + colGrey + `"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>`)
	b.WriteString(`<w:style w:type="paragraph" w:customStyle="1" w:styleId="Advice"><w:name w:val="Advice"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="80"/><w:ind w:left="420" w:hanging="420"/></w:pPr></w:style>`)
	b.WriteString(`</w:styles>`)
	return b.String()
}

// pic 内嵌图片（emu 单位）。
func pic(id string, cx, cy int64, name string) string {
	return fmt.Sprintf(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="%d" cy="%d"/><wp:docPr id="%s" name="%s"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="%s"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
		cx, cy, id, name, name, cx, cy)
}

func fld(instr string) string {
	return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ` + instr + ` </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`
}

func headerXML(b Brand, hasLogo bool, lw, lh int64) string {
	var inner strings.Builder
	if hasLogo {
		inner.WriteString(pic("101", lw, lh, "logo"))
		inner.WriteString(`<w:r><w:t xml:space="preserve">  </w:t></w:r>`)
	}
	inner.WriteString(run{text: b.Name, bold: true, color: colNavy, size: 20}.xml())
	if b.Subtitle != "" {
		inner.WriteString(run{text: "  |  " + b.Subtitle, color: colGrey, size: 17}.xml())
	}
	inner.WriteString(`<w:r><w:tab/></w:r>` + run{text: "云平台自动化巡检报告", color: colGrey, size: 17}.xml())
	return xmlHead + `<w:hdr ` + nsMain + `><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="` + colNavy + `"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="` + fmt.Sprint(contenW) + `"/></w:tabs><w:spacing w:after="0"/></w:pPr>` + inner.String() + `</w:p></w:hdr>`
}

func footerXML(b Brand) string {
	return xmlHead + `<w:ftr ` + nsMain + `><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="9AA5B5"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="` + fmt.Sprint(contenW) + `"/></w:tabs><w:spacing w:after="0"/></w:pPr>` +
		run{text: b.Copyright, color: colGrey, size: 17}.xml() + `<w:r><w:tab/></w:r>` + run{text: "第 ", color: colGrey, size: 17}.xml() + fld("PAGE") + run{text: " 页 / 共 ", color: colGrey, size: 17}.xml() + fld("NUMPAGES") + run{text: " 页", color: colGrey, size: 17}.xml() + `</w:p></w:ftr>`
}
