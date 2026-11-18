import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import AccessDenied from "@/components/access-denied";
import "@/components/trip-planner/trip-planner.css";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { getTripForEdit } from "@/modules/trip-edit/trip-edit-service";
import { loadPublicCatalogMeta } from "@/modules/trip-edit/trip-edit-page-meta";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import { db } from "@/services";
import EditTripClient from "./edit-trip-client";
import styles from "./edit-trip.module.css";

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

  if (trip.tripStatus === "COMPLETED") {
    return (
      <main className={styles.page} lang="vi">
        <div className={styles.content}>
          <Link className={styles.backLink} href={`/trips/${trip.tripId}` as Route}>
            <ArrowLeft size={16} aria-hidden="true" />
            Trở về hành trình
          </Link>
          <section className={styles.lockedCard} aria-labelledby="trip-completed-locked-heading">
            <span className={styles.lockedIcon}><CheckCircle2 size={24} aria-hidden="true" /></span>
            <div>
              <p className={styles.eyebrow}>Chế độ chỉ xem</p>
              <h1 id="trip-completed-locked-heading">Chuyến đi đã hoàn thành</h1>
              <p>Hành trình đã hoàn thành nên được khóa chỉnh sửa để bảo toàn lịch sử chuyến đi.</p>
              <Link className={styles.primaryButtonInline} href={`/trips/${trip.tripId}` as Route}>
                Xem lại hành trình
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const catalogMeta = await loadPublicCatalogMeta(db);

  return (
    <EditTripClient
      tripId={trip.tripId}
      baseRevision={trip.baseRevision}
      initialCandidate={trip.candidate}
      destinationLabels={trip.destinationLabels}
      placeDetails={trip.placeDetails}
      tripStatus={trip.tripStatus}
      hasCompanionPublication={trip.hasCompanionPublication}
      initialCompletedVisitIds={trip.completedVisitIds ?? []}
      catalogMeta={catalogMeta}
    />
  );
}
