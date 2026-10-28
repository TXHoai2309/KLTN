import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { getMyTrip, type TripDetail } from "@/modules/trip-read/trip-read-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";
import { AppError } from "@/server/http/app-error";
import { TripDetailView } from "../trips-view";

async function attachTripRoutes(trip: TripDetail): Promise<TripDetail> {
  try {
    const visits = trip.days.flatMap((day) =>
      day.visits.map((visit) => ({ day: day.dayIndex, visit }))
    );
    if (visits.length < 2) return trip;

    const apiKey = process.env.STADIA_MAPS_API_KEY;
    if (!apiKey) return trip;

    const pairs = [];
    for (let i = 1; i < visits.length; i++) {
      const from = visits[i - 1]!.visit.destination;
      const to = visits[i]!.visit.destination;
      if (
        from.id !== to.id &&
        typeof from.latitude === "number" &&
        typeof from.longitude === "number" &&
        typeof to.latitude === "number" &&
        typeof to.longitude === "number"
      ) {
        pairs.push({
          from: {
            id: from.id,
            name: from.name,
            description: from.description ?? "",
            area: from.area,
            address: from.address ?? null,
            category: from.category ?? "",
            latitude: from.latitude,
            longitude: from.longitude,
            image: null,
          },
          to: {
            id: to.id,
            name: to.name,
            description: to.description ?? "",
            area: to.area,
            address: to.address ?? null,
            category: to.category ?? "",
            latitude: to.latitude,
            longitude: to.longitude,
            image: null,
          },
          transport: trip.transport,
        });
      }
    }

    if (pairs.length === 0) return trip;

    const { createStadiaRoutesProvider, resolvePlannerRoutes } = await import(
      "@/modules/trip-planner/planner-routes"
    );
    const provider = createStadiaRoutesProvider({ apiKey: () => apiKey });
    const resolved = await resolvePlannerRoutes(pairs as unknown as Parameters<typeof resolvePlannerRoutes>[0], provider, 6000);

    return {
      ...trip,
      days: trip.days.map((day) => ({
        ...day,
        visits: day.visits.map((visit) => {
          const inbound = resolved.get(visit.destination.id);
          return inbound ? { ...visit, inbound } : visit;
        }),
      })),
    };
  } catch {
    return trip;
  }
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getMyTrip(await headers(), id, tripReadDependencies, vietnamDateOf(new Date()))
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref(`/trips/${id}`) as Route);
      if (error instanceof AppError && error.status === 403) return null;
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    });

  if (!trip) return <AccessDenied />;
  const enrichedTrip = await attachTripRoutes(trip);
  return <TripDetailView trip={enrichedTrip} />;
}
