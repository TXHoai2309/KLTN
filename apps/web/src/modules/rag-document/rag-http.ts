import { AppError } from "@/server/http/app-error";

export async function ragJson(request: Request) {
  if (new URL(request.url).search) throw new AppError("INVALID_RAG_QUERY", "Không hỗ trợ tham số này.", 400);
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
  return request.json().catch(() => { throw new AppError("INVALID_JSON", "JSON không hợp lệ.", 400); });
}

export function privateRagResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
