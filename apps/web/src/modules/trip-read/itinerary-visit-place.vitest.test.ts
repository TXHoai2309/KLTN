import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { itineraryVisitPlaceRef, requireDestinationVisits } from "./itinerary-visit-place";

describe("ItineraryVisit place reference (destination XOR external place)", () => {
  it("resolves exactly one reference", () => {
    expect(itineraryVisitPlaceRef({ destinationId: "d1", externalPlaceId: null })).toEqual({ kind: "DESTINATION", id: "d1" });
    expect(itineraryVisitPlaceRef({ destinationId: null, externalPlaceId: "e1" })).toEqual({ kind: "EXTERNAL", id: "e1" });
  });
  it("rejects both or neither", () => {
    expect(() => itineraryVisitPlaceRef({ destinationId: "d1", externalPlaceId: "e1" })).toThrow();
    expect(() => itineraryVisitPlaceRef({ destinationId: null, externalPlaceId: null })).toThrow();
    expect(() => itineraryVisitPlaceRef({ destinationId: "", externalPlaceId: null })).toThrow();
  });
  it("destination-only readers pass legacy rows and fail closed on external visits", () => {
    const legacy = { days: [{ visits: [{ id: "v", destinationId: "d1", destination: { id: "d1" } }] }] };
    expect(requireDestinationVisits(legacy)).toBe(legacy);
    const external = { days: [{ visits: [{ id: "v", destinationId: null, destination: null }] }] };
    expect(() => requireDestinationVisits(external)).toThrow(/EXTERNAL_PLACE_UNSUPPORTED|địa điểm/);
  });
});

describe("external_place migration", () => {
  const sql = readFileSync(resolve(__dirname, "../../../../../packages/db/prisma/migrations/20261114120000_external_place/migration.sql"), "utf8");
  it("enforces exactly one reference with a CHECK and keeps provider place id unique", () => {
    expect(sql).toMatch(/CHECK \(num_nonnulls\("destinationId", "externalPlaceId"\) = 1\)/);
    expect(sql).toMatch(/ALTER COLUMN "destinationId" DROP NOT NULL/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "external_place_provider_providerPlaceId_key"/);
    expect(sql).toMatch(/ON DELETE RESTRICT/);
  });
  it("is additive: no drops or data rewrites", () => {
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM|UPDATE "/);
  });
});
