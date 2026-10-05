import type { Database } from "@KLTN/db";
import { AppError } from "../http/app-error";
import { requirePermission, type Actor, type Permission } from "./policy";

export type AuthorizationDependencies = {
  database: Pick<Database, "user">;
  resolveSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
};

export async function requireActor(
  headers: Headers,
  dependencies: AuthorizationDependencies,
  permission: Exclude<Permission, "public"> = "account:self",
): Promise<Actor> {
  const session = await dependencies.resolveSession(headers);
  if (!session?.user.id) throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.", 401);
  // Read the current persisted role, not a client field or cached cookie role.
  const user = await dependencies.database.user.findUnique({
    where: { id: session.user.id }, select: { id: true, role: true },
  });
  if (!user) throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.", 401);
  const actor: Actor = { id: user.id, role: user.role };
  requirePermission(actor, permission);
  return actor;
}
