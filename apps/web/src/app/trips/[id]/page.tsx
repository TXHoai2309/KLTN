import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata, Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { buildDataTripTitle } from "@/lib/traveler-trip-title";
import { getMyTrip } from "@/modules/trip-read/trip-read-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { vietnamDateOf } from "@/modules/trip-requirement/trip-requirement-readiness";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";
import { AppError } from "@/server/http/app-error";
import { TripDetailView } from "../trips-view";

const readTripForPage = cache(async (id: string) =>
  getMyTrip(await headers(), id, tripReadDependencies, vietnamDateOf(new Date())),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const trip = await readTripForPage(id);
    const accessItem = (trip.pinnedItems ?? []).find((item) => item.kind === "ACCESS");
    const accessLeg = accessItem?.kind === "ACCESS" ? accessItem.leg : null;
    const stops = trip.days.flatMap((day) => day.visits);
    const title = buildDataTripTitle({
      companionTitle: trip.companionTitle,
      homeCity: accessLeg?.homeCity ?? null,
      originLabel: trip.journey?.journey.origin?.label ?? null,
      hubName: accessLeg?.hubName ?? null,
      firstArea: stops[0]?.destination.area ?? null,
      lastArea: stops.at(-1)?.destination.area ?? null,
      startDate: trip.startDate,
      endDate: trip.endDate,
      durationDays: trip.durationDays,
    });
    return { title: `${title} | Hà Giang Travel Assistant` };
  } catch {
    return { title: "Chuyến đi | Hà Giang Travel Assistant" };
  }
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await readTripForPage(id)
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref(`/trips/${id}`) as Route);
      if (error instanceof AppError && error.status === 403) return null;
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    });

  if (!trip) return <AccessDenied />;

  const calendarEnabled = await applicationSettings().then(settings => settings.calendar, () => false);
  return <TripDetailView trip={trip} calendarEnabled={calendarEnabled} />;
}
