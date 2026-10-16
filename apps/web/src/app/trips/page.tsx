import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { listMyTrips } from "@/modules/trip-read/trip-read-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";
import { AppError } from "@/server/http/app-error";
import { MyTripsView } from "./trips-view";

export default async function MyTripsPage() {
  const result = await listMyTrips(await headers(), tripReadDependencies, vietnamDateOf(new Date()))
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref("/trips") as Route);
      if (error instanceof AppError && error.status === 403) return null;
      throw error;
    });
  return result ? <MyTripsView items={result.items} /> : <AccessDenied />;
}
