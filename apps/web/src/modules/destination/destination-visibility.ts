import type { Database } from "@KLTN/db";
import { z } from "zod";
import { requireActor } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { visibilitySchema } from "./destination-contract";
import { destinationSelect, toDestinationDto, validateDestinationId, type DestinationDependencies } from "./destination-service";

export const destinationVisibilityInputSchema = z.object({ visibility: visibilitySchema }).strict();
export type DestinationVisibilityInput = z.infer<typeof destinationVisibilityInputSchema>;

export async function setDestinationVisibility(headers: Headers, id: string, body: unknown, key: string, deps: DestinationDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  validateDestinationId(id);
  const parsed = destinationVisibilityInputSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_DESTINATION_VISIBILITY", "Trạng thái hiển thị không hợp lệ.", 400);
  const input = parsed.data;
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: "destination:set-visibility", key, input: { id, ...input },
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const row = await tx.destination.findUnique({ where: { id }, select: destinationSelect });
      if (!row) throw new AppError("DESTINATION_NOT_FOUND", "Không tìm thấy điểm đến.", 404);
      // No rewrite/delete of the destination or its opening schedule. Same-state is a no-op.
      if (row.visibility === input.visibility) return toDestinationDto(row);
      return toDestinationDto(await tx.destination.update({ where: { id }, data: { visibility: input.visibility }, select: destinationSelect }));
    },
  });
}
