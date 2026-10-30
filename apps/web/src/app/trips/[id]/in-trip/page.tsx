import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { getTripForEdit } from "@/modules/trip-edit/trip-edit-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import { AssistantV2Chat } from "@/components/assistant/assistant-v2-chat";
import "@/components/assistant/assistant.css";

export default async function InTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return <main className="assistant-page"><a href={`/trips/${encodeURIComponent(id)}`}>Về chuyến đi</a><AssistantV2Chat tripId={id}/></main>;
}
