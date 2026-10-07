import { z } from "zod";

import { cultureIdSchema, sourceUrlSchema } from "./culture-contract";

const pageNumberSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/, "Trang không hợp lệ.")
  .transform(Number)
  .pipe(
    z
      .number()
      .int("Trang phải là số nguyên.")
      .min(1, "Trang phải lớn hơn hoặc bằng 1.")
      .max(10000, "Trang không được vượt quá 10000."),
  );

const pageSizeSchema = z
  .string()
  .regex(/^[1-9]\d?$/, "pageSize không hợp lệ.")
  .transform(Number)
  .pipe(
    z
      .number()
      .int("pageSize phải là số nguyên.")
      .min(1, "pageSize phải từ 1 đến 50.")
      .max(50, "pageSize phải từ 1 đến 50."),
  );

export const publicCultureQueryObjectSchema = z
  .object({
    q: z.string().trim().max(200, "q không được dài quá 200 ký tự.").optional(),
    destinationId: cultureIdSchema.optional(),
    page: pageNumberSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

export const publicCultureIdentifierSchema = cultureIdSchema;

export const publicCultureSourceSchema = z
  .object({
    title: z.string().max(300).nullable(),
    url: sourceUrlSchema,
    citation: z.string().nullable(),
    sortOrder: z.literal(0),
  })
  .strict();

export const publicCultureDestinationSchema = z
  .object({
    id: cultureIdSchema,
    slug: cultureIdSchema,
    name: z.string().min(1).max(200),
  })
  .strict();

export const publicCultureListItemSchema = z
  .object({
    id: cultureIdSchema,
    slug: cultureIdSchema,
    title: z.string().min(1).max(200),
    summary: z.string().max(280),
    coverImageUrl: z.null(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const publicCulturePageInfoSchema = z
  .object({
    page: z.number().int().min(1).max(10000),
    pageSize: z.number().int().min(1).max(50),
    hasNextPage: z.boolean(),
  })
  .strict();

export const publicCultureListResponseSchema = z
  .object({
    items: z.array(publicCultureListItemSchema).max(50),
    pageInfo: publicCulturePageInfoSchema,
  })
  .strict();

export const publicCultureDetailSchema = publicCultureListItemSchema
  .extend({
    body: z.string().min(1),
    sources: z.array(publicCultureSourceSchema).max(1),
    destinations: z.array(publicCultureDestinationSchema).max(20),
  })
  .strict();

export type PublicCultureQuery = z.infer<typeof publicCultureQueryObjectSchema>;

function validationError(details: unknown): never {
  throw new Error(JSON.stringify(details));
}

export function parsePublicCultureQuery(params: URLSearchParams): PublicCultureQuery {
  const allowed = new Set(["q", "destinationId", "page", "pageSize"]);
  const values: Record<string, string> = {
    page: params.get("page") ?? "1",
    pageSize: params.get("pageSize") ?? "12",
  };
  const issues: Array<{ path: string[]; message: string }> = [];

  for (const key of new Set(params.keys())) {
    const entries = params.getAll(key);
    if (!allowed.has(key)) {
      issues.push({ path: [key], message: "Tham số không được hỗ trợ." });
      continue;
    }
    if (entries.length !== 1) {
      issues.push({ path: [key], message: "Tham số không được lặp lại." });
      continue;
    }
    values[key] = entries[0] ?? "";
  }

  const parsed = publicCultureQueryObjectSchema.safeParse({
    ...values,
    ...(values.q?.trim() ? { q: values.q } : {}),
    ...(values.destinationId ? { destinationId: values.destinationId } : {}),
  });

  if (!parsed.success || issues.length > 0) {
    validationError([
      ...issues,
      ...(parsed.success
        ? []
        : parsed.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          }))),
    ]);
  }

  return parsed.data;
}
