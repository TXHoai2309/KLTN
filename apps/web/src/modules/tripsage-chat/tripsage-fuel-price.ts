import "server-only";
import { z } from "zod";

/**
 * Retail petrol price for the cost estimate (ADR-46). Reads the public price table Petrolimex publishes through its portal
 * (zone 2 = mountain provinces such as Hà Giang). The endpoint and approach come from the MIT-licensed VietFuelAPI
 * (github.com/TranQui004/vietfuel-api, `backend/src/scrapers/petrolimex.js`, "Tier 0"); only this one source is ported, so nothing
 * has to be deployed next to the app. It is an undocumented endpoint: any failure returns `null` and the estimate keeps its
 * fixed reference price. The price is a reference for an estimate, never a quote, and never feeds the Constraint Validator.
 * NOT verified: Petrolimex terms of use for automated reads; the request is one cached call per instance every six hours.
 */
export const PETROLIMEX_PRICE_URL =
  "https://portals.petrolimex.com.vn/~apis/portals/cms.item/search?x-request=eyJGaWx0ZXJCeSI6eyJBbmQiOlt7IlN5c3RlbUlEIjp7IkVxdWFscyI6IjY3ODNkYzEyNzFmZjQ0OWU5NWI3NGE5NTIwOTY0MTY5In19LHsiUmVwb3NpdG9yeUlEIjp7IkVxdWFscyI6ImE5NTQ1MWUyM2I0NzRmZTU4ODZiZmI3Y2Y4NDNmNTNjIn19LHsiUmVwb3NpdG9yeUVudGl0eUlEIjp7IkVxdWFscyI6IjM4MDEzNzhmZTFlMDQ1YjFhZmExMGRlN2M1Nzc2MTI0In19LHsiU3RhdHVzIjp7IkVxdWFscyI6IlB1Ymxpc2hlZCJ9fV19LCJTb3J0QnkiOnsiTGFzdE1vZGlmaWVkIjoiRGVzY2VuZGluZyJ9LCJQYWdpbmF0aW9uIjp7IlRvdGFsUmVjb3JkcyI6LTEsIlRvdGFsUGFnZXMiOjAsIlBhZ2VTaXplIjowLCJQYWdlTnVtYmVyIjowfX0";

export type FuelPrice = { vndPerLiter: number; fuelName: string; asOf: string; source: "Petrolimex vùng 2" };
export type FuelPriceLookup = (signal?: AbortSignal) => Promise<FuelPrice | null>;

const TTL_MS = 6 * 60 * 60 * 1000;
const STALE_MAX_MS = 48 * 60 * 60 * 1000;
const TIMEOUT_MS = 6_000;
const MAX_BYTES = 512 * 1024;
const MIN_PRICE = 10_000;
const MAX_PRICE = 60_000;

const responseSchema = z.object({
  Objects: z.array(z.object({
    Title: z.string().max(120).optional(),
    Zone2Price: z.number().optional(),
    LastModified: z.string().max(40).optional(),
  }).passthrough()).max(60),
});

/** Petrol the traveler most likely buys: E5 RON 92 first, then any RON 95. Diesel and kerosene never match. */
const PREFERRED = [/E5\s*RON\s*92/iu, /RON\s*95/iu];

export function pickFuelPrice(body: unknown): FuelPrice | null {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return null;
  for (const pattern of PREFERRED) {
    const item = parsed.data.Objects.find(entry => entry.Title && pattern.test(entry.Title) && Number.isInteger(entry.Zone2Price) && entry.Zone2Price! >= MIN_PRICE && entry.Zone2Price! <= MAX_PRICE);
    if (item) {
      const asOf = item.LastModified?.slice(0, 10) ?? "";
      return { vndPerLiter: item.Zone2Price!, fuelName: item.Title!.trim(), asOf: /^\d{4}-\d{2}-\d{2}$/u.test(asOf) ? asOf : "", source: "Petrolimex vùng 2" };
    }
  }
  return null;
}

export function createPetrolimexFuelPrice(options: { fetcher?: typeof fetch; now?: () => number } = {}): FuelPriceLookup {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let cached: { at: number; price: FuelPrice } | null = null;
  let inFlight: Promise<FuelPrice | null> | null = null;

  const load = async (signal?: AbortSignal): Promise<FuelPrice | null> => {
    try {
      const deadline = AbortSignal.timeout(TIMEOUT_MS);
      const response = await fetcher(PETROLIMEX_PRICE_URL, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { accept: "application/json", referer: "https://www.petrolimex.com.vn/" },
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > MAX_BYTES) return null;
      return pickFuelPrice(JSON.parse(text));
    } catch {
      return null;
    }
  };

  return async signal => {
    if (cached && now() - cached.at < TTL_MS) return cached.price;
    inFlight ??= load(signal).finally(() => { inFlight = null; });
    const fresh = await inFlight;
    if (fresh) { cached = { at: now(), price: fresh }; return fresh; }
    // shortcut: a stale price is kept up to two days when the source is down; upgrade to a stored price if this proves flaky.
    return cached && now() - cached.at < STALE_MAX_MS ? cached.price : null;
  };
}
