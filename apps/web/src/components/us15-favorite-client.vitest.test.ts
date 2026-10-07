import { describe, expect, it } from "vitest";

import {
  buildAuthLoginHref,
  resolveAuthReturnTo,
} from "@/lib/auth-return-to";
import type { MutationOutcome } from "@/lib/mutation-contract";
import type { FavoriteResult } from "@/modules/favorites/favorites.schema";

import {
  canStartFavoriteMutation,
  createFavoriteMutationAttempt,
  favoriteMutationRequest,
  reduceFavoriteMutationUiState,
  resolveFavoriteClickAction,
  type FavoriteMutationUiState,
} from "./favorite-mutation-logic";

const result = (isFavorite: boolean): FavoriteResult => ({
  targetType: "destinations",
  targetId: "destination-public",
  isFavorite,
  changed: true,
});

function state(overrides: Partial<FavoriteMutationUiState> = {}): FavoriteMutationUiState {
  return {
    confirmedIsFavorite: false,
    mutationUnknown: false,
    message: null,
    attempt: createFavoriteMutationAttempt({
      targetType: "destinations",
      targetId: "destination-public",
      currentIsFavorite: false,
      idempotencyKey: "fixed-key",
    }),
    ...overrides,
  };
}

describe("US15 FavoriteButton client mutation logic", () => {
  it("updates confirmed state only after SUCCESS", () => {
    const initial = state();
    const failed: MutationOutcome<FavoriteResult> = {
      status: "FAILED",
      httpStatus: 409,
      error: { code: "FAILED", message: "Không thể cập nhật." },
    };
    const unknown: MutationOutcome<FavoriteResult> = {
      status: "UNKNOWN",
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác nhận." },
      retryWithSameKey: true,
    };

    expect(reduceFavoriteMutationUiState(initial, failed)).toMatchObject({
      confirmedIsFavorite: false,
      mutationUnknown: false,
      attempt: null,
    });

    const unknownState = reduceFavoriteMutationUiState(initial, unknown);
    expect(unknownState).toMatchObject({
      confirmedIsFavorite: false,
      mutationUnknown: true,
      attempt: initial.attempt,
    });

    const success: MutationOutcome<FavoriteResult> = {
      status: "SUCCESS",
      data: result(true),
    };
    expect(reduceFavoriteMutationUiState(unknownState, success)).toEqual({
      confirmedIsFavorite: true,
      mutationUnknown: false,
      message: null,
      attempt: null,
    });
  });

  it("retries UNKNOWN with the identical key, method and request", () => {
    const attempt = createFavoriteMutationAttempt({
      targetType: "destinations",
      targetId: "destination-public",
      currentIsFavorite: false,
      idempotencyKey: "same-key",
    });
    const firstRequest = favoriteMutationRequest(attempt);
    const unknown: MutationOutcome<FavoriteResult> = {
      status: "UNKNOWN",
      error: { code: "OPERATION_STATUS_UNKNOWN", message: "Chưa xác nhận." },
      retryWithSameKey: true,
    };
    const retryState = reduceFavoriteMutationUiState(state({ attempt }), unknown);
    const retryRequest = favoriteMutationRequest(retryState.attempt!);

    expect(retryState.attempt).toBe(attempt);
    expect(retryRequest).toEqual(firstRequest);
    expect(retryRequest.init.method).toBe("PUT");
    expect(attempt.key).toBe("same-key");
  });

  it("derives DELETE from the last confirmed favorite state and blocks parallel writes", () => {
    const remove = createFavoriteMutationAttempt({
      targetType: "culture",
      targetId: "culture-public",
      currentIsFavorite: true,
      idempotencyKey: "remove-key",
    });
    expect(remove.method).toBe("DELETE");
    expect(remove.url).toBe("/api/favorites/culture/culture-public");
    expect(canStartFavoriteMutation(false, false)).toBe(true);
    expect(canStartFavoriteMutation(true, false)).toBe(false);
    expect(canStartFavoriteMutation(false, true)).toBe(false);
  });

  it("routes Guest to login without a write action and ignores Admin", () => {
    expect(resolveFavoriteClickAction(undefined, false)).toBe("LOGIN");
    expect(resolveFavoriteClickAction(undefined, true)).toBe("LOGIN");
    expect(resolveFavoriteClickAction("ADMIN", false)).toBe("IGNORE");
    expect(resolveFavoriteClickAction("TRAVELER", false)).toBe("MUTATE");
  });

  it("accepts only internal returnTo paths", () => {
    expect(resolveAuthReturnTo("/culture/culture-public?q=le-hoi")).toBe(
      "/culture/culture-public?q=le-hoi",
    );
    expect(resolveAuthReturnTo("//evil.com")).toBe("/dashboard");
    expect(resolveAuthReturnTo("https://evil.com/callback")).toBe("/dashboard");
    expect(buildAuthLoginHref("/culture/culture-public")).toBe(
      "/login?returnTo=%2Fculture%2Fculture-public",
    );
  });
});
