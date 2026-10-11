import type { AssistantAttempt, AssistantTransport, AssistantTransportResult } from "./assistant-controller";

/** No demo fallback. Body and key are immutable snapshots from the controller. */
export class AssistantHttpTransport implements AssistantTransport {
  constructor(private fetcher: typeof fetch = fetch, private timeoutMs = 70_000) {}
  async send(attempt: AssistantAttempt, signal: AbortSignal): Promise<AssistantTransportResult> {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const interrupted = new Promise<AssistantTransportResult>(resolve => {
      abortListener = () => {
        controller.abort();
        void reader?.cancel().catch(() => undefined);
        resolve({ kind: "networkAmbiguity" });
      };
      signal.addEventListener("abort", abortListener, { once: true });
      timer = setTimeout(abortListener, this.timeoutMs);
      if (signal.aborted) abortListener();
    });
    try {
      return await Promise.race([this.read(attempt, controller.signal, value => { reader = value; }), interrupted]);
    } finally {
      clearTimeout(timer);
      if (abortListener) signal.removeEventListener("abort", abortListener);
    }
  }
  private async read(attempt: AssistantAttempt, signal: AbortSignal, track: (reader: ReadableStreamDefaultReader<Uint8Array>) => void): Promise<AssistantTransportResult> {
    if (signal.aborted) return { kind: "networkAmbiguity" };
    try {
      const response = await this.fetcher("/api/ai/ask", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal,
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key }, body: attempt.body,
      });
      // Public DTO is small. Stream-bound to avoid allocating an arbitrary body.
      const reader = response.body?.getReader();
      if (!reader) return { kind: "networkAmbiguity" };
      track(reader);
      if (signal.aborted) { await reader.cancel(); reader.releaseLock(); return { kind: "networkAmbiguity" }; }
      let text = "", bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 128 * 1024) { await reader.cancel(); return { kind: "networkAmbiguity" }; }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      return { kind: "response", httpStatus: response.status, body: JSON.parse(text) as unknown };
    } catch { return { kind: "networkAmbiguity" }; }
  }
}
