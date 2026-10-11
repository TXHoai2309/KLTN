import { timingSafeEqual } from "node:crypto";
import type { QaCleanupResult } from "./qa-conversation-store";

export function createQaCleanupHandler(dependencies: {
  enabled: () => boolean;
  secret: () => string | undefined;
  cleanup: () => Promise<QaCleanupResult>;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    if (!dependencies.enabled()) return Response.json({ error: "CLEANUP_DISABLED" }, { status: 503, headers });
    const secret = dependencies.secret();
    const actual = request.headers.get("authorization") ?? "";
    const expected = secret ? `Bearer ${secret}` : "";
    if (!secret || secret.length < 32 || actual.length > 1024 || Buffer.byteLength(actual) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    }
    try {
      const result = await dependencies.cleanup();
      return Response.json(result, { status: result.lockAcquired ? 200 : 202, headers });
    } catch {
      // No exception payload: SQL/provider messages may include private content.
      return Response.json({ error: "CLEANUP_FAILED" }, { status: 500, headers });
    }
  };
}
