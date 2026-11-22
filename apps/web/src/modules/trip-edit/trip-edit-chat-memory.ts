import { z } from "zod";
import { Prisma, type Database } from "@KLTN/db";

import { requireTraveler } from "@/server/auth/require-traveler";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { apiSuccess } from "@/server/http/api-response";
import { AppError } from "@/server/http/app-error";
import { handleApiError } from "@/server/http/error-handler";
import { readBoundedJsonBody } from "@/server/http/read-json-body";
import type {
  AdvisoryCitation,
  AdvisoryKnowledgePart,
} from "./ai-workspace-plan";

export const MAX_PERSISTED_CHAT_MESSAGES = 100;
const MAX_CHAT_MEMORY_BODY_BYTES = 128 * 1024;

const persistedMessageKindSchema = z.enum([
  "ADVISED",
  "APPLIED",
  "CLARIFYING",
  "INTERRUPTED",
  "STOPPED",
]);

const advisoryCitationSchema = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z.string().optional(),
  sourceType: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const advisoryKnowledgePartSchema = z.object({
  kind: z.string(),
  text: z.string(),
}).passthrough();

export const persistedChatMessageInputSchema = z.object({
  role: z.enum(["user", "assistant"]),
  kind: persistedMessageKindSchema.optional(),
  text: z.string().min(1).max(20_000),
  steps: z.array(z.string().max(300)).max(40).optional(),
  correctionNote: z.string().max(4_000).optional(),
  statusNotice: z.string().max(1_000).optional(),
  knowledgeParts: z.array(advisoryKnowledgePartSchema).max(40).optional(),
  citations: z.array(advisoryCitationSchema).max(40).optional(),
});

export const appendChatMessagesRequestSchema = z.object({
  messages: z.array(persistedChatMessageInputSchema).min(1).max(10),
});

export type PersistedTripEditChatEntry = {
  id: string;
  role: "user" | "assistant";
  kind?: "ADVISED" | "APPLIED" | "CLARIFYING" | "INTERRUPTED" | "STOPPED";
  text: string;
  steps?: readonly string[];
  correctionNote?: string;
  statusNotice?: string;
  knowledgeParts?: readonly AdvisoryKnowledgePart[];
  citations?: readonly AdvisoryCitation[];
};

export type TripEditChatDatabase = Pick<Database, "trip" | "tripEditChatMessage">;

function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function assertSameOriginMutation(request: Request): void {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
  }
}

async function assertTripOwner(
  database: TripEditChatDatabase,
  tripId: string,
  userId: string,
): Promise<void> {
  const trip = await database.trip.findUnique({
    where: { id: tripId },
    select: { id: true, userId: true },
  });
  if (!trip) {
    throw new AppError("NOT_FOUND", "Không tìm thấy chuyến đi.", 404);
  }
  if (trip.userId !== userId) {
    throw new AppError("FORBIDDEN", "Bạn không có quyền truy cập chuyến đi này.", 403);
  }
}

export async function listTripEditChatMessages(
  database: TripEditChatDatabase,
  tripId: string,
  limit = MAX_PERSISTED_CHAT_MESSAGES,
): Promise<PersistedTripEditChatEntry[]> {
  const rows = await database.tripEditChatMessage.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, MAX_PERSISTED_CHAT_MESSAGES)),
  });

  rows.reverse();

  return rows.map((row) => {
    const entry: PersistedTripEditChatEntry = {
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      text: row.text,
    };
    const parsedKind = persistedMessageKindSchema.safeParse(row.kind);
    if (parsedKind.success) entry.kind = parsedKind.data;
    if (Array.isArray(row.steps)) {
      const steps = row.steps.filter((s): s is string => typeof s === "string");
      if (steps.length > 0) entry.steps = steps;
    }
    if (row.correctionNote) entry.correctionNote = row.correctionNote;
    if (row.statusNotice) entry.statusNotice = row.statusNotice;
    if (Array.isArray(row.knowledgeParts) && row.knowledgeParts.length > 0) {
      entry.knowledgeParts = row.knowledgeParts as unknown as readonly AdvisoryKnowledgePart[];
    }
    if (Array.isArray(row.citations) && row.citations.length > 0) {
      entry.citations = row.citations as unknown as readonly AdvisoryCitation[];
    }
    return entry;
  });
}

