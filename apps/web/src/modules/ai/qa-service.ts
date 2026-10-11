import { AppError } from "../../server/http/app-error";
import { qaCompletedTurnSchema, qaIdempotencyKeySchema, qaRequestSchema, type QaRequest } from "./qa-contract";
import type { QaConversationStore } from "./qa-conversation-store";
import type { QaGenerator, QaPrincipal, QaRetriever } from "./qa-runtime-contract";
import { isQaPublicAnswerSafe } from "./qa-public-safety";
import { EmbeddingError } from "../rag-processing/embedding-errors";

export function createQaService(dependencies: { store: QaConversationStore; retriever: QaRetriever; generator: QaGenerator; eligibilityPollMs?: number }) {
  const { store, retriever, generator } = dependencies;
  const eligibilityPollMs=dependencies.eligibilityPollMs ?? 1000;
  if(!Number.isInteger(eligibilityPollMs)||eligibilityPollMs<1||eligibilityPollMs>5000) throw new Error("Invalid QA eligibility polling interval");
  return {
    async ask(principal: QaPrincipal, key: string, input: QaRequest, signal?: AbortSignal) {
      const request = qaRequestSchema.safeParse(input);
      const parsedKey = qaIdempotencyKeySchema.safeParse(key);
      if (!request.success) throw new AppError("INVALID_REQUEST", "INVALID_REQUEST", 400);
      if (!parsedKey.success) throw new AppError("IDEMPOTENCY_KEY_INVALID", "IDEMPOTENCY_KEY_INVALID", 400);
      let admission;
      try { admission = await store.reserve(principal, parsedKey.data, request.data); }
      catch (e) {
        if (e instanceof AppError) throw e;
        // Admission itself may have committed despite a lost DB response. Same-key
        // reconciliation is required; do not manufacture a second first conversation.
        throw new AppError("OPERATION_STATUS_UNKNOWN", "OPERATION_STATUS_UNKNOWN", 503);
      }
      if (admission.kind === "REPLAY") return { data: admission.data, replayed: true };
      let data;
      let evidence;
      try {
        evidence = await retriever.retrieve(request.data.question, admission.history, signal);
        if (!await retriever.recheck(evidence)) throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
        const providerController=new AbortController();
        const relayAbort=()=>providerController.abort();
        signal?.addEventListener("abort",relayAbort,{once:true});
        if(signal?.aborted) providerController.abort();
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
          providerController.abort();
        };
        const watcher=(async()=>{
          while(evidence.length>0&&!stopped){
            await new Promise<void>(resolve=>{wakeWatcher=resolve;timer=setTimeout(resolve,eligibilityPollMs);});
            timer=undefined;
            wakeWatcher=undefined;
            if(stopped)return;
            try {
              if(!await retriever.recheck(evidence)) { invalidate(new AppError("AI_INVALID_RESPONSE","AI_INVALID_RESPONSE",502)); return; }
            } catch {
              invalidate(new AppError("AI_UNAVAILABLE","AI_UNAVAILABLE",503));
              return;
            }
          }
        })();
        const generation=generator.generate({ question: request.data.question, history: admission.history, evidence, context: { type: "GENERAL" }, signal: providerController.signal })
          .then(value=>{if(invalidationError)throw invalidationError;return value;},failure=>{if(invalidationError)throw invalidationError;throw failure;});
        let answer;
        try { answer=await Promise.race([generation,invalidation]); }
        finally {
          stopped=true;
          if(timer)clearTimeout(timer);
          wakeWatcher?.();
          signal?.removeEventListener("abort",relayAbort);
          await watcher;
        }
        if (!isQaPublicAnswerSafe(answer, evidence)) throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
        const parsed = qaCompletedTurnSchema.safeParse({ ...answer, conversationId: admission.conversationId, turnId: admission.turnId, turnState: "COMPLETED", context: { type: "GENERAL" } });
        if (!parsed.success) throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
        data = parsed.data;
        for (const citation of data.citations) {
          const mapped = evidence.filter(e=>e.citationId===citation.id);
          if (!mapped.length || mapped.some(e=>JSON.stringify(e.citation)!==JSON.stringify(citation))) throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
        }
        if (!await retriever.recheck(evidence)) throw new AppError("AI_INVALID_RESPONSE", "AI_INVALID_RESPONSE", 502);
      } catch (e) {
        const failure = e instanceof AppError ? e : e instanceof EmbeddingError
          ? new AppError(e.code === "INVALID_PROVIDER_RESPONSE" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE", "AI_UNAVAILABLE", e.code === "INVALID_PROVIDER_RESPONSE" ? 502 : 503)
          : new AppError("INTERNAL_SERVER_ERROR", "INTERNAL_SERVER_ERROR", 500);
        try { await store.fail(principal, admission, failure.code); }
        catch { throw new AppError("OPERATION_STATUS_UNKNOWN", "OPERATION_STATUS_UNKNOWN", 503); }
        throw failure;
      }
      try {
        const completed = await store.complete(principal, admission, data, evidence);
        return { data: completed, replayed: false };
      } catch (e) {
        if (e instanceof AppError) {
          // Known eligibility/deletion/fence rejection cannot become a successful turn.
          try { await store.fail(principal, admission, e.code); } catch { /* deletion may already have scrubbed it */ }
          throw e;
        }
        // Never overwrite a possibly committed completed result with failure.
        throw new AppError("OPERATION_STATUS_UNKNOWN", "OPERATION_STATUS_UNKNOWN", 503);
      }
    },
    history: (principal: QaPrincipal, id: string) => store.history(principal, id),
    delete: (principal: QaPrincipal, id: string) => store.delete(principal, id),
    revokeGuest: (principal: QaPrincipal) => store.revokeGuest(principal),
    cleanup: () => store.cleanup(),
  };
}
