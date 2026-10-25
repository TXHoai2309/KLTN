import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Database, Prisma } from "@KLTN/db";
import { getFavorites } from "./favorite-service";
import { favoriteListSchema, type FavoriteItem } from "./favorite-contract";
import FavoritesView, { FavoriteCard, FavoriteContent } from "@/app/favorites/favorites-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

const trip = { id: "owned", startDate: new Date("2026-10-20"), durationDays: 2, transport: "CAR", manuallyCompletedAt: new Date("2026-10-20T10:00:00Z") };
const item = { favoriteId: "fav", targetId: "owned", title: "Chuyến đi 2 ngày", availability: "AVAILABLE", href: "/trips/owned", trip: { startDate: "2026-10-20", endDate: "2026-10-21", durationDays: 2, transport: "CAR", status: "COMPLETED" } } as const;

describe("US-34 owned Trip Favorite list", () => {
 it("queries both actor Favorite and Trip ownership; projects original link and canonical effective status only", async () => {
  const findMany = vi.fn(async () => [{ id: "fav", destination: null, cultureContent: null, trip }]);
  const database = { user: { findUnique: async () => ({ id: "a", role: "TRAVELER" }) }, favorite: { findMany } } as unknown as Database;
  const result = await getFavorites(new Headers({ "x-user-id": "b" }), { database, resolveSession: async () => ({ user: { id: "a" } }) });
  expect(result).toEqual({ destinations: [], cultureContents: [], trips: [item] });
  const query = findMany.mock.calls[0] as unknown as [Prisma.FavoriteFindManyArgs];
  expect(query[0].where).toEqual({ userId: "a", OR: [{ targetType: { not: "TRIP" } }, { trip: { userId: "a" } }] });
  expect(query[0].select?.trip).toEqual({ select: { id: true, startDate: true, durationDays: true, transport: true, manuallyCompletedAt: true } });
  expect(favoriteListSchema.parse(result)).toEqual(result);
 });
 it("strict list contract accepts three empty groups and rejects wrong original links or missing Trip metadata", () => {
  expect(favoriteListSchema.safeParse({ destinations: [], cultureContents: [], trips: [] }).success).toBe(true);
  expect(favoriteListSchema.safeParse({ destinations: [], cultureContents: [], trips: [{ ...item, href: "/trips/other" }] }).success).toBe(false);
  expect(favoriteListSchema.safeParse({ destinations: [], cultureContents: [], trips: [{ ...item, trip: undefined }] }).success).toBe(false);
 });
 it("renders functional groups even while global Culture presentation is disabled", () => {
  const html = renderToStaticMarkup(createElement(FavoritesView, { loadingOnly: true }));
  for (const label of ["Điểm đến", "Hành trình"]) expect(html).toContain(label);
  expect(html).toContain('id="favorite-trips"');
 });
 it("Trip card opens original Trip and exposes date, vehicle, effective status and relation removal", () => {
  const html = renderToStaticMarkup(createElement(FavoriteCard, { item: item satisfies FavoriteItem, group: "trips", onRemoved() {} }));
  for (const text of ['href="/trips/owned"', "20/10/2026", "21/10/2026", "Ô tô", "Đã hoàn thành", "Bỏ yêu thích"]) expect(html).toContain(text);
  expect(html).not.toContain("/trips/new");
  expect(html).not.toContain("Nội dung văn hóa đã yêu thích");
 });
 it("empty Trip group is distinct from technical failure and leads back to saved Trips", () => {
  const html = renderToStaticMarkup(createElement(FavoriteContent, { state: "ready", group: "trips", items: [], retry() {}, onRemoved() {} }));
  expect(html).toContain("Bạn chưa có hành trình yêu thích.");
  expect(html).toContain('href="/trips"');
  expect(html).not.toContain("Không thể tải");
 });
});
