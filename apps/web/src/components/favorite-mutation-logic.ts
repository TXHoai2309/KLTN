import { hasRolePermission } from "@/lib/authorization-capabilities";
import type { MutationOutcome } from "@/lib/mutation-contract";
import {
  type FavoriteResult,
  type FavoriteUrlTargetType,
} from "@/modules/favorites/favorites.schema";

export type FavoriteMutationMethod = "PUT" | "DELETE";

export type FavoriteMutationAttempt = {
  key: string;
  method: FavoriteMutationMethod;
  nextIsFavorite: boolean;
  url: string;
};

export type FavoriteMutationUiState = {
  confirmedIsFavorite: boolean;
  mutationUnknown: boolean;
  message: string | null;
  attempt: FavoriteMutationAttempt | null;
};

export function createFavoriteMutationAttempt(input: {
  targetType: FavoriteUrlTargetType;
  targetId: string;
  currentIsFavorite: boolean;
  idempotencyKey: string;
}): FavoriteMutationAttempt {
  const nextIsFavorite = !input.currentIsFavorite;
  return {
    key: input.idempotencyKey,
    method: nextIsFavorite ? "PUT" : "DELETE",
    nextIsFavorite,
    url: `/api/favorites/${encodeURIComponent(input.targetType)}/${encodeURIComponent(input.targetId)}`,
  };
}

export function favoriteMutationRequest(attempt: FavoriteMutationAttempt): {
  url: string;
  init: RequestInit;
} {
  return {
    url: attempt.url,
    init: {
      method: attempt.method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  };
}

export function canStartFavoriteMutation(
  isPending: boolean,
  isInFlight: boolean,
): boolean {
  return !isPending && !isInFlight;
}

export type FavoriteClickAction = "LOGIN" | "MUTATE" | "IGNORE";

export function resolveFavoriteClickAction(
  sessionRole: string | undefined,
  hasSessionError: boolean,
): FavoriteClickAction {
  if (hasSessionError || !sessionRole) return "LOGIN";
  return hasRolePermission(sessionRole, "traveler") ? "MUTATE" : "IGNORE";
}

export function reduceFavoriteMutationUiState(
  state: FavoriteMutationUiState,
  outcome: MutationOutcome<FavoriteResult>,
): FavoriteMutationUiState {
  if (outcome.status === "SUCCESS") {
    return {
      confirmedIsFavorite: outcome.data.isFavorite,
      mutationUnknown: false,
      message: null,
      attempt: null,
    };
  }

  if (outcome.status === "UNKNOWN") {
    return {
      ...state,
      mutationUnknown: true,
      message: "Chưa xác định được kết quả lưu. Yêu cầu có thể đã được xử lý. Hãy kiểm tra lại trước khi tiếp tục để tránh lưu trùng.",
      attempt: state.attempt,
    };
  }

  return {
    ...state,
    mutationUnknown: false,
    message: outcome.error.message,
    attempt: null,
  };
}
