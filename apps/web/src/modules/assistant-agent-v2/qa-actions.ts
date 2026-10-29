import "server-only";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { qaCompletedTurnSchema, qaIdempotencyKeySchema, qaRequestSchema } from "../ai/qa-contract";
import type { createQaService } from "../ai/qa-service";
import type { AssistantAgentContext } from "./agent-context";
import type { QaPrincipal } from "../ai/qa-runtime-contract";

export type QaActionServices = { userId: string; service: Pick<ReturnType<typeof createQaService>, "ask">; principal?: QaPrincipal };
export const qaActionInputSchema = z.object({ key: qaIdempotencyKeySchema, request: qaRequestSchema }).strict();
export const qaActionOutputSchema = z.object({ data: qaCompletedTurnSchema, replayed: z.boolean() }).strict();

/** Only the existing QA service is reachable here: no planning service, proposal
 * publication, Save or Trip mutation capability is supplied to this action. */
export async function answerHaGiangQuestion(input: z.infer<typeof qaActionInputSchema>, context: AssistantAgentContext, services?: QaActionServices) {
  if (!services || services.userId !== context.userId) throw new AppError("QA_CONTEXT_REQUIRED", "Thiếu ngữ cảnh Q&A đã xác thực.", 403);
  if (input.request.knowledgeMode !== "SOURCE_ONLY") throw new AppError("INVALID_REQUEST", "Phiên V2 chỉ dùng dữ liệu nguồn đã xác minh.", 400);
  const principal = services.principal ?? { kind: "USER", id: context.userId };
  if (principal.kind !== "USER" || principal.id !== context.userId) throw new AppError("QA_CONTEXT_REQUIRED", "Chủ thể Q&A không khớp phiên hiện tại.", 403);
  return services.service.ask(principal, input.key, input.request);
}

/** Lazy composition of the existing gated runtime. Importing/starting V2 does
 * not enable QA, create a conversation or initialize a second RAG pipeline. */
export async function existingQaServices(userId: string, headers: Headers): Promise<QaActionServices> {
  const runtime = await import("../ai/qa-runtime");
  if (!runtime.qaRuntimeEnabled()) throw new AppError("AI_UNAVAILABLE", "Q&A chưa được bật trong môi trường này.", 503);
  const principal = await runtime.qaPrincipalResolver.resolve(headers);
  if (principal.kind !== "USER" || principal.id !== userId) throw new AppError("QA_CONTEXT_REQUIRED", "Chủ thể Q&A đã thay đổi.", 403);
  return { userId, principal, service: runtime.qaService };
}
