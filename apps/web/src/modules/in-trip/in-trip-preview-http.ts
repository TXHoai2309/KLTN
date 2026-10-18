import { z } from "zod";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import { editCandidateSchema } from "../trip-edit/edit-candidate";
import { inTripLocationSchema } from "./in-trip-location";
import { previewInTrip, type InTripPreviewDependencies } from "./in-trip-validation";
import { mandatoryEndpointSchema } from "./mandatory-endpoint";

export const MAX_IN_TRIP_PREVIEW_BODY_BYTES = 64 * 1024;

export const inTripPreviewRequestSchema = z.object({
  baseRevision: z.iso.datetime(),
  candidate: editCandidateSchema,
  location: inTripLocationSchema,
  mandatoryEndpoint: mandatoryEndpointSchema.nullable().optional(),
}).strict();

export type InTripPreviewHttpDependencies = {
  authorization: AuthorizationDependencies;
  service: InTripPreviewDependencies;
  /** Test-only instrumentation; production dependencies do not set it. */
  onBodyRead?: () => void;
};

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function validationError(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, 400);
}

function assertSameOriginPost(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
}

/** Authenticate before reading a bounded, strict private preview request. */
export async function previewInTripResponse(
  request: Request,
  tripId: string,
  dependencies: InTripPreviewHttpDependencies,
): Promise<Response> {
  try {
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    assertSameOriginPost(request);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
      throw validationError("Yêu cầu phải là JSON.");
    }
    dependencies.onBodyRead?.();
    const rawBody = await readBoundedJsonBody(request, {
      maxBytes: MAX_IN_TRIP_PREVIEW_BODY_BYTES,
      tooLargeError: validationError("Nội dung yêu cầu vượt quá giới hạn cho phép."),
      emptyError: validationError("Nội dung yêu cầu phải là JSON hợp lệ."),
      invalidJsonError: validationError("Nội dung yêu cầu phải là JSON hợp lệ."),
    });
    const parsed = inTripPreviewRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw validationError("Nội dung phương án In-trip chưa hợp lệ.");
    }
    const result = await previewInTrip(tripId, actor.userId, parsed.data, dependencies.service);
    return privateResponse(apiSuccess(result));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
