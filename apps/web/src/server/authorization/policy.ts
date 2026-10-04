import { AppError } from "../http/app-error";

export type Role = "TRAVELER" | "ADMIN";
export type Actor = { id: string; role: Role };
export type Permission = "public" | "account:self" | "traveler" | "admin";

// Exact permissions: ADMIN does not inherit TRAVELER capabilities.
export function requirePermission(actor: Actor | null, permission: Permission): void {
  if (permission === "public") return;
  if (!actor?.id) throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.", 401);
  if (actor.role !== "TRAVELER" && actor.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.", 403);
  }
  if (permission === "account:self" ||
    (permission === "traveler" && actor.role === "TRAVELER") ||
    (permission === "admin" && actor.role === "ADMIN")) return;
  throw new AppError("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.", 403);
}

// ownerId must come from persistence, never from a request body.
// Missing and non-owned resources use the same result to avoid existence leaks.
export function requireOwnership(actor: Actor, persistedOwnerId: string | null | undefined): void {
  requirePermission(actor, "account:self");
  if (!persistedOwnerId || persistedOwnerId !== actor.id) {
    throw new AppError("NOT_FOUND", "Không tìm thấy dữ liệu được phép truy cập.", 404);
  }
}

// Future Traveler modules must constrain their DB lookup before returning data.
// For writes call this with the transaction's reader, then write with the same scope.
export async function readOwnedTravelerResource<T>(
  actor: Actor | null,
  id: string,
  findOwned: (scope: { id: string; userId: string }) => Promise<T | null>,
): Promise<T> {
  requirePermission(actor, "traveler");
  if (!id.trim()) throw new AppError("NOT_FOUND", "Không tìm thấy dữ liệu được phép truy cập.", 404);
  const resource = await findOwned({ id, userId: actor!.id });
  if (!resource) throw new AppError("NOT_FOUND", "Không tìm thấy dữ liệu được phép truy cập.", 404);
  return resource;
}
