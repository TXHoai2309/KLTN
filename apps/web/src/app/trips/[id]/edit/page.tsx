import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { getTripForEdit } from "@/modules/trip-edit/trip-edit-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import EditTripClient from "./edit-trip-client";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getTripForEdit(await headers(), id, tripReadDependencies)
    .catch((error: unknown) => {
      if (error instanceof AppError && error.status === 401) {
        redirect(buildAuthLoginHref(`/trips/${id}/edit`) as Route);
      }
      if (error instanceof AppError && error.status === 403) return null;
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    });

  if (!trip) return <AccessDenied />;

  return (
    <EditTripClient
      tripId={trip.tripId}
      baseRevision={trip.baseRevision}
      initialCandidate={trip.candidate}
      destinationLabels={trip.destinationLabels}
    />
  );
}
