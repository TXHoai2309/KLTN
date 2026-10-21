import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { AppError } from "@/server/http/app-error";
import type { DestinationDto } from "./destination-contract";
/** Preserve legacy response shape; V3 explicitly requests protected child IDs. No new auth privilege. */
export function destinationResponseDto(dto: DestinationDto, request: Request): DestinationDto {
  if (request.headers.get("X-KLTN-Form-Version") === "V3" || !dto.profile) return dto;
  const withoutId = <T extends {id?:string}>(item:T) => { const {id: _id,...fields}=item; return fields; };
  return {...dto,profile:{...dto.profile,sources:dto.profile.sources.map(withoutId),media:dto.profile.media.map(withoutId)}};
}
export function destinationPageQuery(request: Request): { page: number; view: "active" | "deleted" } {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "page" && key !== "view") || params.getAll("page").length > 1 || params.getAll("view").length > 1 || (params.has("page") && !/^[1-9]\d*$/.test(params.get("page")!)) || (params.has("view") && params.get("view") !== "deleted")) throw new AppError("INVALID_DESTINATION_QUERY", "Tham số không hợp lệ.", 400);
  return { page: Number(params.get("page") ?? 1), view: params.get("view") === "deleted" ? "deleted" : "active" };
}
export function noDestinationQuery(request: Request) {
  if (new URL(request.url).search) throw new AppError("INVALID_DESTINATION_QUERY", "Không hỗ trợ tham số này.", 400);
}
export function requireDestinationSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  noDestinationQuery(request);
}
export async function destinationJson(request: Request) {
  requireDestinationSameOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải là JSON.", 415);
  return readBoundedJsonBody(request, {maxBytes: 512 * 1024,
    tooLargeError: new AppError("DESTINATION_BODY_TOO_LARGE", "Dữ liệu biểu mẫu quá lớn.", 413),
    emptyError: new AppError("INVALID_JSON", "JSON không hợp lệ.", 400),
    invalidJsonError: new AppError("INVALID_JSON", "JSON không hợp lệ.", 400)});
}
export function privateDestinationResponse<T extends Response>(response: T): T { response.headers.set("Cache-Control", "private, no-store"); return response; }
