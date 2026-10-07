import { z } from "zod";

import { AppError } from "@/server/http/app-error";

export const favoriteUrlTargetTypeSchema = z.enum(["destinations", "culture"]);

const favoriteTargetIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{1,128}$/, "ID yêu thích không hợp lệ.");

export const favoriteTargetSchema = z
  .object({
    targetType: favoriteUrlTargetTypeSchema,
    targetId: favoriteTargetIdSchema,
  })
  .strict();

export type FavoriteTarget = z.infer<typeof favoriteTargetSchema>;
export type FavoriteUrlTargetType = z.infer<
  typeof favoriteUrlTargetTypeSchema
>;

export const favoriteResultSchema = z
  .object({
    targetType: favoriteUrlTargetTypeSchema,
    targetId: favoriteTargetIdSchema,
    isFavorite: z.boolean(),
    changed: z.boolean(),
  })
  .strict();

export type FavoriteResult = z.infer<typeof favoriteResultSchema>;

function invalidTarget(details?: unknown): never {
  throw new AppError(
    "INVALID_FAVORITE_TARGET",
    "Đối tượng yêu thích không hợp lệ.",
    400,
    details,
  );
}

export function parseFavoriteTarget(input: unknown): FavoriteTarget {
  const parsed = favoriteTargetSchema.safeParse(input);
  if (!parsed.success) {
    invalidTarget(parsed.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
    })));
  }
  return parsed.data;
}

export function parseFavoriteTargetQuery(request: Request): FavoriteTarget {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["targetType", "targetId"]);
  const issues: Array<{ path: string[]; message: string }> = [];
  const values: Record<string, string> = {};

  for (const key of new Set(params.keys())) {
    const entries = params.getAll(key);
    if (!allowed.has(key)) {
      issues.push({
        path: [key],
        message: "Tham số không được hỗ trợ.",
      });
      continue;
    }
    if (entries.length !== 1) {
      issues.push({
        path: [key],
        message: "Tham số không được lặp lại.",
      });
      continue;
    }
    values[key] = entries[0] ?? "";
  }

  if (issues.length > 0) invalidTarget(issues);
  return parseFavoriteTarget(values);
}
