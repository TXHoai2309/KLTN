/** Search link-outs to booking sites; nothing here books or pays (the app does not book). */
/** Search link-out only (Google Hotels shows live prices and booking sites); the app never books. */
export function googleHotelsUrl(name: string, near: string): string {
  return `https://www.google.com/travel/hotels?q=${encodeURIComponent(`${name} ${near}`)}&curr=VND&hl=vi`;
}

/** Agoda search by text with the dates filled in. */
export function agodaUrl(name: string, near: string, checkIn: string, checkOut: string, adults?: number): string {
  const query = new URLSearchParams({ textToSearch: `${name} ${near}`, checkIn, checkOut, adults: String(adults ?? 2), rooms: "1", locale: "vi-vn", currencyCode: "VND" });
  return `https://www.agoda.com/vi-vn/search?${query}`;
}

/** Traveloka hotel search needs an internal location id we do not have, so only its hotel page opens. */
export const TRAVELOKA_HOTELS_URL = "https://www.traveloka.com/vi-vn/hotel";

/** Booking.com search page with the dates already filled in. */
export function bookingComUrl(name: string, near: string, checkIn: string, checkOut: string, adults?: number): string {
  const query = new URLSearchParams({ ss: `${name} ${near}`, checkin: checkIn, checkout: checkOut, group_adults: String(adults ?? 2), selected_currency: "VND" });
  return `https://www.booking.com/searchresults.vi.html?${query}`;
}

