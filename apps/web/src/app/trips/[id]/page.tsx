import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { getMyTrip } from "@/modules/trip-read/trip-read-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";
import { AppError } from "@/server/http/app-error";
import { TripDetailView } from "../trips-view";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getMyTrip(await headers(), id, tripReadDependencies, vietnamDateOf(new Date()))
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref(`/trips/${id}`) as Route);
      if (error instanceof AppError && error.status === 403) return null;
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    });
  return trip ? <TripDetailView trip={trip} /> : <AccessDenied />;
}
