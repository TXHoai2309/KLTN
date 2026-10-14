import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../../packages/db/prisma/generated/client";
import type { Database } from "@KLTN/db";
import {
  writeDestination,
  getDestination,
  type DestinationDependencies,
} from "./destination-service";
import { getPublicDestination } from "./public-destination-service";
import { listPublicLocations } from "./public-destination-list";
import { setDestinationVisibility } from "./destination-visibility";
import { unknownSchedule } from "./destination-contract";
import {
  destinationDraft,
  destinationDraftPayload,
} from "@/app/admin/destinations/destination-v3-form-model";
import { retrievePlannerCandidates } from "../trip-planner/planner-candidates";

const url = process.env.US19_TASK184_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "Destination V3 real transactions on verified disposable PostgreSQL",
  () => {
    let db: PrismaClient, deps: DestinationDependencies, id: string;
    const headers = new Headers();
    const snapshot = () =>
      db.destination.findUniqueOrThrow({
        where: { id },
        include: {
          sources: true,
          media: true,
          areas: true,
          cultureLinks: true,
          openingDays: {
            orderBy: { dayOfWeek: "asc" },
            include: { intervals: true },
          },
          ragOrigins: true,
        },
      });
    beforeAll(async () => {
      const target = new URL(url!);
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
        target.username !== "task184_test" ||
        target.pathname !== "/task184_test" ||
        process.env.US19_TASK184_TEST_DISPOSABLE !==
          "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_TEST_DATABASE"
      )
        throw Error("Disposable loopback required");
      db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const actor = randomUUID();
      await db.user.create({
        data: {
          id: actor,
          name: "TEST Admin",
          email: actor + "@example.invalid",
          role: "ADMIN",
        },
      });
      deps = {
        database: db as Database,
        resolveSession: async () => ({ user: { id: actor } }),
      };
      const area = await db.area.create({ data: { name: randomUUID() } }),
        culture = await db.cultureContent.create({
          data: { title: "TEST Culture", content: "Knowledge retained" },
        });
      const result = await writeDestination(
        headers,
        {
          name: "TEST Legacy region",
          description: "Legacy prose",
          area: "đồng văn",
          category: "legacy category",
          latitude: 23,
          longitude: 105,
          suggestedDurationMinutes: 60,
          minimumDurationMinutes: 30,
          openingDays: unknownSchedule(),
          profile: {
            shortDescription: "Legacy summary",
            address: "Địa chỉ lịch sử",
            ticketPrice: "100",
            ticketVerification: "VERIFIED",
            ticketEvidence: "Legacy ticket source",
            aliases: ["Historical name"],
            cultureIds: [culture.id],
            areaIds: [area.id],
            sources: [
              {
                title: "Approved source",
                url: "https://example.org/old",
                websiteRights: "APPROVED",
                rightsEvidence: "TEST grant",
              },
            ],
            media: [
              {
                url: "https://example.org/image",
                alt: "Legacy image",
                websiteRights: "APPROVED",
                rightsEvidence: "TEST image grant",
              },
            ],
          },
        },
        randomUUID(),
        null,
        deps,
      );
      if (result.status !== "SUCCESS") throw Error("fixture create failed");
      id = result.data.id;
    });
    afterAll(async () => {
      await db?.$disconnect();
    });
    it("no-change V3 edit is byte-equivalent including timestamps, child IDs and reviewers", async () => {
      const before = await snapshot();
      const dto = await getDestination(headers, id, deps);
      expect(
        (
          await writeDestination(
            headers,
            destinationDraftPayload(destinationDraft(dto), dto),
            randomUUID(),
            id,
            deps,
          )
        ).status,
      ).toBe("SUCCESS");
      expect(await snapshot()).toEqual(before);
    });
    it("legacy full edit and nested profile omission retain IDs and metadata", async () => {
      const before = await snapshot();
      const dto = await getDestination(headers, id, deps);
      const { id: _, visibility, createdAt, updatedAt, ...input } = dto;
      expect(
        (await writeDestination(headers, input, randomUUID(), id, deps)).status,
      ).toBe("SUCCESS");
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await writeDestination(
            headers,
            { profile: { address: before.address } },
            randomUUID(),
            id,
            deps,
          )
        ).status,
      ).toBe("SUCCESS");
      expect(await snapshot()).toEqual(before);
    });
    it("description update derives summary atomically and preserves all hidden relations", async () => {
      const before = await snapshot();
      const key = randomUUID();
      const payload = {
        formVersion: "V3",
        description: "Mô tả mới. Chi tiết.",
      };
      expect(
        (await writeDestination(headers, payload, key, id, deps)).status,
      ).toBe("SUCCESS");
      const after = await snapshot();
      expect(after.shortDescription).toBe("Mô tả mới. Chi tiết.");
      for (const k of [
        "sources",
        "media",
        "areas",
        "cultureLinks",
        "openingDays",
        "ragOrigins",
        "ticketPrice",
        "ticketEvidence",
        "address",
        "latitude",
        "longitude",
        "visibility",
        "area",
      ] as const)
        expect(after[k]).toEqual(before[k]);
      expect(
        (await writeDestination(headers, payload, key, id, deps)).status,
      ).toBe("SUCCESS");
      expect(await snapshot()).toEqual(after);
    });
    it("same source update keeps ID/review metadata; foreign source ID fails and rolls back", async () => {
      const before = await snapshot();
      const source = before.sources[0]!;
      expect(
        (
          await writeDestination(
            headers,
            {
              formVersion: "V3",
              sources: [
                { id: source.id, title: "Renamed source", url: source.url },
              ],
            },
            randomUUID(),
            id,
            deps,
          )
        ).status,
      ).toBe("SUCCESS");
      const after = await snapshot();
      expect(after.sources[0]).toMatchObject({
        id: source.id,
        reviewedBy: source.reviewedBy,
        reviewedAt: source.reviewedAt,
        websiteRights: source.websiteRights,
      });
      const bad = await writeDestination(
        headers,
        {
          formVersion: "V3",
          description: "Must rollback",
          sources: [{ id: "foreign", title: "X", url: "https://example.org" }],
        },
        randomUUID(),
        id,
        deps,
      );
      expect(bad.status).toBe("FAILED");
      expect(await snapshot()).toEqual(after);
    });
    it("failed Maps URL and invalid category preserve every field; legacy category is retained", async () => {
      const before = await snapshot();
      await expect(
        writeDestination(
          headers,
          {
            formVersion: "V3",
            googleMapsUrl: "https://google.com/maps/@23,105,10z",
          },
          randomUUID(),
          id,
          deps,
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        writeDestination(
          headers,
          { formVersion: "V3", category: "unapproved" },
          randomUUID(),
          id,
          deps,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(await snapshot()).toEqual(before);
      expect((await getDestination(headers, id, deps)).category).toBe(
        "legacy category",
      );
    });
    it("create resolves explicit coordinates, is HIDDEN and absent from public list/detail", async () => {
      const payload = {
        formVersion: "V3",
        name: "TEST Lũng Cú POI",
        category: "thiên nhiên – thắng cảnh",
        description: "TEST only",
        googleMapsUrl: "https://google.com/maps?q=23.391,105.308",
      };
      const result = await writeDestination(
        headers,
        payload,
        randomUUID(),
        null,
        deps,
      );
      expect(result.status).toBe("SUCCESS");
      if (result.status !== "SUCCESS") throw Error("create failed");
      expect(result.data).toMatchObject({
        visibility: "HIDDEN",
        latitude: 23.391,
        longitude: 105.308,
        area: "khu vực hà giang",
      });
      expect(
        (await listPublicLocations({}, db as Database)).items.some(
          (d) => d.id === result.data.id,
        ),
      ).toBe(false);
      await expect(
        getPublicDestination(result.data.id, db as Database),
      ).rejects.toMatchObject({ status: 410 });
    });
    it("registry excludes only the supplied reviewed region; visible normal POI remains candidate", async () => {
      await setDestinationVisibility(
        headers,
        id,
        { visibility: "VISIBLE" },
        randomUUID(),
        deps,
      );
      const input = {
        name: "TEST POI",
        description: "Test",
        area: "khu vực hà giang",
        category: "Test",
        latitude: 23,
        longitude: 105,
        suggestedDurationMinutes: 60,
        minimumDurationMinutes: 30,
        openingDays: unknownSchedule(),
      };
      const poi = await writeDestination(
        headers,
        input,
        randomUUID(),
        null,
        deps,
      );
      if (poi.status !== "SUCCESS") throw Error("fixture failed");
      await setDestinationVisibility(
        headers,
        poi.data.id,
        { visibility: "VISIBLE" },
        randomUUID(),
        deps,
      );
      const candidates = await retrievePlannerCandidates(
        db as Database,
        undefined,
        [id],
      );
      expect(candidates.some((c) => c.id === id)).toBe(false);
      expect(candidates.some((c) => c.id === poi.data.id)).toBe(true);
      expect(await getPublicDestination(id, db as Database)).toMatchObject({
        id,
      });
    });
    it("changed opening day preserves other day IDs and retained interval IDs", async () => {
      const before = await snapshot();
      const days = unknownSchedule();
      days[0] = {
        dayOfWeek: "MONDAY",
        status: "OPEN",
        intervals: [{ opensAt: "08:00", closesAt: "10:00" }],
      };
      expect(
        (
          await writeDestination(
            headers,
            { formVersion: "V3", openingDays: days },
            randomUUID(),
            id,
            deps,
          )
        ).status,
      ).toBe("SUCCESS");
      const first = await snapshot();
      expect(first.openingDays.map((d) => d.id)).toEqual(
        before.openingDays.map((d) => d.id),
      );
      days[0]!.intervals.push({ opensAt: "11:00", closesAt: "12:00" });
      expect(
        (
          await writeDestination(
            headers,
            { formVersion: "V3", openingDays: days },
            randomUUID(),
            id,
            deps,
          )
        ).status,
      ).toBe("SUCCESS");
      const next = await snapshot();
      expect(
        next.openingDays
          .find((d) => d.dayOfWeek === "MONDAY")
          ?.intervals.map((i) => i.id),
      ).toContain(
        first.openingDays.find((d) => d.dayOfWeek === "MONDAY")!.intervals[0]!
          .id,
      );
    });
    it("stale edit fails without changing content; guest/traveler cannot write", async () => {
      const before = await snapshot();
      const stale = await writeDestination(
        headers,
        {
          formVersion: "V3",
          name: "Stale",
          expectedUpdatedAt: "2000-01-01T00:00:00Z",
        },
        randomUUID(),
        id,
        deps,
      );
      expect(stale.status).toBe("FAILED");
      expect(await snapshot()).toEqual(before);
      await expect(
        writeDestination(headers, { formVersion: "V3" }, randomUUID(), id, {
          ...deps,
          resolveSession: async () => null,
        }),
      ).rejects.toMatchObject({ status: 401 });
      const traveler = randomUUID();
      await db.user.create({
        data: {
          id: traveler,
          name: "TEST Traveler",
          email: traveler + "@example.invalid",
          role: "TRAVELER",
        },
      });
      await expect(
        writeDestination(headers, { formVersion: "V3" }, randomUUID(), id, {
          ...deps,
          resolveSession: async () => ({ user: { id: traveler } }),
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
