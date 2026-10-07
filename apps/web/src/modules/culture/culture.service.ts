import type { Database, Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { apiSuccess } from "@/server/http/api-response";
import { handleApiError } from "@/server/http/error-handler";
import { visibleDestinationWhere } from "../destination/destination-eligibility";
import { visibleCultureWhere } from "./culture-eligibility";
import {
  publicCultureDetailSchema,
  publicCultureListResponseSchema,
  publicCultureIdentifierSchema,
  publicCultureSourceSchema,
  parsePublicCultureQuery,
} from "./culture.schema";
import type {
  PublicCultureDetail,
  PublicCultureListResponse,
  PublicCultureQuery,
} from "./culture.types";
import { cultureExcerpt } from "./public-culture-list";

export type CultureDatabase = Pick<Database, "cultureContent">;

const publicCultureDestinations = {
  where: { destination: visibleDestinationWhere },
  take: 20,
  orderBy: { destinationId: "asc" },
  select: { destination: { select: { id: true, name: true } } },
} satisfies Prisma.CultureContentSelect["destinations"];

const publicCultureSelect = {
  id: true,
  title: true,
  content: true,
  sourceTitle: true,
  sourceUrl: true,
  updatedAt: true,
  destinations: publicCultureDestinations,
} satisfies Prisma.CultureContentSelect;

type PublicCultureRow = Prisma.CultureContentGetPayload<{
  select: typeof publicCultureSelect;
}>;

function publicSource(row: Pick<PublicCultureRow, "sourceTitle" | "sourceUrl">) {
  const sourceUrl = publicCultureSourceSchema.shape.url.safeParse(
    row.sourceUrl,
  ).success
    ? row.sourceUrl
    : null;

  if (!row.sourceTitle && !sourceUrl) return [];

  return [
    {
      title: row.sourceTitle,
      url: sourceUrl,
      citation: null,
      sortOrder: 0 as const,
    },
  ];
}

function publicIdentifier(id: string) {
  // The accepted schema has no slug column. Keep the API's public identifier
  // stable without inventing a slug value or changing the database contract.
  return id;
}

function toListItem(row: PublicCultureRow) {
  return {
    id: row.id,
    slug: publicIdentifier(row.id),
    title: row.title,
    summary: cultureExcerpt(row.content),
    coverImageUrl: null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: PublicCultureRow): PublicCultureDetail {
  return publicCultureDetailSchema.parse({
    ...toListItem(row),
    body: row.content,
    sources: publicSource(row),
    destinations: row.destinations.map(({ destination }) => ({
      id: destination.id,
      slug: publicIdentifier(destination.id),
      name: destination.name,
    })),
  });
}

function publicWhere(query: PublicCultureQuery): Prisma.CultureContentWhereInput {
  return {
    ...visibleCultureWhere,
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            // summary is a deterministic projection of content in the
            // accepted schema, so search uses the same stored prose.
            { content: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.destinationId
      ? {
          destinations: {
            some: {
              destinationId: query.destinationId,
              destination: visibleDestinationWhere,
            },
          },
        }
      : {}),
  };
}

function toValidationError(error: unknown): AppError {
  let details: unknown = undefined;
  try {
    details = JSON.parse(error instanceof Error ? error.message : "");
  } catch {
    details = undefined;
  }
  return new AppError(
    "VALIDATION_ERROR",
    "Tham số truy vấn không hợp lệ.",
    400,
    details,
  );
}

export async function listPublicCulture(
  query: PublicCultureQuery,
  database: CultureDatabase,
): Promise<PublicCultureListResponse> {
  const rows = await database.cultureContent.findMany({
    where: publicWhere(query),
    select: publicCultureSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize + 1,
  });
  const items = rows.slice(0, query.pageSize).map(toListItem);

  return publicCultureListResponseSchema.parse({
    items,
    pageInfo: {
      page: query.page,
      pageSize: query.pageSize,
      hasNextPage: rows.length > query.pageSize,
    },
  });
}

export async function getPublicCulture(
  idOrSlug: string,
  database: CultureDatabase,
): Promise<PublicCultureDetail> {
  const parsed = publicCultureIdentifierSchema.safeParse(idOrSlug);
  if (!parsed.success) {
    throw new AppError(
      "CULTURE_CONTENT_UNAVAILABLE",
      "Nội dung không khả dụng",
      404,
    );
  }

  const row = await database.cultureContent.findFirst({
    where: { id: parsed.data, ...visibleCultureWhere },
    select: publicCultureSelect,
  });
  if (!row) {
    throw new AppError(
      "CULTURE_CONTENT_UNAVAILABLE",
      "Nội dung không khả dụng",
      404,
    );
  }
  return toDetail(row);
}

export async function publicCultureResponse(
  request: Request,
  database: CultureDatabase,
) {
  let response: Response;
  try {
    let query;
    try {
      query = parsePublicCultureQuery(new URL(request.url).searchParams);
    } catch (error) {
      throw toValidationError(error);
    }
    response = apiSuccess(await listPublicCulture(query, database));
  } catch (error) {
    response = handleApiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const publicCultureListResponse = publicCultureResponse;

export async function publicCultureDetailResponse(
  idOrSlug: string,
  database: CultureDatabase,
) {
  let response: Response;
  try {
    response = apiSuccess(await getPublicCulture(idOrSlug, database));
  } catch (error) {
    response = handleApiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
