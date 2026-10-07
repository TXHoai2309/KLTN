import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";

export type TravelerActor = { userId: string };

export async function requireTraveler(
  headers: Headers,
  dependencies: AuthorizationDependencies,
): Promise<TravelerActor> {
  // authorizationDependencies.resolveSession is backed by
  // auth.api.getSession({ headers }). The role is server-provided by Better
  // Auth; it is never accepted from a request body, query, or URL.
  const session = await dependencies.resolveSession(headers);
  if (!session?.user.id) {
    throw new AppError(
      "UNAUTHENTICATED",
      "Vui lòng đăng nhập để tiếp tục.",
      401,
    );
  }
  if (session.user.role !== "TRAVELER") {
    throw new AppError(
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này.",
      403,
    );
  }

  // Keep the persisted-role check as a revocation guard: a previously issued
  // session must not keep Traveler access after the User role changes.
  const user = await dependencies.database.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new AppError(
      "UNAUTHENTICATED",
      "Vui lòng đăng nhập để tiếp tục.",
      401,
    );
  }
  if (user.role !== "TRAVELER") {
    throw new AppError(
      "FORBIDDEN",
      "Bạn không có quyền thực hiện thao tác này.",
      403,
    );
  }

  return { userId: user.id };
}
