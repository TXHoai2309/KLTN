import { z } from "zod";
import { costPartSchema } from "../tripsage-chat/tripsage-cost";

/**
 * ADR-47: items the traveler pins from the planning chat onto a saved trip. Each is a dated snapshot of provider reference data
 * (never a booking, never Validator input). Client-safe: zod only.
 */
const airport = z.string().regex(/^[A-Z]{3}$/u);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const localTime = z.string().max(29).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u);
const amount = z.string().max(32).regex(/^\d+(?:\.\d+)?$/u);
const currency = z.string().regex(/^[A-Z]{3}$/u);

export const flightPinSchema = z.strictObject({
  kind: z.literal("FLIGHT"),
  roundTrip: z.boolean(),
  adults: z.number().int().min(1).max(9),
  departDate: isoDate,
  returnDate: isoDate.nullable(),
  lookupDate: isoDate.optional(),
  price: z.strictObject({ total: amount, currency }),
  segments: z.array(z.strictObject({
    from: airport, to: airport, departAt: localTime, arriveAt: localTime,
    airline: z.string().min(1).max(80), flight: z.string().min(2).max(12),
  })).min(1).max(8),
});

export const hotelPinSchema = z.strictObject({
  kind: z.literal("HOTEL"),
  name: z.string().min(1).max(80),
  near: z.string().min(1).max(120),
  checkInDate: isoDate,
  checkOutDate: isoDate,
  adults: z.number().int().min(1).max(9).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  price: z.strictObject({ total: amount, perNight: amount.nullable().optional(), currency }).nullable(),
  lookupDate: isoDate.optional(),
});

export const mealPinSchema = z.strictObject({
  kind: z.literal("MEAL"),
  placeId: z.string().min(1).max(100),
  name: z.string().min(1).max(80),
  slotId: z.string().regex(/^d\d{1,2}-(visit-\d{1,2}|lunch|free|overnight)$/u),
  distanceKm: z.number().min(0).max(50),
});

export const costPinSchema = z.strictObject({ kind: z.literal("COST"), cost: costPartSchema });

export const pinnedItemSchema = z.discriminatedUnion("kind", [flightPinSchema, hotelPinSchema, mealPinSchema, costPinSchema]);
export type PinnedItem = z.infer<typeof pinnedItemSchema>;
export const MAX_PINNED_ITEMS = 24;

/** Pins never block a save: a malformed entry is dropped instead of failing the request. */
export const lenientPinnedItemsSchema = z.array(z.unknown()).max(MAX_PINNED_ITEMS).transform(items => items.flatMap(item => {
  const parsed = pinnedItemSchema.safeParse(item);
  return parsed.success ? [parsed.data] : [];
}));

export const pinRequestSchema = z.object({ items: lenientPinnedItemsSchema }).strict();

/** Reads stored rows back; a row that no longer matches the contract is skipped. */
export function readPinnedItems(rows: readonly { payload: unknown }[]): PinnedItem[] {
  return rows.flatMap(row => {
    const parsed = pinnedItemSchema.safeParse(row.payload);
    return parsed.success ? [parsed.data] : [];
  });
}

/** What a companion may see (ADR-47): stays, meals and the lodging and food part of the cost. Flights, fares, transport and the total stay private. */
export const SHARED_COST_CATEGORIES = ["lodging", "food"] as const;
export type SharedPin =
  | z.infer<typeof hotelPinSchema>
  | z.infer<typeof mealPinSchema>
  | { kind: "COST"; travelers: number; days: number; subtotal: number; lines: { category: (typeof SHARED_COST_CATEGORIES)[number]; label: string; amount: number; basis?: string }[] };

export const sharedPinSchema = z.union([
  hotelPinSchema, mealPinSchema,
  z.strictObject({
    kind: z.literal("COST"), travelers: z.number().int().min(1).max(20), days: z.number().int().min(1).max(14), subtotal: z.number().int().min(0),
    lines: z.array(z.strictObject({ category: z.enum(SHARED_COST_CATEGORIES), label: z.string().max(60), amount: z.number().int().min(0), basis: z.string().max(120).optional() })).min(1).max(16),
  }),
]);

export function shareablePins(items: readonly PinnedItem[]): SharedPin[] {
  return items.flatMap((item): SharedPin[] => {
    if (item.kind === "HOTEL" || item.kind === "MEAL") return [item];
    if (item.kind === "FLIGHT") return [];
    const lines = item.cost.lines.flatMap(line => line.category === "lodging" || line.category === "food"
      ? [{ category: line.category, label: line.label, amount: line.amount, ...(line.basis ? { basis: line.basis } : {}) }] : []);
    return lines.length ? [{ kind: "COST", travelers: item.cost.travelers, days: item.cost.days, subtotal: lines.reduce((sum, line) => sum + line.amount, 0), lines }] : [];
  });
}
