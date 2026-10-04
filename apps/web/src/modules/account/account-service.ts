import type { Database, Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite } from "@/server/http/idempotency";
import { updateAccountSchema, type AccountDto } from "./account-contract";
import { requireActor } from "@/server/authorization/guard";

export const accountSelect = { name: true, email: true, role: true, createdAt: true } satisfies Prisma.UserSelect;
export type AccountDependencies = {
  database: Database;
  resolveSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
};
export async function requireAccountUser(headers: Headers, dependencies: AccountDependencies) {
  return (await requireActor(headers, dependencies, "account:self")).id;
}
function toDto(user: { name: string; email: string; role: "TRAVELER" | "ADMIN"; createdAt: Date }): AccountDto {
  // Explicit projection even if an adapter unexpectedly returns extra fields.
  return { name: user.name, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() };
}
export async function readAccount(userId: string, database: Pick<Database, "user">): Promise<AccountDto> {
  const user = await database.user.findUnique({ where: { id: userId }, select: accountSelect });
  if (!user) throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.", 401);
  return toDto(user);
}
export async function getAccount(headers: Headers, dependencies: AccountDependencies) {
  return readAccount(await requireAccountUser(headers, dependencies), dependencies.database);
}
export async function updateAccount(headers: Headers, body: unknown, key: string, dependencies: AccountDependencies) {
  const userId = await requireAccountUser(headers, dependencies);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_ACCOUNT_INPUT", "Thông tin tài khoản không hợp lệ.", 400);
  return executeIdempotentWrite({
    database: dependencies.database, actorId: userId, operation: "account:update-name", key, input: parsed.data,
    execute: async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!existing) throw new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập để tiếp tục.", 401);
      const user = await tx.user.update({ where: { id: userId }, data: { name: parsed.data.name }, select: accountSelect });
      return toDto(user);
    },
  });
}
