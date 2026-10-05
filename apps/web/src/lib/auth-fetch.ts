export const AUTH_REQUEST_TIMEOUT_MS = 15_000;


// Better Auth supplies its own signal, so better-fetch's timeout option alone
// does not bound session requests. Keep the caller's signal separate: a timeout
// must reach Better Auth as an error so its session atom leaves isPending.
export function createAuthFetch(
  transport: typeof fetch,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectCancellation: (reason: unknown) => void = () => {};
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const cancel = (reason: unknown) => {
      controller.abort(reason);
      rejectCancellation(reason);
    };
    const onCallerAbort = () => cancel(callerSignal?.reason ?? new DOMException("Aborted", "AbortError"));

    if (callerSignal?.aborted) onCallerAbort();
    else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

    timer = setTimeout(() => cancel(new DOMException("Auth request timed out", "TimeoutError")), timeoutMs);

    try {
      return await Promise.race([
        cancellation,
        (async () => {
          if (controller.signal.aborted) throw controller.signal.reason;
          const response = await transport(input, { ...init, signal: controller.signal });
          // Bound body consumption too; receiving headers is not a completed
          // auth response. Auth endpoints return small, non-streaming JSON.
          const body = await response.arrayBuffer();
          return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        })(),
      ]);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  };
}

export const fetchAuthWithTimeout = createAuthFetch((input, init) => fetch(input, init));
