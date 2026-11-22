import "server-only";
import { z } from "zod";

export const currencyCode = z.string().regex(/^[A-Z]{3}$/u);
export const MAX_DECIMAL_LENGTH = 32;
export const decimalAmount = z.string().max(MAX_DECIMAL_LENGTH).regex(/^\d+(?:\.\d+)?$/u);

/** Bounds the whole attempt, including credential resolution and response body reads. */
export async function withLookupDeadline<T>(
  timeoutMs: number,
  outer: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  if (outer?.aborted) return null;
  const controller = new AbortController();
  const signal = outer ? AbortSignal.any([outer, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let stop!: () => void;
  const aborted = new Promise<null>(resolve => {
    stop = () => resolve(null);
    signal.addEventListener("abort", stop, { once: true });
  });
  try {
    return await Promise.race([run(signal), aborted]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

/** Reject projected data if an upstream response echoed an exact credential value. */
export function echoesCredential(result: unknown, credentials: readonly string[]): boolean {
  const serialized = JSON.stringify(result);
  return credentials.some(value => serialized.includes(JSON.stringify(value).slice(1, -1)));
}
