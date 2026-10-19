import { fixtureQaAssessment } from "./__fixtures__/qa-reviewed-input";
import { describe,expect,it,vi } from "vitest";
import { createQaService } from "./qa-service";
import { qaRequestHash, type QaConversationStore, type QaReservation } from "./qa-conversation-store";
import { QA_INSUFFICIENT_SOURCE_MESSAGE, type QaCompletedTurn } from "./qa-contract";
import type { QaAnswer, QaGenerator, QaPrincipal, QaRetriever, QaEvidence } from "./qa-runtime-contract";
import { AppError } from "../../server/http/app-error";
import { EmbeddingError } from "../rag-processing/embedding-errors";
vi.mock("server-only",()=>({}));
const principal:QaPrincipal={kind:"GUEST",id:"opaque"};
const request={question:"Câu hỏi",context:{type:"GENERAL" as const}};
const answer:QaAnswer={status:"INSUFFICIENT_SOURCE",answerParts:[],citations:[],message:QA_INSUFFICIENT_SOURCE_MESSAGE};
function setup(){
  const reservation:QaReservation={kind:"RESERVED",conversationId:"conv",turnId:"turn",fence:1,history:[]};
  const store:QaConversationStore={reserve:vi.fn(async()=>reservation),complete:vi.fn(async(_p,_r,data)=>data),fail:vi.fn(async()=>{}),history:vi.fn(async()=>[]),delete:vi.fn(async()=>{}),revokeGuest:vi.fn(async()=>{}),cleanup:vi.fn(async()=>({processed:0,hasMore:false,lockAcquired:true,lastSuccessfulSweep:null,eligibleBacklogCount:0,oldestOverdueItem:null,failureCount:0}))};
  const retriever={retrieve:vi.fn<QaRetriever["retrieve"]>(async()=>[]),recheck:vi.fn(async()=>true)};
  const generator={generate:vi.fn<QaGenerator["generate"]>(async()=>answer)};
  const assessor={assess:vi.fn(async (input: import("./qa-runtime-contract").QaGenerationInput)=>fixtureQaAssessment(input))};
  return {store,retriever,generator,assessor,reservation,service:createQaService({store,retriever,generator,assessor})};
}
describe("QA orchestration without external services",()=>{
  it("does not generate or resurrect a turn when the store rejects a deleted/expired conversation", async () => {
    const t = setup();
    vi.mocked(t.store.reserve).mockRejectedValue(new AppError("NOT_FOUND", "unavailable conversation", 404));
    await expect(t.service.ask(principal, "same_key", { conversationId: "expired_fixture", parentTurnId: null, question: "fixture" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(t.retriever.retrieve).not.toHaveBeenCalled(); expect(t.generator.generate).not.toHaveBeenCalled();
    expect(t.store.complete).not.toHaveBeenCalled();
  });
  const citation={id:"c1",sourceId:"public_fixture",title:"Fixture",sourceUrl:null,locators:[]};
  const evidence:QaEvidence={citationId:"c1",documentId:"private_doc",generationId:"generation",contentVersionId:"version",chunkId:"private_chunk",chunkHash:"hash",text:"Fixture claim",tokenCount:2,score:1,citation};
  it("keeps a no-evidence reply completed with its reason and no assessment/generation call", async () => {
    const t = setup();
    const result = await t.service.ask(principal, "missing_key", request);
    expect(result.data).toMatchObject({ status: "INSUFFICIENT_SOURCE", reason: "NO_EVIDENCE", answerParts: [], citations: [] });
    expect(t.assessor.assess).not.toHaveBeenCalled(); expect(t.generator.generate).not.toHaveBeenCalled();
    expect(t.store.complete).toHaveBeenCalledOnce();
  });
  it("records missing support after review without calling generation or changing it into a provider error", async () => {
    const t = setup(); t.retriever.retrieve.mockResolvedValue([evidence]);
    t.assessor.assess.mockImplementation(async input => {
      const assessment = fixtureQaAssessment(input);
      assessment.review.aspects = [{ id: "requested", status: "MISSING", supports: [] }];
      return assessment;
    });
    const result = await t.service.ask(principal, "support_key", request);
    expect(result.data).toMatchObject({ status: "INSUFFICIENT_SOURCE", reason: "MISSING_SUPPORT", answerParts: [], citations: [] });
    expect(t.assessor.assess).toHaveBeenCalledOnce(); expect(t.generator.generate).not.toHaveBeenCalled();
    expect(t.store.complete).toHaveBeenCalledOnce(); expect(t.store.fail).not.toHaveBeenCalled();
  });
  it.each<QaAnswer>([
    {status:"ANSWERED",answerParts:[{text:"Fixture claim",citationIds:["c1"]}],citations:[citation],unansweredAspects:[]},
    {status:"PARTIAL",answerParts:[{text:"Fixture claim",citationIds:["c1"]}],citations:[citation],unansweredAspects:["Chưa đủ nguồn cho phần còn lại."]},
    {status:"CLARIFICATION_REQUIRED",answerParts:[],citations:[],clarificationQuestion:"Bạn muốn hỏi điều gì?"},
  ])("persists $status only after completion acknowledgement",async outcome=>{
    const t=setup();t.retriever.retrieve.mockResolvedValue([evidence]);t.generator.generate.mockResolvedValue(outcome);
    if(outcome.status === "PARTIAL") t.assessor.assess.mockImplementation(async input=>fixtureQaAssessment(input,true));
    const result=await t.service.ask(principal,"key",request);
    expect(result.data.status).toBe(outcome.status);
    expect(t.generator.generate).toHaveBeenCalledWith(expect.objectContaining({
      sourceSufficiency: { status: outcome.status === "PARTIAL" ? "PARTIAL" : "SUFFICIENT", reason: outcome.status === "PARTIAL" ? "PARTIAL_COVERAGE" : "COMPLETE_COVERAGE" },
    }));
    expect(JSON.stringify(result.data)).not.toMatch(/private_doc|private_chunk|tokenCount|chunkHash/);
  });
  it("rejects fabricated current-turn citations",async()=>{
    const t=setup();t.retriever.retrieve.mockResolvedValue([evidence]);
    t.generator.generate.mockResolvedValue({status:"ANSWERED",answerParts:[{text:"Fixture claim",citationIds:["fake"]}],citations:[{...citation,id:"fake"}],unansweredAspects:[]});
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"AI_INVALID_RESPONSE"});expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("reuses validated completed server history solely as interpretation input",async()=>{
    const t=setup();
    const historical={...answer,conversationId:"conv",turnId:"previous",context:{type:"GENERAL" as const},turnState:"COMPLETED" as const} as QaCompletedTurn;
    t.reservation.history.push({question:"Cũ",response:historical});
    const result=await t.service.ask(principal,"key",{...request,question:"Nó ở đâu?"});
    expect(result.data.status).toBe("INSUFFICIENT_SOURCE");
    expect(t.retriever.retrieve).toHaveBeenCalledWith("nó ở đâu",[{...t.reservation.history[0],question:"cũ"}],undefined,{type:"GENERAL"});
    expect(t.generator.generate).not.toHaveBeenCalled();
    expect(t.store.complete).toHaveBeenCalledOnce();
  });
  it("checks current eligibility before invoking generation",async()=>{
    const t=setup();t.retriever.recheck.mockResolvedValue(false);
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"AI_INVALID_RESPONSE"});
    expect(t.generator.generate).not.toHaveBeenCalled();expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("checks eligibility after generation and refuses changed sources",async()=>{
    const t=setup();t.retriever.recheck.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"AI_INVALID_RESPONSE"});
    expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("aborts an in-flight provider when a source becomes disabled and never completes the turn",async()=>{
    const t=setup();t.retriever.retrieve.mockResolvedValue([evidence]);
    t.retriever.recheck.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    let providerSignal:AbortSignal|undefined;
    t.generator.generate.mockImplementation(({signal})=>{
      providerSignal=signal;
      return new Promise<QaAnswer>((_resolve,reject)=>signal?.addEventListener("abort",()=>reject(new AppError("AI_UNAVAILABLE","aborted",503)),{once:true}));
    });
    const service=createQaService({store:t.store,retriever:t.retriever,generator:t.generator,eligibilityPollMs:1,assessor:{assess:async input=>fixtureQaAssessment(input)}});
    await expect(service.ask(principal,"key",request)).rejects.toMatchObject({code:"AI_INVALID_RESPONSE"});
    expect(providerSignal?.aborted).toBe(true);
    expect(t.store.complete).not.toHaveBeenCalled();
    expect(t.store.fail).toHaveBeenCalledOnce();
  });
  it.each(["PROVIDER_TIMEOUT","PROVIDER_UNAVAILABLE","CREDENTIALS_UNAVAILABLE"] as const)("maps embedding %s to a technical provider failure",async code=>{
    const t=setup();t.retriever.retrieve.mockRejectedValue(new EmbeddingError(code,false));
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"AI_UNAVAILABLE",status:503});
    expect(t.generator.generate).not.toHaveBeenCalled();expect(t.store.complete).not.toHaveBeenCalled();
  });
  it("maps invalid provider vector to invalid response and database read to internal error",async()=>{
    const t=setup();t.retriever.retrieve.mockRejectedValue(new EmbeddingError("INVALID_PROVIDER_RESPONSE",false));
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"AI_INVALID_RESPONSE",status:502});
    t.retriever.retrieve.mockRejectedValue(new Error("database unavailable"));
    await expect(t.service.ask(principal,"other",request)).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR",status:500});
  });
  it("uncertain commit yields UNKNOWN and never calls failure overwrite",async()=>{
    const t=setup();vi.mocked(t.store.complete).mockRejectedValue(new Error("lost commit response"));
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"OPERATION_STATUS_UNKNOWN"});
    expect(t.store.fail).not.toHaveBeenCalled();
  });
  it("known failure never returns completed SUCCESS",async()=>{
    const t=setup();vi.mocked(t.store.complete).mockRejectedValue(new AppError("NOT_FOUND","deleted",404));
    await expect(t.service.ask(principal,"key",request)).rejects.toMatchObject({code:"NOT_FOUND"});
  });
  it("canonical hash handles inherited versus explicit GENERAL identically",()=>{
    const follow={conversationId:"conv",parentTurnId:"turn",question:"x"};
    expect(qaRequestHash(follow)).toBe(qaRequestHash({...follow,context:{type:"GENERAL"}}));
    expect(qaRequestHash({...follow,parentTurnId:null})).not.toBe(qaRequestHash(follow));
  });
});
