import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { AppError } from "@/server/http/app-error";
import { companionNoStore, companionWriteResponse } from "./companion-group-http";
import { getCompanionHistory, sendCompanionMessage } from "./companion-chat-service";
import type { CompanionDependencies } from "./companion-service";

export function chatQuery(request: Request) {
  const query: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(query, key)) throw new AppError("COMPANION_CURSOR_INVALID", "Tham số không được lặp.", 400);
    query[key] = value;
  }
  return query;
}
export async function companionChatReadResponse(request: Request, read: (input: Record<string, string>) => Promise<unknown>) {
  try { return companionNoStore(apiSuccess(await read(chatQuery(request)))); }
  catch (error) { return companionNoStore(handleApiError(error)); }
}
export const companionHistoryResponse = (request: Request, id: string, deps: CompanionDependencies) => companionChatReadResponse(request, query => getCompanionHistory(request.headers, id, query, deps));
export const companionSendResponse = (request: Request, id: string, deps: CompanionDependencies) => companionWriteResponse(request, (input, key) => sendCompanionMessage(request.headers, id, input, key, deps));
