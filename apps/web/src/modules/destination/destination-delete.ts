import type { Database } from "@KLTN/db";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { validateDestinationId, type DestinationDependencies } from "./destination-service";

export type DestinationDeleteResult = { id: string; deletedAt: string };
export type DestinationRestoreResult = { id: string; visibility: "HIDDEN"; updatedAt: string };

export async function softDeleteDestination(headers: Headers, rawId: string, key: string, deps: DestinationDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  const id = validateDestinationId(rawId);
  return executeIdempotentWrite<DestinationDeleteResult>({
    database: deps.database, actorId: actor.id, operation: "destination:soft-delete", key, input: { id },
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const row = await tx.destination.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
      if (!row) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      if (row.deletedAt) return { id, deletedAt: row.deletedAt.toISOString() };
      const deletedAt = new Date();
      const changed = await tx.destination.updateMany({ where: { id, deletedAt: null }, data: { deletedAt } });
      if (changed.count === 1) return { id, deletedAt: deletedAt.toISOString() };
      const current = await tx.destination.findUnique({ where: { id }, select: { deletedAt: true } });
      if (!current) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      if (current.deletedAt) return { id, deletedAt: current.deletedAt.toISOString() };
      throw new AppError("DESTINATION_CHANGED", "Điểm đến đã thay đổi. Tải lại trước khi xóa.", 409);
    },
  });
}

export async function restoreDestination(headers: Headers, rawId: string, key: string, deps: DestinationDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  const id = validateDestinationId(rawId);
  return executeIdempotentWrite<DestinationRestoreResult>({
    database: deps.database, actorId: actor.id, operation: "destination:restore", key, input: { id },
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const row = await tx.destination.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
      if (!row) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      if (!row.deletedAt) throw new AppError("DESTINATION_NOT_DELETED", "Chỉ có thể khôi phục điểm đến đã xóa.", 409);
      const changed = await tx.destination.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null, visibility: "HIDDEN" } });
      if (changed.count !== 1) throw new AppError("DESTINATION_CHANGED", "Điểm đến đã thay đổi. Tải lại trước khi khôi phục.", 409);
      const current = await tx.destination.findUnique({ where: { id }, select: { id: true, deletedAt: true, visibility: true, updatedAt: true } });
      if (!current) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      if (current.deletedAt) throw new AppError("DESTINATION_CHANGED", "Điểm đến đã thay đổi. Tải lại trước khi khôi phục.", 409);
      return { id, visibility: "HIDDEN", updatedAt: current.updatedAt.toISOString() };
    },
  });
}
