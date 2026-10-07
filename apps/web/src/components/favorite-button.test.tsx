import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("FavoriteButton exposes the FE2 hook without optimistic state changes", async () => {
  const component = await source("./favorite-button.tsx");

  assert.match(component, /"use client"/);
  assert.match(component, /authClient\.useSession\(\)/);
  assert.match(component, /aria-pressed=\{confirmedIsFavorite\}/);
  assert.match(component, /Thêm vào yêu thích/);
  assert.match(component, /Bỏ yêu thích/);
  assert.match(component, /LoaderCircle/);
  assert.match(component, /disabled=\{isActionPending\}/);
  assert.match(component, /const \[isHydrated, setIsHydrated\]/);
  assert.match(component, /!isHydrated \|\| isSessionPending/);
  assert.match(component, /onToggle\?:/);
  assert.match(component, /outcome\.status === "SUCCESS"/);
  assert.doesNotMatch(component, /fetch\([^\n]*method:\s*["']PUT/);
  assert.doesNotMatch(component, /fetch\([^\n]*method:\s*["']DELETE/);
});

test("FavoriteButton uses confirmed idempotent writes and retries UNKNOWN safely", async () => {
  const component = await source("./favorite-button.tsx");
  const mutationLogic = await source("./favorite-mutation-logic.ts");

  assert.match(component, /createIdempotencyKey/);
  assert.match(component, /sendIdempotentMutation/);
  assert.match(component, /mutationAttemptRef/);
  assert.match(component, /mutationInFlightRef/);
  assert.match(mutationLogic, /method: nextIsFavorite \? "PUT" : "DELETE"/);
  assert.match(component, /retryWithSameKey: true/);
  assert.match(component, /Chưa xác nhận được thao tác yêu thích/);
  assert.match(component, /outcome\.httpStatus === 401/);
  assert.match(component, /outcome\.httpStatus === 403/);
  assert.match(component, /FAVORITE_TARGET_UNAVAILABLE/);
  assert.match(component, /toast\.success/);
  assert.match(component, /toast\.warning/);
  assert.match(component, /toast\.error/);
  assert.match(component, /aria-busy=\{isActionPending\}/);
  assert.match(component, /setIsFavorite\(nextState\.confirmedIsFavorite\)/);
});

test("FavoriteButton fetches private status and sends Guests through safe returnTo", async () => {
  const component = await source("./favorite-button.tsx");

  assert.match(component, /\/api\/favorites\/status/);
  assert.match(component, /credentials: "same-origin"/);
  assert.match(component, /buildAuthLoginHref\(currentPath\)/);
  assert.match(component, /window\.location\.hash/);
  assert.match(component, /sessionRole === "ADMIN"\) return null/);
  assert.match(component, /data-favorite-state="unknown"/);
  assert.match(component, /statusErrorMessage/);
});

test("detail pages wire FavoriteButton only on public detail content", async () => {
  const [slots, culturePage, destination] = await Promise.all([
    source("../app/culture/[slug]/culture-detail-slots.tsx"),
    source("../app/culture/[slug]/page.tsx"),
    source("../app/destinations/[id]/destination-detail.tsx"),
  ]);

  assert.match(slots, /FavoriteButton/);
  assert.match(slots, /targetType="culture"/);
  assert.match(slots, /targetId=\{cultureId\}/);
  assert.match(culturePage, /cultureId=\{detail\.id\}/);
  assert.match(destination, /targetType="destinations"/);
  assert.match(destination, /targetId=\{d\.id\}/);
});
