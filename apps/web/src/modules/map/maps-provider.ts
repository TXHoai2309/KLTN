/** One build-time, non-secret flag shared by browser and server. Rebuild to switch. */
export type MapsProvider = "GOOGLE" | "STADIA";
export function mapsProviderFromEnv(env: { NEXT_PUBLIC_MAPS_PROVIDER?: string } = { NEXT_PUBLIC_MAPS_PROVIDER: process.env.NEXT_PUBLIC_MAPS_PROVIDER }): MapsProvider {
  return env.NEXT_PUBLIC_MAPS_PROVIDER?.trim() === "GOOGLE" ? "GOOGLE" : "STADIA";
}
