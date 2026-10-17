export type Role = "TRAVELER" | "ADMIN";
export type Permission = "public" | "account:self" | "traveler" | "admin";

const capabilities = {
  TRAVELER: ["public", "account:self", "traveler"],
  ADMIN: ["public", "account:self", "traveler", "admin"],
} as const satisfies Record<Role, readonly Permission[]>;

/** Capability only: callers must establish identity and enforce ownership separately. */
export function hasRolePermission(role: unknown, permission: Permission): boolean {
  if (permission === "public") return true;
  if (role !== "TRAVELER" && role !== "ADMIN") return false;
  return (capabilities[role] as readonly Permission[]).includes(permission);
}
