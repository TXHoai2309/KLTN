import { z } from "zod";
import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";

export const BUDGET_CATEGORIES = ["transport", "lodging", "food", "activities", "other"] as const;
export const BUDGET_CURRENCIES = ["VND", "USD"] as const;
export const LODGING_KINDS = ["HOTEL", "HOMESTAY", "GUESTHOUSE", "ANY"] as const;
export type LodgingKind = (typeof LODGING_KINDS)[number];

const estimatedAmount = z.number().min(0).max(5e12);
const date = z.string().length(10).refine(isValidCalendarDate);
const airportTime = z.string().max(29)
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?$/u)
  .refine(value => isValidCalendarDate(value.slice(0, 10)));
const airport = z.string().length(3).regex(/^[A-Z]{3}$/u);
const shortName = z.string().min(1).max(80);
const price = z.strictObject({
  total: z.string().max(32).regex(/^\d+(?:\.\d+)?$/u),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/u),
});

export const budgetPartSchema = z.strictObject({
  currency: z.enum(BUDGET_CURRENCIES),
  total: estimatedAmount,
  perPersonPerDay: estimatedAmount,
  withinCap: z.boolean().nullable(),
  overBy: estimatedAmount.nullable(),
  allocations: z.array(z.strictObject({
    category: z.enum(BUDGET_CATEGORIES),
    amount: estimatedAmount,
    sharePercent: z.number().int().min(0).max(100),
    note: z.string().max(120).optional(),
  })).min(1).max(BUDGET_CATEGORIES.length),
}).refine(
  ({ withinCap, overBy }) => withinCap === null ? overBy === null : withinCap ? overBy === 0 : overBy !== null && overBy > 0,
);

export const flightsPartSchema = z.strictObject({
  offers: z.array(z.strictObject({
    price,
    totalDurationMinutes: z.number().int().min(1).max(10_000).optional(),
    itineraries: z.array(z.strictObject({
      connections: z.number().int().min(0).max(7),
      segments: z.array(z.strictObject({
        from: airport,
        to: airport,
        departAt: airportTime,
        arriveAt: airportTime,
        airline: shortName,
        flight: z.string().min(2).max(12).regex(/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/u),
      })).min(1).max(8),
    }).refine(({ connections, segments }) => connections === segments.length - 1)).min(1).max(2),
  })).min(1).max(5),
  roundTrip: z.boolean().optional(),
  originAirport: airport.optional(),
  departureDate: date.optional(),
  returnDate: date.nullable().optional(),
  adults: z.number().int().min(1).max(9).optional(),
  lookupDate: date.optional(),
  typicalPriceRange: z.strictObject({
    min: z.string().max(32).regex(/^\d+(?:\.\d+)?$/u),
    max: z.string().max(32).regex(/^\d+(?:\.\d+)?$/u),
    currency: z.string().length(3).regex(/^[A-Z]{3}$/u),
  }).nullable().optional(),
});

const hotelPrice = z.strictObject({
  total: z.string().max(32).regex(/^\d+(?:\.\d+)?$/u),
  perNight: z.string().max(32).regex(/^\d+(?:\.\d+)?$/u).nullable().optional(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/u),
});

export const hotelsPartSchema = z.strictObject({
  near: z.string().min(1).max(200),
  nights: z.number().int().min(1).max(14),
  destinationId: z.string().min(1).max(128).optional(),
  kind: z.enum(LODGING_KINDS).optional(),
  adults: z.number().int().min(1).max(9).optional(),
  hotels: z.array(z.strictObject({
    name: shortName,
    distanceKm: z.number().min(0).max(20_050).nullable(),
    room: z.string().min(1).max(60).nullable().optional(),
    rating: z.number().min(0).max(5).nullable().optional(),
    reviews: z.number().int().min(0).max(10_000_000).nullable().optional(),
    price: hotelPrice.nullable(),
    checkInDate: date,
    checkOutDate: date,
  }).refine(hotel => hotel.checkOutDate > hotel.checkInDate)).min(1).max(8),
}).refine(({ hotels }) => {
  const priced = hotels.filter(h => h.price !== null).length;
  const unpriced = hotels.length - priced;
  return priced <= 5 && unpriced <= 3;
});

export type BudgetPart = z.infer<typeof budgetPartSchema>;
export type FlightsPart = z.infer<typeof flightsPartSchema>;
export type HotelsPart = z.infer<typeof hotelsPartSchema>;

const resultPartSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("data-budget"), id: z.literal("budget"), data: budgetPartSchema }),
  z.strictObject({ type: z.literal("data-flights"), id: z.string().regex(/^flights-[1-9]\d{0,3}$/u), data: flightsPartSchema }),
  z.strictObject({ type: z.literal("data-hotels"), id: z.string().regex(/^hotels-[1-9]\d{0,3}$/u), data: hotelsPartSchema }),
]);

export function readTripsageResultPart(part: unknown) {
  const parsed = resultPartSchema.safeParse(part);
  return parsed.success ? parsed.data : null;
}
