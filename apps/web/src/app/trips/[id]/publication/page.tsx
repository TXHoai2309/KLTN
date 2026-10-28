import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import AccessDenied from "@/components/access-denied";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { getCompanionFormContext } from "@/modules/trip-companions/companion-service";
import { AppError } from "@/server/http/app-error";
import { PublicationFormClient } from "./publication-form-client";
import "@/app/trip-companions/companion.css";
import "@/components/trip-planner/trip-planner.css";

export const metadata: Metadata = {
  title: "Công khai tìm bạn đồng hành — Hà Giang Travel Assistant",
  description: "Công khai hành trình đã lưu để tìm thêm bạn đồng hành khám phá Hà Giang.",
};

export default async function TripPublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reqHeaders = await headers();

  let context;
  try {
    context = await getCompanionFormContext(reqHeaders, id, tripReadDependencies);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      if (error.status === 401) {
        redirect(buildAuthLoginHref(`/trips/${id}/publication`) as Route);
      }
      if (error.status === 403) {
        return <AccessDenied />;
      }
      if (error.status === 404) {
        notFound();
      }
      if (error.status === 409) {
        return (
          <main className="companion-page" lang="vi">
            <div className="companion-container">
              <div className="companion-card companion-form-card">
                <div className="companion-feedback-alert companion-feedback-warning" role="alert">
                  <AlertCircle size={22} className="shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  <div>
                    <h2 className="text-base font-semibold m-0 text-foreground">
                      Không thể công khai chuyến đi này
                    </h2>
                    <p className="m-0 mt-1.5 text-sm text-muted-foreground">
                      {error.message || "Chuyến đi đã qua ngày khởi hành hoặc đã được đánh dấu hoàn thành."}
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <Link href={`/trips/${id}` as Route} className="companion-secondary-button">
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>Quay lại chi tiết chuyến đi</span>
                  </Link>
                </div>
              </div>
            </div>
          </main>
        );
      }
    }
    throw error;
  }

  return (
    <main className="companion-page" lang="vi">
      <PublicationFormClient tripId={id} context={context} />
    </main>
  );
}
