/** Server-side switch for the tripsage-style planning chat. Off unless exactly "true". */
export function isTripsageChatEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TRIPSAGE_CHAT_ENABLED === "true";
}
