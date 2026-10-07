"use client";

import { Button } from "@KLTN/ui/components/button";
import { Heart, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import {
  createIdempotencyKey,
  sendIdempotentMutation,
} from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";

import {
  favoriteResultSchema,
  type FavoriteResult,
  type FavoriteUrlTargetType,
} from "@/modules/favorites/favorites.schema";
import {
  canStartFavoriteMutation,
  createFavoriteMutationAttempt,
  favoriteMutationRequest,
  reduceFavoriteMutationUiState,
  resolveFavoriteClickAction,
  type FavoriteMutationAttempt,
} from "./favorite-mutation-logic";

export type FavoriteToggleContext = {
  targetType: FavoriteUrlTargetType;
  targetId: string;
  currentIsFavorite: boolean;
  idempotencyKey: string;
  method: "PUT" | "DELETE";
};

export type FavoriteToggleOutcome =
  | { status: "SUCCESS"; isFavorite: boolean }
  | { status: "FAILED" | "UNKNOWN"; message?: string };

export type FavoriteButtonProps = {
  targetType: FavoriteUrlTargetType;
  targetId: string;
  initialIsFavorite?: boolean;
  onToggle?: (
    nextIsFavorite: boolean,
    context: FavoriteToggleContext,
  ) => FavoriteToggleOutcome | Promise<FavoriteToggleOutcome>;
  className?: string;
};

type FavoriteLoadState = "loading" | "ready" | "unknown";
const statusErrorMessage =
  "Chưa thể tải trạng thái yêu thích. Hãy thử lại; trạng thái hiện tại chưa xác định.";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function unknownFavoriteOutcome(): MutationOutcome<FavoriteResult> {
  return {
    status: "UNKNOWN",
    error: {
      code: "OPERATION_STATUS_UNKNOWN",
      message: "Chưa xác nhận được thao tác yêu thích. Hãy thử lại.",
    },
    retryWithSameKey: true,
  };
}

export default function FavoriteButton({
  targetType,
  targetId,
  initialIsFavorite,
  onToggle,
  className,
}: FavoriteButtonProps) {
  const { data: session, isPending: isSessionPending, error: sessionError } =
    authClient.useSession();
  const sessionRole = session?.user.role;
  const sessionUserId = session?.user.id;
  const hasSessionError = Boolean(sessionError);

  const [isFavorite, setIsFavorite] = useState<boolean | undefined>(
    initialIsFavorite,
  );
  const [loadState, setLoadState] = useState<FavoriteLoadState>(
    initialIsFavorite === undefined ? "loading" : "ready",
  );
  const [isActionPending, setIsActionPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationUnknown, setMutationUnknown] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const mutationAttemptRef = useRef<FavoriteMutationAttempt | null>(null);
  const mutationInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const mutationSequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    mutationSequenceRef.current += 1;
    mutationAttemptRef.current = null;
    mutationInFlightRef.current = false;
    setIsActionPending(false);
    setMutationUnknown(false);
  }, [targetId, targetType]);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setIsFavorite(undefined);
    setMessage(null);

    try {
      const query = new URLSearchParams({ targetType, targetId });
      const response = await fetch(`/api/favorites/status?${query.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      const body: unknown = await response.json();

      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("success" in body) ||
        body.success !== true ||
        !("data" in body)
      ) {
        throw new Error("favorite-status-failed");
      }

      const parsed = favoriteResultSchema.safeParse(body.data);
      if (
        !parsed.success ||
        parsed.data.targetType !== targetType ||
        parsed.data.targetId !== targetId
      ) {
        throw new Error("favorite-status-mismatch");
      }

      setIsFavorite(parsed.data.isFavorite);
      setLoadState("ready");
    } catch (error) {
      if (isAbortError(error)) return;

      if (!mountedRef.current) return;

      setIsFavorite(undefined);
      setLoadState("unknown");
      setMessage(statusErrorMessage);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    if (isSessionPending) return;

    if (
      hasSessionError ||
      !session ||
      sessionRole !== "TRAVELER" ||
      initialIsFavorite !== undefined
    ) {
      // Never expose a server-provided private state to a Guest. The optional
      // initial value is meaningful only after the session is confirmed as a
      // Traveler.
      setIsFavorite(sessionRole === "TRAVELER" ? initialIsFavorite ?? false : false);
      setLoadState("ready");
      setMessage(null);
      return;
    }

    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [
    hasSessionError,
    initialIsFavorite,
    isSessionPending,
    loadStatus,
    session,
    sessionRole,
    sessionUserId,
  ]);

  if (!isHydrated || isSessionPending) {
    return <FavoriteButtonSkeleton />;
  }

  // Admin does not inherit Traveler permissions and should not see a control
  // that can only end in a server-side 403.
  if (sessionRole === "ADMIN") return null;

  if (sessionRole === "TRAVELER" && loadState === "loading") {
    return <FavoriteButtonSkeleton />;
  }

  if (sessionRole === "TRAVELER" && loadState === "unknown") {
    return (
      <div className="favorite-button-stack" data-favorite-state="unknown">
        <Button
          type="button"
          variant="outline"
          className={[
            "favorite-button min-h-11 max-w-full gap-2 whitespace-normal break-words px-3 py-2",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Thử tải lại trạng thái yêu thích"
          disabled={isActionPending}
          onClick={() => void loadStatus()}
        >
          <Heart size={18} aria-hidden="true" />
          <span>Thử lại trạng thái yêu thích</span>
        </Button>
        <span className="sr-only" role="status" aria-live="polite">
          {message ?? statusErrorMessage}
        </span>
      </div>
    );
  }

  const confirmedIsFavorite = isFavorite === true;
  const label = mutationUnknown
    ? "Thử lại thao tác yêu thích"
    : confirmedIsFavorite
      ? "Bỏ yêu thích"
      : "Thêm vào yêu thích";
  const clickAction = resolveFavoriteClickAction(sessionRole, hasSessionError);

  function createMutationAttempt(): FavoriteMutationAttempt {
    return createFavoriteMutationAttempt({
      targetType,
      targetId,
      currentIsFavorite: confirmedIsFavorite,
      idempotencyKey: createIdempotencyKey(),
    });
  }

  async function executeMutation(
    attempt: FavoriteMutationAttempt,
  ): Promise<MutationOutcome<FavoriteResult>> {
    if (onToggle) {
      const outcome = await onToggle(attempt.nextIsFavorite, {
        targetType,
        targetId,
        currentIsFavorite: confirmedIsFavorite,
        idempotencyKey: attempt.key,
        method: attempt.method,
      });

      if (outcome.status === "SUCCESS") {
        return {
          status: "SUCCESS",
          data: {
            targetType,
            targetId,
            isFavorite: outcome.isFavorite,
            changed: true,
          },
        };
      }

      if (outcome.status === "UNKNOWN") {
        return {
          status: "UNKNOWN",
          error: {
            code: "OPERATION_STATUS_UNKNOWN",
            message:
              outcome.message ??
              "Chưa xác nhận được thao tác yêu thích. Hãy thử lại.",
          },
          retryWithSameKey: true,
        };
      }

      return {
        status: "FAILED",
        error: {
          code: "FAVORITE_TOGGLE_FAILED",
          message: outcome.message ?? "Không thể cập nhật yêu thích.",
        },
      };
    }

    const request = favoriteMutationRequest(attempt);
    const outcome = await sendIdempotentMutation<unknown>(request.url, {
      idempotencyKey: attempt.key,
      init: request.init,
    });

    if (outcome.status === "SUCCESS") {
      const parsed = favoriteResultSchema.safeParse(outcome.data);
      if (
        !parsed.success ||
        parsed.data.targetType !== targetType ||
        parsed.data.targetId !== targetId
      ) {
        return unknownFavoriteOutcome();
      }

      return {
        status: "SUCCESS",
        data: parsed.data,
        replayed: outcome.replayed,
      };
    }

    return outcome;
  }

  function redirectGuestToLogin() {
    const currentPath =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(buildAuthLoginHref(currentPath));
  }

  async function handleClick() {
    if (!canStartFavoriteMutation(isActionPending, mutationInFlightRef.current)) return;

    if (clickAction === "LOGIN") {
      redirectGuestToLogin();
      return;
    }

    if (clickAction !== "MUTATE") return;

    const attempt = mutationAttemptRef.current ?? createMutationAttempt();
    mutationAttemptRef.current = attempt;
    const sequence = ++mutationSequenceRef.current;
    mutationInFlightRef.current = true;

    setIsActionPending(true);
    setMessage(null);

    try {
      const outcome = await executeMutation(attempt);

      if (!mountedRef.current || sequence !== mutationSequenceRef.current) {
        return;
      }

      if (outcome.status === "SUCCESS") {
        const nextState = reduceFavoriteMutationUiState(
          {
            confirmedIsFavorite,
            mutationUnknown,
            message,
            attempt: mutationAttemptRef.current,
          },
          outcome,
        );
        setIsFavorite(nextState.confirmedIsFavorite);
        mutationAttemptRef.current = nextState.attempt;
        setMutationUnknown(nextState.mutationUnknown);
        setMessage(nextState.message);
        const nextIsFavorite = nextState.confirmedIsFavorite;
        toast.success(
          nextIsFavorite
            ? "Đã thêm vào yêu thích."
            : "Đã bỏ yêu thích.",
          { position: "bottom-right" },
        );
      } else if (outcome.status === "UNKNOWN") {
        const nextState = reduceFavoriteMutationUiState(
          {
            confirmedIsFavorite,
            mutationUnknown,
            message,
            attempt: mutationAttemptRef.current,
          },
          outcome,
        );
        setIsFavorite(nextState.confirmedIsFavorite);
        mutationAttemptRef.current = nextState.attempt;
        setMutationUnknown(nextState.mutationUnknown);
        setMessage(
          "Chưa xác nhận được thao tác yêu thích. Trạng thái chưa thay đổi; hãy thử lại.",
        );
        toast.warning("Chưa xác nhận được thao tác yêu thích.", {
          position: "bottom-right",
          description: "Trạng thái được giữ nguyên; Thử lại sẽ dùng cùng request/key.",
        });
      } else {
        mutationAttemptRef.current = null;
        setMutationUnknown(false);

        if (outcome.httpStatus === 401 || outcome.error.code === "UNAUTHENTICATED") {
          toast.error("Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.", {
            position: "bottom-right",
          });
          redirectGuestToLogin();
        } else if (outcome.httpStatus === 403 || outcome.error.code === "FORBIDDEN") {
          const errorMessage = "Bạn không có quyền thực hiện thao tác yêu thích này.";
          setMessage(errorMessage);
          toast.error(errorMessage, { position: "bottom-right" });
        } else if (outcome.error.code === "FAVORITE_TARGET_UNAVAILABLE") {
          const errorMessage = "Nội dung này không còn khả dụng để yêu thích.";
          setMessage(errorMessage);
          toast.error(errorMessage, { position: "bottom-right" });
        } else {
          setMessage(outcome.error.message);
          toast.error(outcome.error.message, { position: "bottom-right" });
        }
      }
    } catch {
      if (mountedRef.current && sequence === mutationSequenceRef.current) {
        mutationAttemptRef.current = null;
        setMutationUnknown(false);
        const errorMessage = "Không thể cập nhật yêu thích. Vui lòng thử lại.";
        setMessage(errorMessage);
        toast.error(errorMessage, { position: "bottom-right" });
      }
    } finally {
      mutationInFlightRef.current = false;
      if (mountedRef.current && sequence === mutationSequenceRef.current) {
        setIsActionPending(false);
      }
    }
  }

  return (
    <div className="favorite-button-stack" data-favorite-state={confirmedIsFavorite ? "active" : "inactive"}>
      <Button
        type="button"
        variant={confirmedIsFavorite ? "default" : "outline"}
        className={[
          "favorite-button min-h-11 max-w-full gap-2 whitespace-normal break-words px-3 py-2",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={confirmedIsFavorite}
        aria-label={label}
        aria-busy={isActionPending}
        disabled={isActionPending}
        onClick={() => void handleClick()}
      >
        {isActionPending ? (
          <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
        ) : (
          <Heart
            size={18}
            aria-hidden="true"
            fill={confirmedIsFavorite ? "currentColor" : "none"}
          />
        )}
        <span>{isActionPending ? "Đang xử lý…" : label}</span>
      </Button>
      {message ? (
        <span className="favorite-button-message" role="status" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  );
}

function FavoriteButtonSkeleton() {
  return (
    <div
      className="favorite-button-skeleton h-11 w-40 animate-pulse rounded-md bg-muted"
      role="status"
      aria-label="Đang tải trạng thái yêu thích"
      aria-busy="true"
    />
  );
}
