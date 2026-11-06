import type { TripJourney } from "./trip-origin-contract";

/** Synthetic UI/API fixtures. Public city-centre point, never a user's address. */
export const ORIGIN_FIXTURES = {
  confirmed: { label: "  Hà Nội  ", latitude: 21.028511, longitude: 105.804817, source: "MANUAL", confirmed: true },
  unconfirmed: { label: "Hà Nội", latitude: 21.028511, longitude: 105.804817, source: "MANUAL", confirmed: false },
  outside: { label: "Ngoài phạm vi", latitude: 20, longitude: 102, source: "MANUAL", confirmed: true },
  invalid: { label: "", latitude: 91, longitude: 181, source: "MANUAL", confirmed: true },
} as const;
export const COMPLETE_JOURNEY_FIXTURE: TripJourney = {
  origin: { ...ORIGIN_FIXTURES.confirmed, label: "Hà Nội" },
  departureMinute: 360,
  returnDeadlineMinute: 1260,
  returnDepartureMinute: null,
};
export const MISSING_JOURNEY_FIXTURE: TripJourney = { origin: null, departureMinute: null, returnDeadlineMinute: null, returnDepartureMinute: null };
