import { describe, it, expect } from "vitest";
import { v3TestStore } from "./__fixtures__/v3-store";
import { writeDestination, getDestination } from "./destination-service";
import {
  destinationDraft,
  destinationDraftPayload,
} from "@/app/admin/destinations/destination-v3-form-model";
import { unknownSchedule } from "./destination-contract";
const input = {
  formVersion: "V3",
  name: "TEST POI",
  description: "TEST prose",
  category: "chợ phiên",
  googleMapsUrl: "https://google.com/maps?q=23,105",
};
const headers = new Headers();
async function legacy() {
  const f = v3TestStore();
  const r = await writeDestination(
    headers,
    {
      name: "Legacy",
      description: "Legacy",
      area: "đồng văn",
      category: "legacy",
      latitude: 23,
      longitude: 105,
      suggestedDurationMinutes: null,
      minimumDurationMinutes: null,
      openingDays: unknownSchedule(),
      profile: {
        shortDescription: "Legacy summary",
        ticketPrice: "100",
        cultureIds: ["culture"],
        areaIds: ["area"],
        sources: [
          {
            title: "Source",
            url: "https://example.org",
            websiteRights: "APPROVED",
            rightsEvidence: "Grant",
          },
        ],
        media: [{ url: "https://example.org/image", alt: "Image" }],
      },
    },
    "legacy",
    null,
    f.deps,
  );
  if (r.status !== "SUCCESS") throw Error("fixture");
  return { f, id: r.data.id };
}
describe("V3 service transactions with TEST persistence adapter (not PostgreSQL)", () => {
  it("editing an interval end keeps the day and interval IDs in place", async () => {
    const { f, id } = await legacy();
    const days = unknownSchedule();
    days[0] = {
      dayOfWeek: "MONDAY",
      status: "OPEN",
      intervals: [{ opensAt: "08:00", closesAt: "10:00" }],
    };
    await writeDestination(
      headers,
      { formVersion: "V3", openingDays: days },
      "hours-create",
      id,
      f.deps,
    );
    const before = structuredClone(f.rows().get(id).openingDays);
    days[0]!.intervals[0]!.closesAt = "11:00";
    await writeDestination(
      headers,
      { formVersion: "V3", openingDays: days },
      "hours-end",
      id,
      f.deps,
    );
    const after = f.rows().get(id).openingDays;
    expect(after.map((d: any) => d.id)).toEqual(before.map((d: any) => d.id));
    expect(after[0].intervals[0].id).toBe(before[0].intervals[0].id);
    expect(after[0].intervals[0].closesAtMinute).toBe(660);
  });
  it("stored success replays before resolver admission, even after many exact retries", async () => {
    const f = v3TestStore();
    expect(
      (
        await writeDestination(
          headers,
          input,
          "replay-before-provider",
          null,
          f.deps,
        )
      ).status,
    ).toBe("SUCCESS");
    for (let n = 0; n < 15; n++)
      expect(
        (
          await writeDestination(
            headers,
            input,
            "replay-before-provider",
            null,
            f.deps,
          )
        ).status,
      ).toBe("SUCCESS");
    expect(f.rows().size).toBe(1);
  });
  it("create defaults hidden, server derives coordinates/summary, replay does not duplicate", async () => {
    const f = v3TestStore();
    const r = await writeDestination(headers, input, "create", null, f.deps);
    expect(r.status).toBe("SUCCESS");
    if (r.status !== "SUCCESS") return;
    expect(r.data).toMatchObject({
      area: "khu vực hà giang",
      visibility: "HIDDEN",
      latitude: 23,
      longitude: 105,
      profile: { shortDescription: "TEST prose" },
    });
    await writeDestination(headers, input, "create", null, f.deps);
    expect(f.rows().size).toBe(1);
  });
  it("no-change edit retains entire legacy record; omitted hidden fields are never reset", async () => {
    const { f, id } = await legacy();
    const before = structuredClone(f.rows().get(id));
    const dto = await getDestination(headers, id, f.deps);
    expect(
      (
        await writeDestination(
          headers,
          destinationDraftPayload(destinationDraft(dto), dto),
          "noop",
          id,
          f.deps,
        )
      ).status,
    ).toBe("SUCCESS");
    expect(f.rows().get(id)).toEqual(before);
  });
  it("description-only update keeps source/media IDs, reviewer, relations, hours, coords and price", async () => {
    const { f, id } = await legacy();
    const before = structuredClone(f.rows().get(id));
    await writeDestination(
      headers,
      { formVersion: "V3", description: "New prose" },
      "prose",
      id,
      f.deps,
    );
    const after = f.rows().get(id);
    expect(after.shortDescription).toBe("New prose");
    for (const k of [
      "sources",
      "media",
      "areas",
      "cultureLinks",
      "openingDays",
      "latitude",
      "longitude",
      "ticketPrice",
    ])
      expect(after[k]).toEqual(before[k]);
  });
  it("source update preserves ID/reviewer; ownership forgery fails atomically", async () => {
    const { f, id } = await legacy();
    const source = f.rows().get(id).sources[0];
    await writeDestination(
      headers,
      {
        formVersion: "V3",
        sources: [{ id: source.id, title: "Renamed", url: source.url }],
      },
      "rename",
      id,
      f.deps,
    );
    expect(f.rows().get(id).sources[0]).toMatchObject({
      id: source.id,
      reviewedBy: source.reviewedBy,
      reviewedAt: source.reviewedAt,
    });
    const before = structuredClone(f.rows().get(id));
    expect(
      (
        await writeDestination(
          headers,
          {
            formVersion: "V3",
            name: "Changed",
            sources: [
              { id: "foreign", title: "X", url: "https://example.org" },
            ],
          },
          "forged",
          id,
          f.deps,
        )
      ).status,
    ).toBe("FAILED");
    expect(f.rows().get(id)).toEqual(before);
  });
  it("injected failure AFTER nested mutations rolls back parent, children and idempotency", async () => {
    const { f, id } = await legacy();
    const before = structuredClone(f.rows().get(id)),
      count = f.records().size;
    f.failNext();
    expect(
      (
        await writeDestination(
          headers,
          {
            formVersion: "V3",
            description: "Changed",
            sources: [{ title: "New source", url: "https://example.org/new" }],
          },
          "rollback",
          id,
          f.deps,
        )
      ).status,
    ).toBe("FAILED");
    expect(f.rows().get(id)).toEqual(before);
    expect(f.records().size).toBe(count);
  });
  it("rejects unresolved URL/forged coordinates and preserves prior position", async () => {
    const { f, id } = await legacy();
    const before = structuredClone(f.rows().get(id));
    for (const body of [
      {
        formVersion: "V3",
        googleMapsUrl: "https://google.com/maps/@23,105,10z",
      },
      { ...input, latitude: 0 },
    ])
      await expect(
        writeDestination(headers, body, "invalid", id, f.deps),
      ).rejects.toMatchObject({ status: 400 });
    expect(f.rows().get(id)).toEqual(before);
  });
  it("stale version returns FAILED409 and guest/traveler are denied", async () => {
    const { f, id } = await legacy();
    const r = await writeDestination(
      headers,
      {
        formVersion: "V3",
        name: "Changed",
        expectedUpdatedAt: "2000-01-01T00:00:00Z",
      },
      "stale",
      id,
      f.deps,
    );
    expect(r).toMatchObject({ status: "FAILED", httpStatus: 409 });
    for (const role of [null, "TRAVELER"])
      await expect(
        writeDestination(
          headers,
          input,
          "denied",
          null,
          v3TestStore(role).deps,
        ),
      ).rejects.toMatchObject({ status: role ? 403 : 401 });
  });
});
