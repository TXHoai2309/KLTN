import type { Prisma } from "@KLTN/db";
export const visibleCultureWhere = { visibility: "VISIBLE" } as const satisfies Prisma.CultureContentWhereInput;
export function isCulturePublic(record: { visibility: "HIDDEN" | "VISIBLE" }) { return record.visibility === visibleCultureWhere.visibility; }
export const publicCultureSelect = { id: true, title: true, content: true, sourceTitle: true, sourceUrl: true } satisfies Prisma.CultureContentSelect;
