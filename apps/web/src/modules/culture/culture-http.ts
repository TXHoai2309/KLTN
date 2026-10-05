import { AppError } from "@/server/http/app-error";
export function culturePageQuery(request: Request): number {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "page") || params.getAll("page").length > 1 || (params.has("page") && !/^[1-9]\d*$/.test(params.get("page")!))) throw new AppError("INVALID_CULTURE_QUERY", "Tham số không hợp lệ.", 400);
  return Number(params.get("page") ?? 1);
}
export function noCultureQuery(request: Request) {
  if (new URL(request.url).search) throw new AppError("INVALID_CULTURE_QUERY", "Không hỗ trợ tham số này.", 400);
}
export async function cultureJson(request: Request) {
  noCultureQuery(request);
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
  return request.json().catch(() => { throw new AppError("INVALID_JSON", "JSON không hợp lệ.", 400); });
}
export function privateCultureResponse<T extends Response>(response: T): T { response.headers.set("Cache-Control", "private, no-store"); return response; }

export function cultureLookupQuery(request: Request) {
 const params = new URL(request.url).searchParams;
 if ([...params.keys()].some(key => !["page", "q"].includes(key)) || params.getAll("page").length > 1 || params.getAll("q").length > 1 || (params.has("page") && !/^[1-9]\d*$/.test(params.get("page")!))) throw new AppError("INVALID_CULTURE_QUERY", "Tham số không hợp lệ.", 400);
 return { query: params.get("q") ?? "", page: Number(params.get("page") ?? 1) };
}
