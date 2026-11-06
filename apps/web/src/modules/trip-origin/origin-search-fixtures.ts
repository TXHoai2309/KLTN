import { ORIGIN_FIXTURES } from "./trip-origin-fixtures";
import type { OriginSearchOutcome } from "./origin-search-contract";

export const ORIGIN_SEARCH_FIXTURES = {
  results: { status: "RESULTS", results: [{ ...ORIGIN_FIXTURES.confirmed, label: "Hà Nội", source: "NOMINATIM", confirmed: false }], cached: false },
  noResults: { status: "NO_RESULTS", results: [], cached: false },
  busy: { status: "BUSY", retryAfterSeconds: 4 },
  unavailable: { status: "UNAVAILABLE" },
} satisfies Record<string, OriginSearchOutcome>;
