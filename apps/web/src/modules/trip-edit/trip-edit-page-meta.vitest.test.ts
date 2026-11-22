import type { Database } from "@KLTN/db";
import { describe, expect, it, vi } from "vitest";

import { loadPublicCatalogMeta } from "./trip-edit-page-meta";

describe("loadPublicCatalogMeta", () => {
  it("queries only VISIBLE non-deleted destinations and formats opening intervals", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "d1",
        suggestedDurationMinutes: 90,
        minimumDurationMinutes: 45,
        isOutdoor: true,
        openingDays: [
          {
            dayOfWeek: "TUESDAY" as const,
            status: "OPEN" as const,
            intervals: [{ opensAtMinute: 450, closesAtMinute: 1050 }],
          },
        ],
      },
    ]);
    const database = { destination: { findMany } } as unknown as Pick<Database, "destination">;

    const result = await loadPublicCatalogMeta(database);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: "VISIBLE", deletedAt: null },
      }),
    );
    expect(result).toEqual({
      d1: {
        suggestedDurationMinutes: 90,
        minimumDurationMinutes: 45,
        isOutdoor: true,
        openingDays: [
          {
            dayOfWeek: "TUESDAY",
            status: "OPEN",
            intervals: [{ opensAt: "07:30", closesAt: "17:30" }],
          },
        ],
      },
    });
  });
});
