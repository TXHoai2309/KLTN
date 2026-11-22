import { db } from "@/services";
import { authorizationDependencies } from "@/server/authorization/server";
import { requireActor } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { AppError } from "@/server/http/app-error";
import { assistantConversationIdSchema } from "@/modules/tripsage-chat/assistant-conversation-contract";
import { readConversationTrace } from "@/modules/tripsage-chat/tripsage-tool-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: one planning conversation with the tools the assistant called and what they returned. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireActor(request.headers, authorizationDependencies, "admin");
    const id = assistantConversationIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError("VALIDATION_ERROR", "Mã hội thoại không hợp lệ.", 400);
    const trace = await readConversationTrace(db as never, id.data);
    if (!trace) throw new AppError("NOT_FOUND", "Không tìm thấy hội thoại.", 404);
    const response = apiSuccess(trace);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleApiError(error); }
}
