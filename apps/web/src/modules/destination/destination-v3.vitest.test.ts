import { describe, it, expect } from "vitest";
import { shortDescription } from "./short-description";
import {
  destinationV3CreateSchema,
  destinationV3PatchSchema,
} from "./destination-v3-contract";
import {
  DESTINATION_DESCRIPTION_MAX_LENGTH,
  destinationDtoSchema,
  unknownSchedule,
} from "./destination-contract";
import {
  destinationDraft,
  destinationDraftPayload,
} from "@/app/admin/destinations/destination-v3-form-model";
import { legacyProfileChanges, openingChanges } from "./destination-safe-write";
import { destinationProfileSchema } from "../content-profile/content-profile-contract";
import { selectPlannerDays } from "../trip-planner/planner-engine";
import {
  candidate,
  requirement,
} from "../trip-planner/__fixtures__/planner-fixtures";
import { DEFAULT_DESTINATION_AREA } from "./destination-categories";
import { destinationResponseDto } from "./destination-http";

const dto = () =>
  destinationDtoSchema.parse({
    id: "legacy",
    name: "Legacy",
    description: "Mô tả cũ",
    area: "đồng văn",
    category: "legacy category",
    latitude: 23,
    longitude: 105,
    suggestedDurationMinutes: null,
    minimumDurationMinutes: null,
    openingDays: unknownSchedule(),
    visibility: "VISIBLE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    profile: {
      shortDescription: "Tóm tắt cũ",
      ticketPrice: "100",
      cultureIds: ["culture"],
      areaIds: ["area"],
      sources: [{ id: "source", title: "Nguồn cũ", url: null }],
      media: [
        { id: "image", url: "https://example.org/image", alt: "Old image" },
      ],
    },
  });
