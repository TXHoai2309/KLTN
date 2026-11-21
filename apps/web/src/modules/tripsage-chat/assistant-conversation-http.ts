import "server-only";
import { requireTraveler } from "../../server/auth/require-traveler";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { apiFailure, apiMutationFailure, apiMutationResult, apiMutationUnknown, apiSuccess } from "../../server/http/api-response";
import { AppError } from "../../server/http/app-error";
import { requireIdempotencyKey } from "../../server/http/idempotency";
import { assistantConversationIdSchema } from "./assistant-conversation-contract";
import type { AssistantConversationStore } from "./assistant-conversation-store";
import { chosenLodgingsPartSchema } from "./tripsage-timeline";

export type AssistantConversationHttpDependencies = {
  authorization: AuthorizationDependencies;
  store: () => AssistantConversationStore;
};

const noStore = (response: Response) => {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

/** Thin HTTP boundary for listing, reading, updating chosen lodgings, deleting one, and deleting all owned assistant conversations. */
export async function assistantConversationsResponse(
  request: Request,
  deps: AssistantConversationHttpDependencies,
  id?: string,
): Promise<Response> {
  const mutating = request.method === "DELETE" || request.method === "PATCH";
  const fail = mutating ? apiMutationFailure : apiFailure;
  let started = false;
  try {
    const actor = await requireTraveler(request.headers, deps.authorization);
    if (id !== undefined && !assistantConversationIdSchema.safeParse(id).success) {
      throw new AppError("NOT_FOUND", "Không tìm thấy cuộc hội thoại.", 404);
    }
    if (!mutating) {
      const store = deps.store();
      if (id !== undefined) {
        const detail = await store.get(actor.userId, id);
        return noStore(apiSuccess(detail));
      }
      const url = new URL(request.url);
      const cursor = url.searchParams.get("cursor") || undefined;
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam && /^\d+$/.test(limitParam) ? Number(limitParam) : undefined;
      const search = url.searchParams.get("search") || url.searchParams.get("q") || undefined;
      const list = await store.list(actor.userId, { cursor, limit, search });
      return noStore(apiSuccess(list));
    }
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
    }
    const key = requireIdempotencyKey(request);
    const store = deps.store();
    if (request.method === "PATCH") {
      if (id === undefined || !store.updateChosenLodgings) {
        throw new AppError("NOT_FOUND", "Không tìm thấy cuộc hội thoại.", 404);
      }
      let raw: unknown;
      try { raw = await request.json(); } catch { throw new AppError("INVALID_INPUT", "Nội dung yêu cầu chưa hợp lệ.", 400); }
      const parsed = chosenLodgingsPartSchema.safeParse(raw);
      if (!parsed.success) throw new AppError("INVALID_INPUT", "Danh sách chỗ nghỉ đã chọn chưa hợp lệ.", 400);
      started = true;
      return noStore(apiMutationResult(await store.updateChosenLodgings({
        userId: actor.userId,
        conversationId: id,
        idempotencyKey: key,
        chosenLodgings: parsed.data.chosenLodgings,
      })));
    }
    started = true;
    return noStore(id === undefined
      ? apiMutationResult(await store.deleteAll(actor.userId, key))
      : apiMutationResult(await store.deleteOne(actor.userId, id, key)));
  } catch (error) {
    if (error instanceof AppError) return noStore(fail(error.code, error.message, error.status));
    if (started) return noStore(apiMutationUnknown());
    return noStore(fail("CONVERSATION_STORE_UNAVAILABLE", "Kho hội thoại tạm thời không khả dụng. Vui lòng thử lại sau.", 503));
  }
}
