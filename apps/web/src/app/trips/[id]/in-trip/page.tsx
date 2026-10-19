import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import InTripAssistant from "@/components/in-trip/in-trip-assistant";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { getTripForEdit } from "@/modules/trip-edit/trip-edit-service";
import { splitCompletedRemaining } from "@/modules/in-trip/split-trip";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { tripDayDate } from "@/modules/trip-validation/trip-proposal-contract";
import { AppError } from "@/server/http/app-error";

export default async function InTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = new Date();
  const trip = await getTripForEdit(await headers(), id, tripReadDependencies).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 401) {
      redirect(buildAuthLoginHref(`/trips/${id}/in-trip`) as Route);
    }
    if (error instanceof AppError && error.status === 403) return null;
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });

  if (!trip) return <AccessDenied />;
  if (trip.candidate.startDate === null) {
    throw new AppError("TRIP_START_DATE_MISSING", "Chuyến đi chưa có ngày bắt đầu.", 409);
  }

  const split = splitCompletedRemaining({
    startDate: trip.candidate.startDate,
    durationDays: trip.candidate.durationDays,
    days: trip.candidate.days.map(day => {
      const localDate = tripDayDate(trip.candidate.startDate, day.dayIndex);
      if (localDate === null) {
        throw new AppError("TRIP_START_DATE_MISSING", "Chuyến đi chưa có ngày bắt đầu.", 409);
      }
      return {
        dayIndex: day.dayIndex,
        localDate,
        visits: day.visits.map(visit => ({
          id: visit.visitId,
          destinationId: visit.destinationId,
          startMinute: visit.startMinute,
          plannedDurationMinutes: visit.plannedDurationMinutes,
          order: visit.order,
        })),
      };
    }),
  }, now);

  const destinationParts = (destinationId: string) => {
    const label = trip.destinationLabels[destinationId] ?? "Điểm đến không khả dụng";
    const divider = label.lastIndexOf(" · ");
    if (divider < 0) return { name: label, area: "" };
    return { name: label.slice(0, divider), area: label.slice(divider + 3) };
  };

  const addDestinationLabels = (visits: typeof split.completed) => visits.map(visit => {
    const destination = destinationParts(visit.destinationId);
    return {
      ...visit,
      destinationName: destination.name,
      area: destination.area,
    };
  });

  return (
    <InTripAssistant
      tripId={trip.tripId}
      baseRevision={trip.baseRevision}
      initialCandidate={trip.candidate}
      destinationLabels={trip.destinationLabels}
      status={split.status}
      completed={addDestinationLabels(split.completed)}
      remaining={addDestinationLabels(split.remaining)}
    />
  );
}
