// Invented content for regression only; never an authoritative travel source.
import { strToU8 } from "fflate";
import { p, syntheticDocx } from "./synthetic-documents";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
export function researchDocx(title: string) {
  return syntheticDocx("", "", {
      "word/document.xml": strToU8(`<w:document xmlns:w="${W}" xmlns:r="${R.slice(0,-1)}"><w:body>${p(title, '<w:outlineLvl w:val="0"/>')}${p("Dữ liệu kiểm thử tiếng Việt. ".repeat(100))}<w:tbl><w:tr><w:tc>${p("[S01] Tài liệu thử nghiệm")}</w:tc><w:tc><w:p><w:r><w:t>URL: </w:t></w:r><w:hyperlink r:id="link"><w:r><w:t>Nguồn</w:t></w:r></w:hyperlink></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`),
      "word/header1.xml": strToU8(`<w:hdr xmlns:w="${W}">${p("Đầu tài liệu")}</w:hdr>`),
      "word/footer1.xml": strToU8(`<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>Cuối tài liệu </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`),
      "word/_rels/document.xml.rels": strToU8(`<Relationships><Relationship Id="h" Type="${R}header" Target="header1.xml"/><Relationship Id="f" Type="${R}footer" Target="footer1.xml"/><Relationship Id="link" Type="${R}hyperlink" Target="https://example.org/source?x=1&amp;y=2" TargetMode="External"/></Relationships>`),
    });
}
