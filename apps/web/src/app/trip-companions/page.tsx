import { redirect } from "next/navigation";
import type { Route } from "next";

export default async function TripCompanionsDiscoveryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string") search.set(key, val);
  }
  const tab = search.get("tab");
  if (!tab || tab === "explore") {
    search.set("tab", "companions");
  }
  const qs = search.toString();
  redirect((qs ? `/trips?${qs}` : "/trips?tab=companions") as Route);
}
