import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma, type Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import type { QaPrincipal } from "./qa-runtime-contract";
import type { createQaAbuseGuard } from "./qa-abuse";

export const QA_GUEST_COOKIE = "kltn_qa_guest";
const GUEST_SECONDS = 7 * 24 * 60 * 60;
type Dependencies = { database: Database; auth: AuthorizationDependencies; secure: boolean; networkId?: (headers: Headers) => string; abuse?: ReturnType<typeof createQaAbuseGuard> };
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function assertQaSameOrigin(request: Request) {
  // Browser writes must carry their actual origin. No implicit CSRF fallback.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("FORBIDDEN", "Yêu cầu không được phép.", 403);
  }
}
export function guestToken(headers: Headers): string | null {
  const pairs = (headers.get("cookie") ?? "").split(";").map(p => p.trim()).filter(p => p.startsWith(`${QA_GUEST_COOKIE}=`));
  if (pairs.length !== 1) return null;
  const token = pairs[0]!.slice(QA_GUEST_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function guestCookie(token: string, secure: boolean, clear = false) {
  return `${QA_GUEST_COOKIE}=${clear ? "" : token}; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : GUEST_SECONDS}${secure ? "; Secure" : ""}`;
}
export function createQaPrincipalResolver(deps: Dependencies) {
  async function user(headers: Headers): Promise<QaPrincipal | null> {
    const session = await deps.auth.resolveSession(headers);
    if (!session) return null;
    const actor = await deps.auth.database.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, status: true } });
    if (actor?.status === "LOCKED") throw new AppError("UNAUTHENTICATED", "Vui lòng xác thực lại.", 401);
    if (!actor || !["TRAVELER", "ADMIN"].includes(actor.role)) throw new AppError("UNAUTHENTICATED", "Vui lòng xác thực lại.", 401);
    return { kind: "USER", id: actor.id };
  }
  async function guest(headers: Headers): Promise<QaPrincipal | null> {
    const token = guestToken(headers);
    if (!token) return null;
    const id = digest(token);
    const rows = await deps.database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "qa_guest_identity" WHERE "id"=${id} AND "revokedAt" IS NULL AND "expiresAt">CURRENT_TIMESTAMP
    `);
    return rows.length === 1 ? { kind: "GUEST", id } : null;
  }
  return {
    async resolve(headers: Headers): Promise<QaPrincipal> {
      const principal = await user(headers) ?? await guest(headers);
      if (!principal) throw new AppError("UNAUTHENTICATED", "Vui lòng bắt đầu phiên hỏi đáp mới.", 401);
      return deps.networkId ? { ...principal, networkId: deps.networkId(headers) } : principal;
    },
    async revoke(headers: Headers): Promise<QaPrincipal> {
      // Revocation must be retryable with the same possession token after the
      // first response is lost. This path never authorizes reads or new turns.
      if (await user(headers)) throw new AppError("FORBIDDEN", "FORBIDDEN", 403);
      const token = guestToken(headers);
      if (!token) throw new AppError("UNAUTHENTICATED", "Vui lòng bắt đầu phiên hỏi đáp mới.", 401);
      const id = digest(token);
      const rows = await deps.database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "qa_guest_identity" WHERE "id"=${id}
      `);
      if (rows.length !== 1) throw new AppError("UNAUTHENTICATED", "Vui lòng bắt đầu phiên hỏi đáp mới.", 401);
      return { kind: "GUEST", id };
    },
    async bootstrap(headers: Headers): Promise<{ principal: QaPrincipal; setCookie?: string }> {
      const account = await user(headers);
      if (account) return { principal: deps.networkId ? { ...account, networkId: deps.networkId(headers) } : account, setCookie: guestCookie("", deps.secure, true) };
      const existing = await guest(headers);
      if (existing) return { principal: deps.networkId ? { ...existing, networkId: deps.networkId(headers) } : existing };
      const networkId = deps.networkId?.(headers);
      if (deps.abuse && !networkId) throw new AppError("AI_UNAVAILABLE", "AI_UNAVAILABLE", 503);
      const token = randomBytes(32).toString("hex");
      const id = digest(token);
      const create = async (database: Pick<Database, "$executeRaw">) => database.$executeRaw(Prisma.sql`
        INSERT INTO "qa_guest_identity" ("id","expiresAt") VALUES (${id},CURRENT_TIMESTAMP + interval '7 days')
      `);
      if (deps.abuse) await deps.abuse.bootstrap(networkId!, create);
      else await create(deps.database);
      return { principal: { kind: "GUEST", id, ...(networkId ? { networkId } : {}) }, setCookie: guestCookie(token, deps.secure) };
    },
  };
}