export async function appendTripEditChatMessages(
  database: TripEditChatDatabase,
  tripId: string,
  messages: readonly z.infer<typeof persistedChatMessageInputSchema>[],
): Promise<PersistedTripEditChatEntry[]> {
  const created: PersistedTripEditChatEntry[] = [];
  for (const item of messages) {
    const row = await database.tripEditChatMessage.create({
      data: {
        tripId,
        role: item.role,
        kind: item.kind ?? null,
        text: item.text,
        steps: item.steps && item.steps.length > 0 ? item.steps : Prisma.DbNull,
        correctionNote: item.correctionNote ?? null,
        statusNotice: item.statusNotice ?? null,
        knowledgeParts:
          item.knowledgeParts && item.knowledgeParts.length > 0
            ? (item.knowledgeParts as Prisma.InputJsonValue)
            : Prisma.DbNull,
        citations:
          item.citations && item.citations.length > 0
            ? (item.citations as Prisma.InputJsonValue)
            : Prisma.DbNull,
      },
    });
    created.push({
      id: row.id,
      role: item.role,
      ...(item.kind ? { kind: item.kind } : {}),
      text: row.text,
      ...(item.steps && item.steps.length > 0 ? { steps: item.steps } : {}),
      ...(item.correctionNote ? { correctionNote: item.correctionNote } : {}),
      ...(item.statusNotice ? { statusNotice: item.statusNotice } : {}),
      ...(item.knowledgeParts && item.knowledgeParts.length > 0
        ? { knowledgeParts: item.knowledgeParts as unknown as readonly AdvisoryKnowledgePart[] }
        : {}),
      ...(item.citations && item.citations.length > 0
        ? { citations: item.citations as unknown as readonly AdvisoryCitation[] }
        : {}),
    });
  }
  return created;
}

export async function clearTripEditChatMessages(
  database: TripEditChatDatabase,
  tripId: string,
): Promise<number> {
  const result = await database.tripEditChatMessage.deleteMany({
    where: { tripId },
  });
  return result.count;
}

export type TripEditChatHttpDependencies = {
  authorization: AuthorizationDependencies;
  database: TripEditChatDatabase;
};

export async function getTripEditChatMessagesResponse(
  request: Request,
  tripId: string,
  dependencies: TripEditChatHttpDependencies,
): Promise<Response> {
  try {
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    await assertTripOwner(dependencies.database, tripId, actor.userId);
    const messages = await listTripEditChatMessages(dependencies.database, tripId);
    return privateResponse(apiSuccess({ messages }, 200));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}

export async function postTripEditChatMessagesResponse(
  request: Request,
  tripId: string,
  dependencies: TripEditChatHttpDependencies,
): Promise<Response> {
  try {
    assertSameOriginMutation(request);
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    await assertTripOwner(dependencies.database, tripId, actor.userId);
    const raw = await readBoundedJsonBody(request, {
      maxBytes: MAX_CHAT_MEMORY_BODY_BYTES,
      tooLargeError: new AppError("VALIDATION_ERROR", "Nội dung quá lớn.", 400),
      emptyError: new AppError("VALIDATION_ERROR", "Thiếu nội dung tin nhắn.", 400),
      invalidJsonError: new AppError("VALIDATION_ERROR", "JSON không hợp lệ.", 400),
    });
    const parsed = appendChatMessagesRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Dữ liệu tin nhắn không hợp lệ.", 400);
    }
    const messages = await appendTripEditChatMessages(
      dependencies.database,
      tripId,
      parsed.data.messages,
    );
    return privateResponse(apiSuccess({ messages }, 201));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}

export async function deleteTripEditChatMessagesResponse(
  request: Request,
  tripId: string,
  dependencies: TripEditChatHttpDependencies,
): Promise<Response> {
  try {
    assertSameOriginMutation(request);
    const actor = await requireTraveler(request.headers, dependencies.authorization);
    await assertTripOwner(dependencies.database, tripId, actor.userId);
    const deleted = await clearTripEditChatMessages(dependencies.database, tripId);
    return privateResponse(apiSuccess({ deleted }, 200));
  } catch (error) {
    return privateResponse(handleApiError(error));
  }
}
