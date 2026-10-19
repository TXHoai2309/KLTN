import { describe, expect, it } from "vitest";
import { editorialBlockSchema, type EditorialLayoutV1 } from "./editorial-contract";
import { autoLayout, resolveEditorial, validateLayoutReferences, chooseFamily } from "./editorial-engine";
import { prepareEditorialContent, nearDuplicateEditorialText, isShortEditorialHeading, editorialTitlePhrases } from "./editorial-content";
import { editorialImageWarnings } from "./editorial-image-quality";
import { editorialQualityFixture, legacyDuplicateFixture } from "./__fixtures__/editorial-quality-fixtures";
import { validateAiProposal } from "./editorial-ai";

const context = () => editorialQualityFixture("Cao nguyên đá Đồng Văn", "công viên địa chất", 3);
const proposal = (layout: EditorialLayoutV1) => ({ family: layout.family, variant: layout.variant, blocks: layout.blocks.map(b => ({ id:b.id,title:b.title,mediaIds:b.mediaIds,placement:b.placement })) });
describe("V3.5 editorial content projection", () => {
  it("keeps canonical data/draft immutable while eliminating the exact heading/body/lead duplication reported by the owner", () => {
    const c = context(), layout = legacyDuplicateFixture(c), before = structuredClone({ c, layout });
    const model = prepareEditorialContent(layout, c.description);
    expect(model.canonicalSource).toBe(c.description);
    expect(model.issues.map(i=>i.code)).toEqual(expect.arrayContaining(["DUPLICATE_HEADING", "DUPLICATE_PARAGRAPH"]));
    const duplicate = layout.blocks.find(b=>b.type==="INTRO")!.text;
    expect(model.layout.blocks.filter(b=>b.text===duplicate)).toHaveLength(1);
    expect(model.sections.every(s=>s.heading!==duplicate)).toBe(true);
    expect({ c, layout }).toEqual(before);
  });
  it("recognizes punctuation/case/Unicode-normalization duplicates across blocks", () => {
    const c=context(), layout=autoLayout(c), intro=layout.blocks.find(b=>b.type==="INTRO")!;
    const copy=editorialBlockSchema.parse({id:"copy",type:"TEXT_SECTION",text:intro.text.normalize("NFD").toLocaleUpperCase("vi")});
    expect(prepareEditorialContent({...layout,blocks:[...layout.blocks,copy]}).layout.blocks.at(-1)!.text).toBe("");
  });
  it("detects near duplication without deleting conflicting dates or qualifiers", () => {
    const c=context(), layout=autoLayout(c), a="Đây là đoạn văn kiểm thử với các từ ngữ được giữ giống nhau để đối chiếu nội dung vào năm 2020.", b=a.replace("2020","2021");
    expect(nearDuplicateEditorialText(a,b)).toBe(true);
    const extra=[a,b].map((text,i)=>editorialBlockSchema.parse({id:`near-${i}`,type:"TEXT_SECTION",text}));
    const model=prepareEditorialContent({...layout,blocks:[...layout.blocks,...extra]});
    expect(model.issues.some(i=>i.code==="NEAR_DUPLICATE")).toBe(true);
    expect(model.layout.blocks.slice(-2).map(b=>b.text)).toEqual([a,b]);
  });
  it("does not promote a long paragraph to a heading or lose body facts", () => {
    const c=context(), layout=autoLayout(c), story=layout.blocks.find(b=>b.type==="TEXT_SECTION"||b.type==="IMAGE_TEXT_SPLIT")!;
    story.title=story.text;
    const projection=prepareEditorialContent(layout);
    expect(projection.layout.blocks.find(b=>b.id===story.id)!.title).toBe("");
    expect(projection.layout.blocks.find(b=>b.id===story.id)!.text).toBe(story.text);
    expect(isShortEditorialHeading("Một vùng đất của")).toBe(false);
  });
  it("separates explicitly sourced heading lines from section bodies and validates their provenance", () => {
    const c=context(), layout=autoLayout(c), story=layout.blocks.find(b=>b.title==="Đường nét trong cảnh quan")!;
    expect(story.text).not.toContain(story.title);expect(story.headingProvenance).toEqual({blockId:story.id,excerpt:story.title});
    expect(()=>validateLayoutReferences(layout,c,false)).not.toThrow();
    story.headingProvenance!.blockId="foreign";expect(()=>validateLayoutReferences(layout,c,false)).toThrow();
  });
  it("keeps long legacy Hero copy in the body role rather than losing it to a short deck", () => {
    const c=context(), layout=autoLayout(c);layout.blocks[0]!.text="Một thuyết minh có nguồn. ".repeat(20);
    const model=prepareEditorialContent(layout,c.description);expect(model.heroDeck).toBe("");expect(model.layout.blocks[0]!.text).toBe(layout.blocks[0]!.text.trim());
  });
  it.each([0,1,2,3,5,8])("%i photos are used once; logical story arc retains the canonical prose", count => {
    const c=editorialQualityFixture("Điểm đến kiểm thử","thiên nhiên",count), layout=autoLayout(c), resolved=resolveEditorial(layout,c)!;
    expect(resolved.media).toHaveLength(count);expect(new Set(layout.blocks.flatMap(b=>b.mediaIds)).size).toBe(count);
    expect(layout.blocks[0]!.type).toBe("HERO");expect(layout.blocks[1]!.type).toBe("INTRO");
    const lastStory=Math.max(...layout.blocks.map((b,i)=>["TEXT_SECTION","IMAGE_TEXT_SPLIT","FULL_WIDTH_IMAGE","IMAGE_GRID","IMAGE_GALLERY"].includes(b.type)?i:0));
    expect(layout.blocks.findIndex(b=>b.type==="MAP")).toBeGreaterThan(lastStory);
    const copy=layout.blocks.map(b=>`${b.title}\n${b.text}`).join("\n");
    for(const p of c.description.split(/\n\s*\n/))expect(copy).toContain(p);
    if(count>=5)expect(layout.blocks.find(b=>b.type==="IMAGE_GRID")!.mediaIds.length).toBeGreaterThanOrEqual(3);
  });
  it("selects Nature for a geological-park category without hardcoding any destination name",()=>expect(chooseFamily("công viên địa chất")).toBe("NATURE_SHOWCASE"));
  it("prefers an adequate landscape over a small cover and propagates safe intrinsic dimensions only", () => {
    const c=context();const r=JSON.parse(c.media[0]!.storageReference!);c.media[0]!.storageReference=JSON.stringify({...r,width:400,height:300});
    const layout=autoLayout(c), result=resolveEditorial(layout,c)!;
    expect(layout.blocks[0]!.mediaIds[0]).not.toBe(c.media[0]!.id);expect(result.media.find(m=>m.id===c.media[0]!.id)!.width).toBe(400);
    expect(JSON.stringify(result)).not.toContain("assetId");expect(editorialImageWarnings(c.media).some(w=>w.width===400)).toBe(true);
  });
  it("rejects whole-body or unsourced AI headings but records an extractive heading's block provenance", () => {
    const c=context(), layout=autoLayout(c), story=layout.blocks.find(b=>b.type==="IMAGE_TEXT_SPLIT")!, p=proposal(layout), item=p.blocks.find(b=>b.id===story.id)!;
    item.title=story.text;expect(()=>validateAiProposal(JSON.stringify(p),layout,c)).toThrow();
    item.title="Danh hiệu không có trong hồ sơ";expect(()=>validateAiProposal(JSON.stringify(p),layout,c)).toThrow();
    item.title="nhịp nhìn cho phần giới thiệu";const accepted=validateAiProposal(JSON.stringify(p),layout,c);
    expect(accepted.blocks.find(b=>b.id===story.id)!.headingProvenance).toEqual({blockId:story.id,excerpt:item.title});
  });
  it("permits bounded composition/emphasis and hiding only an empty block", () => {
    const c=context(), layout=autoLayout(c);layout.blocks.push(editorialBlockSchema.parse({id:"empty",type:"TEXT_SECTION"}));
    const p=proposal(layout), empty=p.blocks.find(b=>b.id==="empty")!;
    Object.assign(empty,{hidden:true,composition:"TEXT",emphasis:"STANDARD"});
    expect(validateAiProposal(JSON.stringify(p),layout,c).blocks.find(b=>b.id==="empty")!.hidden).toBe(true);
    Object.assign(p.blocks[1]!,{hidden:true});expect(()=>validateAiProposal(JSON.stringify(p),layout,c)).toThrow();
  });
  it("requires a short sourced deck and never turns the lead/title into duplicated deck copy", () => {
    const c=context(), layout=autoLayout(c), p=proposal(layout);
    Object.assign(p.blocks[0]!,{deck:"An invented award",emphasis:"STANDARD"});expect(()=>validateAiProposal(JSON.stringify(p),layout,c)).toThrow();
    Object.assign(p.blocks[0]!,{deck:c.category});expect(validateAiProposal(JSON.stringify(p),layout,c).blocks[0]!.deck).toBe(c.category);
    Object.assign(p.blocks[0]!,{deck:p.blocks[0]!.title});expect(()=>validateAiProposal(JSON.stringify(p),layout,c)).toThrow();
  });
  it.each(["Cao nguyên đá Đồng Văn", "Nho Quế", "Căng Bắc Mê", "Lô Lô Chải"])("groups %s into multiword phrases without arbitrary inserted hyphens", title => {
    const phrases=editorialTitlePhrases(title);expect(phrases.join(" ")).toBe(title);expect(phrases.every(p=>p.split(" ").length>=2)).toBe(true);
  });
});
