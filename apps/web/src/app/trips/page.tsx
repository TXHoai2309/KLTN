import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { listMyTrips, type TripSummary } from "@/modules/trip-read/trip-read-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";
import { AppError } from "@/server/http/app-error";
import { MyTripsView } from "./trips-view";

export default async function MyTripsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const currentTab = typeof params.tab === "string" ? params.tab : undefined;
  const isCompanionTab =
    currentTab === "companions" ||
    currentTab === "explore" ||
    currentTab === "mine" ||
    currentTab === "joined";

  let items: TripSummary[] = [];
  let isGuest = false;

  try {
    const result = await listMyTrips(await headers(), tripReadDependencies, vietnamDateOf(new Date()));
    items = result.items;
  } catch (error: unknown) {
    if (error instanceof AppError && error.status === 401) {
      if (!isCompanionTab) {
        redirect(buildAuthLoginHref("/trips") as Route);
      }
      isGuest = true;
    } else if (error instanceof AppError && error.status === 403) {
      return <AccessDenied />;
    } else {
      throw error;
    }
  }

  return <MyTripsView items={items} isGuest={isGuest} initialTab={currentTab} />;
}
