import { describe, expect, it, vi } from "vitest";

import { createPetrolimexFuelPrice, pickFuelPrice } from "./tripsage-fuel-price";

const body = { Objects: [
  { Title: "Xăng E10 RON 95-V", Zone1Price: 21100, Zone2Price: 21520, LastModified: "2026-11-19T07:59:23.617Z" },
  { Title: "DO 0,05S-II", Zone2Price: 26860, LastModified: "2026-11-19T07:56:27.785Z" },
  { Title: "Xăng E5 RON 92-II", Zone2Price: 18940, LastModified: "2026-11-19T07:54:25.339Z" },
] };
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

describe("tripsage-fuel-price (ADR-46)", () => {
  it("prefers E5 RON 92 zone-2 price, never diesel, and reads the date", () => {
    expect(pickFuelPrice(body)).toEqual({ vndPerLiter: 18940, fuelName: "Xăng E5 RON 92-II", asOf: "2026-11-19", source: "Petrolimex vùng 2" });
  });
  it("falls back to RON 95 and rejects missing or absurd prices", () => {
    expect(pickFuelPrice({ Objects: [body.Objects[0]] })?.vndPerLiter).toBe(21520);
    expect(pickFuelPrice({ Objects: [{ Title: "Xăng E5 RON 92-II", Zone2Price: 5 }] })).toBeNull();
    expect(pickFuelPrice({ nope: true })).toBeNull();
  });
  it("calls the source once per six hours and keeps a stale price when the source fails", async () => {
    let clock = 0;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(body)).mockRejectedValue(new Error("down"));
    const lookup = createPetrolimexFuelPrice({ fetcher, now: () => clock });
    expect((await lookup())?.vndPerLiter).toBe(18940);
    clock = 60 * 60 * 1000;
    expect((await lookup())?.vndPerLiter).toBe(18940);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock = 7 * 60 * 60 * 1000;
    expect((await lookup())?.vndPerLiter).toBe(18940);
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock = 49 * 60 * 60 * 1000;
    expect(await lookup()).toBeNull();
  });
  it("returns null on a bad status", async () => {
    const lookup = createPetrolimexFuelPrice({ fetcher: async () => new Response("no", { status: 503 }), now: () => 0 });
    expect(await lookup()).toBeNull();
  });
});
