import type { Database, Prisma } from "@KLTN/db";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import {
  executeIdempotentWrite,
  preflightIdempotentReplay,
} from "@/server/http/idempotency";
import {
  destinationV3CreateSchema,
  destinationV3PatchSchema,
  type DestinationV3Input,
} from "./destination-v3-contract";
import {
  DEFAULT_DESTINATION_AREA,
  isDestinationCategory,
} from "./destination-categories";
import { shortDescription } from "./short-description";
import {
  destinationSelect,
  toDestinationDto,
  type DestinationDependencies,
} from "./destination-service";
import { equal, openingChanges } from "./destination-safe-write";
import {
  unknownSchedule,
  toMinute,
  type DestinationDto,
} from "./destination-contract";
import { admitMapsResolution, resolveMapsUrl } from "./maps-url-resolver";
import { mediaChanges } from "./destination-media-patch";
import { recordUnlinkedCloudinaryMedia } from "./destination-media-orphans";

export async function writeDestinationV3(
  headers: Headers,
  body: unknown,
  key: string,
  id: string | null,
  deps: DestinationDependencies,
) {
  const actor = await requireActor(headers, deps, "admin");
  const parsed = (
    id === null ? destinationV3CreateSchema : destinationV3PatchSchema
  ).safeParse(body);
  if (!parsed.success)
    throw new AppError(
      "INVALID_DESTINATION_INPUT",
      "Kiểm tra các trường không hợp lệ.",
      400,
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  const input: DestinationV3Input = parsed.data;
  const before = id
    ? await deps.database.destination.findUnique({
        where: { id, deletedAt: null },
        select: destinationSelect,
      })
    : null;
  if (id && !before)
    throw new AppError(
      "DESTINATION_NOT_FOUND",
      "Không tìm thấy điểm đến.",
      404,
    );
  const identity = {
    database: deps.database,
    actorId: actor.id,
    operation: id ? "destination:update-v3" : "destination:create-v3",
    key,
    input: { id, ...input },
  };
  const replay = await preflightIdempotentReplay<DestinationDto>(identity);
  if (replay.status !== "ABSENT") return replay; // UNKNOWN lookup is not absence; replay never depends on a live redirect/provider.
  if (
    input.category !== undefined &&
    input.category !== before?.category &&
    !isDestinationCategory(input.category)
  )
    throw new AppError(
      "INVALID_DESTINATION_INPUT",
      "Chọn danh mục điểm đến trong danh sách.",
      400,
      [{ path: "category", message: "Danh mục mới không hợp lệ." }],
    );
  let location: { latitude: number; longitude: number } | undefined;
  if (
    input.googleMapsUrl !== undefined &&
    input.googleMapsUrl !== before?.googleMapsUrl
  ) {
    admitMapsResolution(actor.id);
    const result = await resolveMapsUrl(input.googleMapsUrl);
    if (
      result.status !== "RESOLVED" ||
      result.latitude === undefined ||
      result.longitude === undefined
    )
      throw new AppError("INVALID_DESTINATION_INPUT", result.reason, 400, [
        { path: "googleMapsUrl", message: result.reason },
      ]);
    location = { latitude: result.latitude, longitude: result.longitude };
  }
  // Provider calls stay outside the transaction; the idempotency hash is the original normalized payload.
  return executeIdempotentWrite({
    database: deps.database,
    actorId: actor.id,
    operation: id ? "destination:update-v3" : "destination:create-v3",
    key,
    input: { id, ...input },
    execute: async (tx) => {
      await requireActor(
        headers,
        { ...deps, database: tx as unknown as Database },
        "admin",
      );
      const previous = id
        ? await tx.destination.findUnique({
            where: { id, deletedAt: null },
            select: destinationSelect,
          })
        : null;
      if (id && !previous)
        throw new AppError(
          "DESTINATION_NOT_FOUND",
          "Không tìm thấy điểm đến.",
          404,
        );
      if (
        previous &&
        "expectedUpdatedAt" in input &&
        input.expectedUpdatedAt &&
        previous.updatedAt.toISOString() !== input.expectedUpdatedAt
      )
        throw new AppError(
          "DESTINATION_CHANGED",
          "Điểm đến đã được cập nhật ở nơi khác. Tải lại trước khi lưu.",
          409,
        );
      if (
        input.category !== undefined &&
        input.category !== previous?.category &&
        !isDestinationCategory(input.category)
      )
        throw new AppError(
          "INVALID_DESTINATION_INPUT",
          "Danh mục không hợp lệ.",
          400,
        );
      const data: Record<string, unknown> = {};
      if (previous) {
        const media = mediaChanges(previous.media, input);
        if (media) data.media = media;
        const orphanIds = new Set(input.removedMediaIds ?? []);
        // A URL replacement unlinks the old physical asset too.
        for (const patch of input.media ?? []) if (patch.url && previous.media.some(m => m.id === patch.id && m.url !== patch.url)) orphanIds.add(patch.id);
        await recordUnlinkedCloudinaryMedia(tx, actor.id, id!, key, previous.media.filter(m => orphanIds.has(m.id)));
      }
      for (const key of [
        "name",
        "category",
        "address",
        "suggestedDurationMinutes",
        "minimumDurationMinutes",
      ] as const)
        if (input[key] !== undefined && !equal(input[key], previous?.[key]))
          data[key] = input[key];
      if (
        input.description !== undefined &&
        input.description !== previous?.description
      )
        Object.assign(data, {
          description: input.description,
          shortDescription: shortDescription(input.description),
        });
      if (
        input.googleMapsUrl !== undefined &&
        input.googleMapsUrl !== previous?.googleMapsUrl
      ) {
        if (!location)
          throw new AppError(
            "DESTINATION_CHANGED",
            "Vị trí đã thay đổi. Kiểm tra lại liên kết.",
            409,
          );
        Object.assign(data, location, {
          googleMapsUrl: input.googleMapsUrl,
          locationVerified: true,
          locationEvidence: `EXPLICIT_MAPS_URL: ${input.googleMapsUrl}`.slice(
            0,
            2000,
          ),
        });
      }
      const sources = previous?.sources ?? [];
      const create: Record<string, unknown>[] = [],
        update: { where: { id: string }; data: Record<string, unknown> }[] = [];
      const removed = input.removedSourceIds ?? [];
      if (
        new Set(removed).size !== removed.length ||
        removed.some((sourceId) => !sources.some((s) => s.id === sourceId)) ||
        input.sources?.some((s) => s.id && removed.includes(s.id))
      )
        throw new AppError(
          "INVALID_SOURCE_OWNER",
          "Nguồn xóa không thuộc điểm đến hoặc trùng thao tác cập nhật.",
          400,
        );
      if (
        sources.length -
          removed.length +
          (input.sources?.filter((s) => !s.id).length ?? 0) >
        30
      )
        throw new AppError(
          "INVALID_DESTINATION_INPUT",
          "Tối đa 30 nguồn.",
          400,
        );
      for (const source of input.sources ?? []) {
        if (source.id) {
          const old = sources.find((s) => s.id === source.id);
          if (!old)
            throw new AppError(
              "INVALID_SOURCE_OWNER",
              "Nguồn không thuộc điểm đến này.",
              400,
            );
          const changes = Object.fromEntries(
            Object.entries({ title: source.title, url: source.url }).filter(
              ([k, v]) => v !== old[k as "title" | "url"],
            ),
          );
          if (Object.keys(changes).length) {
            // A different URL is different evidence: do not carry approval to a new document.
            if (changes.url)
              Object.assign(changes, {
                websiteRights: "UNKNOWN",
                indexingRights: "UNKNOWN",
                openAiRights: "UNKNOWN",
                rightsEvidence: null,
                reviewedBy: null,
                reviewedAt: null,
              });
            update.push({ where: { id: source.id }, data: changes });
          }
        } else
          create.push({
            title: source.title,
            url: source.url,
            position: (sources.length ? Math.max(...sources.map(s => s.position)) + 1 : 0) + create.length,
          });
      }
      if (create.length || update.length || removed.length)
        data.sources = {
          ...(create.length ? { create } : {}),
          ...(update.length ? { update } : {}),
          ...(removed.length ? { deleteMany: { id: { in: removed } } } : {}),
        };
      if (previous && input.openingDays) {
        const updates = openingChanges(previous.openingDays, input.openingDays);
        if (updates.length)
          data.openingDays = {
            update: updates.map((u) => ({
              where: {
                destinationId_dayOfWeek: {
                  destinationId: id!,
                  dayOfWeek: u.where.dayOfWeek,
                },
              },
              data: u.data,
            })),
          };
      }
      if (previous) {
        if (!Object.keys(data).length) return toDestinationDto(previous);
        try {
          return toDestinationDto(
            await tx.destination.update({
              where: {
                id: id!,
                ...("expectedUpdatedAt" in input && input.expectedUpdatedAt
                  ? { updatedAt: new Date(input.expectedUpdatedAt) }
                  : {}),
              },
              data: {
                ...data,
                contentRevision: { increment: 1 },
              } as Prisma.DestinationUpdateInput,
              select: destinationSelect,
            }),
          );
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2025"
          )
            throw new AppError(
              "DESTINATION_CHANGED",
              "Điểm đến hoặc nguồn đã thay đổi. Tải lại để đối chiếu trước khi lưu.",
              409,
            );
          throw error;
        }
      }
      if (!location || !input.name || !input.description || !input.category)
        throw new AppError(
          "INVALID_DESTINATION_INPUT",
          "Thiếu thông tin tạo điểm đến.",
          400,
        );
      const days = input.openingDays ?? unknownSchedule();
      return toDestinationDto(
        await tx.destination.create({
          data: {
            ...data,
            name: input.name,
            description: input.description,
            category: input.category,
            ...location,
            area: DEFAULT_DESTINATION_AREA,
            visibility: "HIDDEN",
            openingDays: {
              create: days.map((day) => ({
                dayOfWeek: day.dayOfWeek,
                status: day.status,
                intervals: {
                  create: day.intervals.map((i) => ({
                    opensAtMinute: toMinute(i.opensAt),
                    closesAtMinute: toMinute(i.closesAt),
                  })),
                },
              })),
            },
          } as Prisma.DestinationCreateInput,
          select: destinationSelect,
        }),
      );
    },
  });
}