describe("Destination V3 safe form contract", () => {
  it("accepts long descriptions through create, patch and DTO contracts up to the shared bound", () => {
    const description = "x".repeat(DESTINATION_DESCRIPTION_MAX_LENGTH);
    const base = {
      formVersion: "V3" as const,
      name: "Long description",
      description,
      category: "văn hóa",
      googleMapsUrl: "https://google.com/maps/search/?query=23,105",
    };

    expect(destinationV3CreateSchema.safeParse(base).success).toBe(true);
    expect(
      destinationV3PatchSchema.safeParse({ formVersion: "V3", description })
        .success,
    ).toBe(true);
    expect(
      destinationDtoSchema.safeParse({
        ...dto(),
        description,
      }).success,
    ).toBe(true);
    expect(
      destinationV3CreateSchema.safeParse({
        ...base,
        description: `${description}x`,
      }).success,
    ).toBe(false);
  });
  it("legacy HTTP responses omit added child IDs; V3 explicitly requests them", () => {
    const value = dto();
    expect(
      destinationResponseDto(value, new Request("https://example.org")).profile
        ?.sources[0],
    ).not.toHaveProperty("id");
    expect(
      destinationResponseDto(
        value,
        new Request("https://example.org", {
          headers: { "X-KLTN-Form-Version": "V3" },
        }),
      ).profile?.sources[0]?.id,
    ).toBe("source");
  });
  it("generic default area cannot outrank the nearer candidate as if it were a local cluster", () => {
    const rows = [
      candidate("a", {
        latitude: 23,
        longitude: 105,
        area: DEFAULT_DESTINATION_AREA,
      }),
      candidate("b", { latitude: 23.005, longitude: 105, area: "locality" }),
      candidate("c", {
        latitude: 23.01,
        longitude: 105,
        area: DEFAULT_DESTINATION_AREA,
      }),
    ];
    expect(
      selectPlannerDays(
        { ...requirement, durationDays: 1, pace: "PACKED" },
        rows,
      )[0]?.map((c) => c.id),
    ).toEqual(["a", "b", "c"]);
  });
  it("no-change edit sends no hidden fields, children or generated summary", () => {
    const d = dto();
    expect(destinationDraftPayload(destinationDraft(d), d)).toEqual({
      formVersion: "V3",
      expectedUpdatedAt: d.updatedAt,
    });
  });
  it("description edit sends only edited prose and does not carry hidden replacements", () => {
    const d = dto();
    expect(
      destinationDraftPayload(
        { ...destinationDraft(d), description: "Mô tả mới" },
        d,
      ),
    ).toEqual({
      formVersion: "V3",
      expectedUpdatedAt: d.updatedAt,
      description: "Mô tả mới",
    });
  });
  it("source rename carries stable ID and explicit removal is separate", () => {
    const d = dto();
    const draft = destinationDraft(d);
    draft.sources[0] = {
      id: "source",
      title: "New",
      url: "https://example.org/source",
    };
    expect(destinationDraftPayload(draft, d).sources?.[0].id).toBe("source");
    expect(
      destinationDraftPayload({ ...draft, sources: [] }, d).removedSourceIds,
    ).toEqual(["source"]);
  });
  it("requires Maps on create, supports no-op edit and rejects forged location/visibility", () => {
    expect(
      destinationV3CreateSchema.safeParse({
        formVersion: "V3",
        name: "A",
        description: "B",
        category: "chợ phiên",
      }).success,
    ).toBe(false);
    expect(
      destinationV3PatchSchema.safeParse({ formVersion: "V3" }).success,
    ).toBe(true);
    for (const key of [
      "latitude",
      "longitude",
      "visibility",
      "locationVerified",
      "profile",
    ])
      expect(
        destinationV3PatchSchema.safeParse({ formVersion: "V3", [key]: true })
          .success,
      ).toBe(false);
  });
  it("rejects invalid source URLs, credentials and duplicate IDs", () => {
    for (const url of [
      "http://example.org",
      "https://user:pw@example.org",
      "https://127.0.0.1",
      "https://site.internal",
    ])
      expect(
        destinationV3PatchSchema.safeParse({
          formVersion: "V3",
          sources: [{ title: "A", url }],
        }).success,
      ).toBe(false);
    expect(
      destinationV3PatchSchema.safeParse({
        formVersion: "V3",
        sources: [
          { id: "same", title: "A", url: "https://example.org" },
          { id: "same", title: "B", url: "https://example.org" },
        ],
      }).success,
    ).toBe(false);
  });
  it("normalizes whitespace/markup and prefers complete sentences within bound", () => {
    expect(shortDescription("<b>Cảnh đẹp.</b>\n  Trải nghiệm.")).toBe(
      "Cảnh đẹp. Trải nghiệm.",
    );
    expect(shortDescription("Một câu hoàn chỉnh. " + "từ ".repeat(600))).toBe(
      "Một câu hoàn chỉnh.",
    );
    expect(shortDescription("từ ".repeat(600)).length).toBeLessThanOrEqual(
      1000,
    );
  });
  it("retains untouched legacy children and source review metadata", () => {
    const p = destinationProfileSchema.parse({
      sources: [
        {
          id: "s",
          title: "A",
          url: "https://example.org",
          websiteRights: "APPROVED",
          rightsEvidence: "Grant",
        },
      ],
      media: [],
      cultureIds: ["c"],
      areaIds: ["a"],
    });
    const previous = {
      sources: [
        {
          ...p.sources[0],
          id: "s",
          position: 0,
          reviewedBy: "old",
          reviewedAt: new Date(0),
        },
      ],
      media: [],
      cultureLinks: [{ cultureId: "c" }],
      areas: [{ id: "a" }],
    };
    expect(
      legacyProfileChanges(previous, p, "new", [
        "sources",
        "media",
        "cultureIds",
        "areaIds",
      ]),
    ).toEqual({});
  });
  it("rejects forged child ownership and updates retained source in place", () => {
    const p = destinationProfileSchema.parse({
      sources: [{ id: "s", title: "New", url: "https://example.org" }],
    });
    const change = legacyProfileChanges(
      { sources: [{ ...p.sources[0], id: "s", title: "Old", position: 0 }] },
      p,
      "actor",
      ["sources"],
    );
    expect(change).toEqual({
      sources: { update: [{ where: { id: "s" }, data: { title: "New" } }] },
    });
    expect(() =>
      legacyProfileChanges({ sources: [] }, p, "actor", ["sources"]),
    ).toThrow();
  });
  it("unchanged schedules produce no writes and changed day retains other days/intervals", () => {
    const days = unknownSchedule();
    const previous = days.map((d) => ({ ...d, intervals: [] }));
    expect(openingChanges(previous, days)).toEqual([]);
    days[0] = {
      dayOfWeek: "MONDAY",
      status: "OPEN",
      intervals: [{ opensAt: "08:00", closesAt: "10:00" }],
    };
    const changes = openingChanges(previous, days);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.where.dayOfWeek).toBe("MONDAY");
  });
});
