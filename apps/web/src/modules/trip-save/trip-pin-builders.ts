import type { FlightsPart, HotelsPart } from "../tripsage-chat/tripsage-chat-parts";
import type { CostPart } from "../tripsage-chat/tripsage-cost";
import type { TimelineSuggestion } from "../tripsage-chat/tripsage-timeline";
import type { PinnedItem } from "./trip-pin-contract";

/** ADR-47: turn what a chat card shows into a pinnable snapshot. Pure and client-safe. `today` stamps when the price was seen. */
export const pinKey = (item: PinnedItem) => JSON.stringify(item);

export function flightPin(data: FlightsPart, offerIndex: number, today: string): PinnedItem | null {
  const offer = data.offers[offerIndex];
  const outbound = offer?.itineraries[0]?.segments;
  if (!offer || !outbound) return null;
  const roundTrip = data.roundTrip === true;
  const returnDate = roundTrip ? data.returnDate ?? offer.itineraries[1]?.segments[0]?.departAt.slice(0, 10) ?? null : null;
  return { kind: "FLIGHT", roundTrip, adults: data.adults ?? 1, departDate: outbound[0]!.departAt.slice(0, 10), returnDate, lookupDate: data.lookupDate ?? today, price: offer.price, segments: outbound };
}

export function hotelPin(data: HotelsPart, hotel: HotelsPart["hotels"][number], today: string): PinnedItem {
  return {
    kind: "HOTEL", name: hotel.name, near: data.near.slice(0, 120), checkInDate: hotel.checkInDate, checkOutDate: hotel.checkOutDate,
    ...(data.adults ? { adults: data.adults } : {}), ...(hotel.rating != null ? { rating: hotel.rating } : {}),
    price: hotel.price ? { total: hotel.price.total, ...(hotel.price.perNight ? { perNight: hotel.price.perNight } : {}), currency: hotel.price.currency } : null,
    lookupDate: today,
  };
}

export const costPin = (cost: CostPart): PinnedItem => ({ kind: "COST", cost });

export function mealPin(suggestion: TimelineSuggestion): PinnedItem | null {
  const place = suggestion.place;
  if (suggestion.kind !== "MEAL" || !place?.placeId) return null;
  return { kind: "MEAL", placeId: place.placeId, name: place.name.slice(0, 80), slotId: suggestion.slotId, distanceKm: Math.min(50, place.distanceKm) };
}
