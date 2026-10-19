import { assertQaAnswerGrounding } from "./qa-answer-grounding";
import { AppError } from "../../server/http/app-error";
import { qaCompletedTurnSchema, qaIdempotencyKeySchema, qaRequestSchema, type QaRequest } from "./qa-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { QaGenerator, QaPrincipal, QaRetriever, QaGenerationInput } from "./qa-runtime-contract";
import { isQaPublicAnswerSafe } from "./qa-public-safety";
import { EmbeddingError } from "../rag-processing/embedding-errors";
import { qaOrigin, qaReportFailure, qaStage } from "./qa-diagnostics";
import type { QaContext } from "./qa-contract";
import type { QaResolvedContext } from "./qa-destination-context";
import { createQaAssessor, type QaAssessor } from "./qa-assessment";
import { assertQaEvidenceInput, insufficientQaAnswer } from "./qa-generation";
import { QA_CLARIFICATION_QUESTION } from "./qa-prompt";
import { evaluateQaSourceSufficiency } from "./qa-source-sufficiency";
import { qaFactualQuestion, qaIntentHistory, qaFollowupClarification } from "./qa-question-understanding";
import { qaConversationMessage } from "./qa-conversation";
import { planQaQuestion } from "./qa-question-plan";
import { withinQaResponseBudget, QA_ELIGIBILITY_ABORT } from "./qa-request-budget";

