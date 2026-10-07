import type { Database, Prisma } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { destinationInputSchema, destinationDtoSchema, destinationListSchema, fromMinute, toMinute, type DestinationInput } from "./destination-contract";

export type DestinationDependencies = AuthorizationDependencies & { database: Database };
export const destinationSelect = {
  id: true, name: true, description: true, area: true, category: true, latitude: true, longitude: true,
  suggestedDurationMinutes: true, minimumDurationMinutes: true, visibility: true, createdAt: true, updatedAt: true,
  openingDays: { select: { dayOfWeek: true, status: true, intervals: { select: { opensAtMinute: true, closesAtMinute: true }, orderBy: { opensAtMinute: "asc" } } } },
} satisfies Prisma.DestinationSelect;
type DestinationRow = Prisma.DestinationGetPayload<{ select: typeof destinationSelect }>;
export function toDestinationDto(row: DestinationRow) {
  return destinationDtoSchema.parse({
    id: row.id, name: row.name, description: row.description, area: row.area, category: row.category,
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
  const input = parseDestinationInput(body);
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: id === null ? "destination:create" : "destination:update",
    key, input: { id, ...input },
    execute: async tx => {
      // Recheck current role inside the mutation transaction too.
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const { openingDays, ...fields } = input;
      if (id === null) return toDestinationDto(await tx.destination.create({ data: { ...fields, visibility: "HIDDEN", openingDays: { create: openingCreate(openingDays) } }, select: destinationSelect }));
      if (!await tx.destination.findUnique({ where: { id }, select: { id: true } })) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      await tx.openingDay.deleteMany({ where: { destinationId: id } });
      return toDestinationDto(await tx.destination.update({ where: { id }, data: { ...fields, openingDays: { create: openingCreate(openingDays) } }, select: destinationSelect }));
    },
  });
}
