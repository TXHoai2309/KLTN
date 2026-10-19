import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";

export type TravelerActor = { userId: string };

/** Better Auth establishes identity; the current persisted role grants capabilities. */
export async function requireTraveler(
  headers: Headers,
  dependencies: AuthorizationDependencies,
): Promise<TravelerActor> {
  const actor = await requireActor(headers, dependencies, "traveler");
  return { userId: actor.id };
}