export function createQaService(dependencies: { store: QaConversationStore; retriever: QaRetriever; generator: QaGenerator; assessor?: QaAssessor; eligibilityPollMs?: number; resolveContext?: (context: QaContext) => Promise<QaResolvedContext> }) {
  const { store, retriever, generator } = dependencies;
  const assessor = dependencies.assessor ?? createQaAssessor();
  const eligibilityPollMs=dependencies.eligibilityPollMs ?? 1000;
  if(!Number.isInteger(eligibilityPollMs)||eligibilityPollMs<1||eligibilityPollMs>5000) throw new Error("Invalid QA eligibility polling interval");
  return {
    async ask(principal: QaPrincipal, key: string, input: QaRequest, signal?: AbortSignal) {
      const request = qaRequestSchema.safeParse(input);
      const parsedKey = qaIdempotencyKeySchema.safeParse(key);
      if (!request.success) throw new AppError("INVALID_REQUEST", "INVALID_REQUEST", 400);
      if (!parsedKey.success) throw new AppError("IDEMPOTENCY_KEY_INVALID", "IDEMPOTENCY_KEY_INVALID", 400);
      let admission;
      qaStage("IDEMPOTENCY_ADMISSION");
      try { admission = await store.reserve(principal, parsedKey.data, request.data); }
      catch (e) {
        if (e instanceof AppError) throw qaOrigin(e, "IDEMPOTENCY_ADMISSION", "ADMISSION");
        // Admission itself may have committed despite a lost DB response. Same-key
        // reconciliation is required; do not manufacture a second first conversation.
        throw new AppError("OPERATION_STATUS_UNKNOWN", "OPERATION_STATUS_UNKNOWN", 503);
      }
      qaStage("IDEMPOTENCY_ADMITTED");
      if (admission.kind === "REPLAY") return { data: admission.data, replayed: true };
      let data;
      let evidence;
      try {
        const context = admission.context ?? { type: "GENERAL" };
        if (request.data.context?.type === "DESTINATION" && !admission.context) throw new AppError("CONTEXT_UNAVAILABLE", "CONTEXT_UNAVAILABLE", 404);
        const resolvedContext = dependencies.resolveContext ? await dependencies.resolveContext(context) : context.type === "GENERAL" ? context : undefined;
        if (!resolvedContext) throw new AppError("CONTEXT_UNAVAILABLE", "CONTEXT_UNAVAILABLE", 404);
        const socialMessage = qaConversationMessage(request.data.question);
        const question = qaFactualQuestion(request.data.question) || request.data.question;
        const history = qaIntentHistory(request.data.question, admission.history);
        const clarificationQuestion = socialMessage ? undefined : qaFollowupClarification(question, history, resolvedContext);
        const skipEvidence = !!socialMessage || !!clarificationQuestion;
        qaStage("RETRIEVAL_STARTED");
        evidence = skipEvidence ? [] : await retriever.retrieve(question, history, signal, resolvedContext);
        qaStage("RETRIEVAL_COMPLETED", { retrievedChunks: evidence.length });
        qaStage("EVIDENCE_ELIGIBILITY_CHECK");
        if (!skipEvidence && !await retriever.recheck(evidence)) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "EVIDENCE_ELIGIBILITY_CHECK", "ELIGIBILITY");
        qaStage("EVIDENCE_ELIGIBILITY_CHECKED", { eligibleChunks: evidence.length });
        const providerController=new AbortController();
        const relayAbort=()=>providerController.abort(signal?.reason);
        signal?.addEventListener("abort",relayAbort,{once:true});
        if(signal?.aborted) providerController.abort(signal.reason);
        let stopped=false;
        let timer:ReturnType<typeof setTimeout>|undefined;
        let wakeWatcher:(()=>void)|undefined;
        let invalidationError:AppError|undefined;
        let rejectInvalidation!:(failure:AppError)=>void;
        const invalidation=new Promise<never>((_,reject)=>{rejectInvalidation=reject;});
        const invalidate=(failure:AppError)=>{
          if(invalidationError)return;
          invalidationError=failure;
          rejectInvalidation(failure);
          providerController.abort(QA_ELIGIBILITY_ABORT);
        };
        const watcher=(async()=>{
          while(evidence.length>0&&!stopped){
            await new Promise<void>(resolve=>{wakeWatcher=resolve;timer=setTimeout(resolve,eligibilityPollMs);});
            timer=undefined;
            wakeWatcher=undefined;
            if(stopped)return;
            try {
              const current = await retriever.recheck(evidence);
              if(stopped)return;
              if(!current) { invalidate(qaOrigin(new AppError("AI_INVALID_RESPONSE","AI_INVALID_RESPONSE",502), "EVIDENCE_ELIGIBILITY_CHECK", "ELIGIBILITY")); return; }
            } catch {
              if(stopped)return;
              invalidate(qaOrigin(new AppError("AI_UNAVAILABLE","AI_UNAVAILABLE",503), "EVIDENCE_ELIGIBILITY_CHECK", "ELIGIBILITY"));
              return;
            }
          }
        })();
        qaStage("GENERATION_STARTED");
        let reviewedInput: QaGenerationInput | undefined;
        const generation = (async () => {
          if (socialMessage) return { status: "CONVERSATIONAL" as const, answerParts: [] as [], citations: [] as [], message: socialMessage };
          if (clarificationQuestion) return { status: "CLARIFICATION_REQUIRED" as const, answerParts: [] as [], citations: [] as [], clarificationQuestion };
          const input = { question, history, evidence, context: resolvedContext, signal: providerController.signal, questionPlan: planQaQuestion(question, history, resolvedContext) };
          if (!evidence.length) return insufficientQaAnswer("NO_EVIDENCE");
          assertQaEvidenceInput(input);
          const preliminary = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input });
          if (preliminary.status === "INSUFFICIENT") return insufficientQaAnswer("MISSING_SUPPORT");
          const assessment = await assessor.assess(input);
          if (!await retriever.recheck(evidence)) throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
          if (assessment.intent === "AMBIGUOUS") return input.questionPlan ? insufficientQaAnswer("MISSING_SUPPORT") : { status: "CLARIFICATION_REQUIRED" as const, answerParts: [] as [], citations: [] as [], clarificationQuestion: QA_CLARIFICATION_QUESTION };
          const sourceSufficiency = evaluateQaSourceSufficiency({ kind: "COMPLETED", eligibility: "CURRENT", input, review: assessment.review });
          if (!assessment.review.exhaustive) return insufficientQaAnswer();
          if (sourceSufficiency.reason === "INVALID_REVIEW" || sourceSufficiency.reason === "UNASSESSED") throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
          if (sourceSufficiency.status === "INSUFFICIENT" || sourceSufficiency.status === "UNCERTAIN") return insufficientQaAnswer("MISSING_SUPPORT");
          reviewedInput = { ...input, sourceSufficiency, sourceReview: assessment.review };
          const answer = await generator.generate(reviewedInput);
          if (answer.status === "CLARIFICATION_REQUIRED" && input.questionPlan) return insufficientQaAnswer("MISSING_SUPPORT");
          // Only the server-owned social router can emit this outcome.
          if (answer.status === "CONVERSATIONAL") throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
          return answer;
        })().then(value=>{if(invalidationError)throw invalidationError;return value;},failure=>{if(invalidationError)throw invalidationError;throw failure;});
        let answer;
        try { answer=await Promise.race([generation,invalidation]); }
        finally {
          stopped=true;
          if(timer)clearTimeout(timer);
          wakeWatcher?.();
          signal?.removeEventListener("abort",relayAbort);
          // A bounded read already in flight may finish independently. It must
          // not delay the final mandatory recheck/commit or invalidate a later
          // stage after the watcher has stopped. All watcher failures are caught.
          void watcher;
        }
        qaStage("GENERATION_COMPLETED");
        if (reviewedInput) assertQaAnswerGrounding(answer, reviewedInput);
        if (!isQaPublicAnswerSafe(answer, evidence)) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "PUBLIC_SAFETY", "PRIVATE_MATERIAL");
        const parsed = qaCompletedTurnSchema.safeParse({ ...answer, conversationId: admission.conversationId, turnId: admission.turnId, turnState: "COMPLETED", context });
        if (!parsed.success) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "RESPONSE_VALIDATION", "SCHEMA", parsed.error.issues);
        data = parsed.data;
        for (const citation of data.citations) {
          const mapped = evidence.filter(e=>e.citationId===citation.id);
          if (!mapped.length || mapped.some(e=>JSON.stringify(e.citation)!==JSON.stringify(citation))) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "CITATION_VALIDATION", "CITATION_PROJECTION");
        }
        qaStage("CITATIONS_VERIFIED");
        if (!skipEvidence && !await retriever.recheck(evidence)) throw qaOrigin(new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502), "EVIDENCE_ELIGIBILITY_CHECK", "ELIGIBILITY");
      } catch (e) {
        const failure = e instanceof AppError ? e : e instanceof EmbeddingError
          ? new AppError(e.code === "INVALID_PROVIDER_RESPONSE" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE", "AI_UNAVAILABLE", e.code === "INVALID_PROVIDER_RESPONSE" ? 502 : 503)
          : new AppError("INTERNAL_SERVER_ERROR", "INTERNAL_SERVER_ERROR", 500);
        try { await withinQaResponseBudget(() => store.fail(principal, admission, failure.code)); }
        catch { throw qaOrigin(new AppError("OPERATION_STATUS_UNKNOWN", "OPERATION_STATUS_UNKNOWN", 503), "FAILURE_PERSISTENCE", "PERSISTENCE"); }
        qaReportFailure(e, failure.code);
        throw failure;
      }
      try {
        qaStage("PERSISTENCE_STARTED");
        const completed = await withinQaResponseBudget(() => store.complete(principal, admission, data, evidence));
        qaStage("PERSISTENCE_COMPLETED");
        return { data: completed, replayed: false };
      } catch (e) {
        if (e instanceof AppError) {
          // Known eligibility/deletion/fence rejection cannot become a successful turn.
          try { await withinQaResponseBudget(() => store.fail(principal, admission, e.code)); } catch { /* deletion may already have scrubbed it */ }
          qaReportFailure(e, e.code);
          throw e;
        }
        // Never overwrite a possibly committed completed result with failure.
        throw qaOrigin(new AppError("OPERATION_STATUS_UNKNOWN", "OPERATION_STATUS_UNKNOWN", 503), "PERSISTENCE_STARTED", "PERSISTENCE");
      }
    },
    list: (principal: QaPrincipal, options?: { cursor?: string | null; limit?: number; search?: string }) => store.list ? store.list(principal, options) : Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
    get: (principal: QaPrincipal, id: string) => store.get ? store.get(principal, id) : store.history(principal, id).then(turns => ({ conversation: { id, title: "Cuộc hội thoại", context: { type: "GENERAL" as const }, headTurnId: null, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }, turns })),
    rename: (principal: QaPrincipal, id: string, title: string) => store.rename ? store.rename(principal, id, title) : Promise.resolve({ id, title }),
    turns: (principal: QaPrincipal, id: string, options?: { cursor?: string | null; limit?: number }) => store.turns ? store.turns(principal, id, options) : store.history(principal, id).then(turns => ({ turns, nextCursor: null, hasMore: false })),
    history: (principal: QaPrincipal, id: string) => store.history(principal, id),
    delete: (principal: QaPrincipal, id: string) => store.delete(principal, id),
    revokeGuest: (principal: QaPrincipal) => store.revokeGuest(principal),
    cleanup: () => store.cleanup(),
  };
}
