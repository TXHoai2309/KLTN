import { destinationProfileSchema } from "../content-profile/content-profile-contract";
import { writeDestinationV3 } from "./destination-v3-service";
import { legacyProfileChanges, openingChanges, equal } from "./destination-safe-write";
import { destinationProfileSelect, profileDto, profileWrite } from "@/modules/content-profile/content-profile-service";
import type { Database, Prisma } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { destinationInputSchema, destinationDtoSchema, destinationListSchema, fromMinute, toMinute, type DestinationInput } from "./destination-contract";

export type DestinationDependencies = AuthorizationDependencies & { database: Database };
export const destinationSelect = {
  ...destinationProfileSelect,
  id: true, name: true, description: true, area: true, category: true, latitude: true, longitude: true,
  suggestedDurationMinutes: true, minimumDurationMinutes: true, visibility: true, createdAt: true, updatedAt: true,
  openingDays: { select: { id: true, dayOfWeek: true, status: true, intervals: { select: { id: true, opensAtMinute: true, closesAtMinute: true }, orderBy: { opensAtMinute: "asc" } } } },
} satisfies Prisma.DestinationSelect;
type DestinationRow = Prisma.DestinationGetPayload<{ select: typeof destinationSelect }>;
export function toDestinationDto(row: DestinationRow) {
  return destinationDtoSchema.parse({
    ...profileDto(row, "destination"), id: row.id, name: row.name, description: row.description, area: row.area, category: row.category,
    latitude: row.latitude, longitude: row.longitude, suggestedDurationMinutes: row.suggestedDurationMinutes,
    minimumDurationMinutes: row.minimumDurationMinutes, visibility: row.visibility,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    openingDays: row.openingDays.map(day => ({ dayOfWeek: day.dayOfWeek, status: day.status, intervals: day.intervals.map(interval => ({ opensAt: fromMinute(interval.opensAtMinute), closesAt: fromMinute(interval.closesAtMinute) })) })),
  });
}
export function parseDestinationInput(body: unknown): DestinationInput {
  const parsed = destinationInputSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_DESTINATION_INPUT", "Dữ liệu điểm đến không hợp lệ.", 400, parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })));
  return parsed.data;
}
export function validateDestinationId(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
  return id;
}
function openingCreate(days: DestinationInput["openingDays"]) {
  return days.map(day => ({ dayOfWeek: day.dayOfWeek, status: day.status, intervals: { create: day.intervals.map(interval => ({ opensAtMinute: toMinute(interval.opensAt), closesAtMinute: toMinute(interval.closesAt) })) } }));
}
export async function listDestinations(headers: Headers, page: number, deps: DestinationDependencies) {
  await requireActor(headers, deps, "admin");
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AppError("INVALID_DESTINATION_QUERY", "Trang không hợp lệ.", 400);
  const rows = await deps.database.destination.findMany({ skip: (page - 1) * 25, take: 26, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, area: true, category: true, visibility: true, updatedAt: true } });
  return destinationListSchema.parse({ items: rows.slice(0, 25).map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() })), page, hasMore: rows.length > 25 });
}
export async function readDestination(id: string, database: Pick<Database, "destination">) {
  const row = await database.destination.findUnique({ where: { id: validateDestinationId(id) }, select: destinationSelect });
  if (!row) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
  return toDestinationDto(row);
}
export async function getDestination(headers: Headers, id: string, deps: DestinationDependencies) {
  await requireActor(headers, deps, "admin");
  return readDestination(id, deps.database);
}
export async function writeDestination(headers: Headers, body: unknown, key: string, id: string | null, deps: DestinationDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  if (id !== null) validateDestinationId(id);
  if (body && typeof body === "object" && "formVersion" in body) return writeDestinationV3(headers, body, key, id, deps);
  const rawProfile = body && typeof body === "object" && "profile" in body ? (body as {profile: unknown}).profile : undefined;
  const validationBody = id !== null && rawProfile !== undefined ? Object.fromEntries(Object.entries(body as object).filter(([k]) => k !== "profile")) : body;
  const parsed = (id === null ? destinationInputSchema : destinationInputSchema.partial()).safeParse(validationBody);
  if (!parsed.success) throw new AppError("INVALID_DESTINATION_INPUT", "Dữ liệu điểm đến không hợp lệ.", 400, parsed.error.issues.map(i => ({path: i.path.join("."), message: i.message})));
  const input = parsed.data;
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: id === null ? "destination:create" : "destination:update",
    key, input: { id, ...input, ...(id !== null && rawProfile !== undefined ? {profile:rawProfile} : {}) },
    execute: async tx => {
      // Recheck current role inside the mutation transaction too.
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      if (id === null) {
        const full = parseDestinationInput(body);
        const { openingDays, profile, ...fields } = full;
        if (profile?.sources.some(s => s.id) || profile?.media.some(m => m.id)) throw new AppError("INVALID_CONTENT_REFERENCES", "Không dùng ID nguồn/ảnh hiện có khi tạo điểm đến mới.", 400);
        const extension = await profileWrite(tx, profile, actor.id, false);
        return toDestinationDto(await tx.destination.create({ data: { ...fields, ...extension, visibility: "HIDDEN", openingDays: { create: openingCreate(openingDays) } }, select: destinationSelect }));
      }
      const previous = await tx.destination.findUnique({ where: { id }, select: destinationSelect });
      if (!previous) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      const { openingDays, profile: ignoredProfile, ...fields } = input;
      let profile = ignoredProfile;
      if (rawProfile !== undefined) {
        if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) throw new AppError("INVALID_DESTINATION_INPUT", "Profile không hợp lệ.", 400);
        const validated = destinationProfileSchema.safeParse({...toDestinationDto(previous).profile, ...rawProfile});
        if (!validated.success) throw new AppError("INVALID_DESTINATION_INPUT", "Profile không hợp lệ.", 400);
        profile = validated.data;
      }
      const data: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !equal(previous[k as keyof typeof previous], v)));
      if (profile) {
        await profileWrite(tx, profile, actor.id, true); // Reference validation only; do not use replacement output.
        const rawKeys = Object.keys((body as {profile: object}).profile);
        Object.assign(data, legacyProfileChanges(previous as unknown as Record<string, unknown>, profile, actor.id, rawKeys));
      }
      if (openingDays) {
        const updates = openingChanges(previous.openingDays, openingDays);
        if (updates.length) data.openingDays = { update: updates.map(u => ({where: {destinationId_dayOfWeek: {destinationId: id, dayOfWeek: u.where.dayOfWeek}}, data: u.data})) };
      }
      if (!profile && (data.latitude !== undefined || data.longitude !== undefined)) Object.assign(data, {locationVerified: false, locationEvidence: null});
      if (!Object.keys(data).length) return toDestinationDto(previous);
      data.contentRevision = { increment: 1 };
      return toDestinationDto(await tx.destination.update({ where: { id }, data: data as Prisma.DestinationUpdateInput, select: destinationSelect }));
    },
  });
}
