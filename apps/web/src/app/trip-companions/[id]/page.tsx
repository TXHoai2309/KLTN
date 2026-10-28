import { headers } from "next/headers";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CompanionIntroductionView } from "@/components/trip-companions/companion-introduction-view";
import { getCompanionViewerContext, getPublicCompanion } from "@/modules/trip-companions/companion-service";
import { requireGroup } from "@/modules/trip-companions/companion-group-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import "@/app/trip-companions/companion.css";
import "@/components/trip-planner/trip-planner.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Deduplicate metadata/page reads within the render, with fresh data next request.
const readPublicCompanion = cache((id: string) =>
  getPublicCompanion(id, tripReadDependencies.database),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await readPublicCompanion(id);
    return {
      title: `${data.introduction.title} — Tìm bạn đồng hành Hà Giang`,
      description: data.introduction.introduction.slice(0, 160),
      openGraph: {
        title: data.introduction.title,
        description: data.introduction.introduction.slice(0, 160),
        images: data.introduction.image?.url ? [data.introduction.image.url] : [],
      },
    };
  } catch {
    return {
      title: "Giới thiệu chuyến đi — Tìm bạn đồng hành Hà Giang",
      description: "Xem chi tiết giới thiệu chuyến đi và tìm bạn đồng hành tại Hà Giang.",
    };
  }
}

export default async function PublicCompanionPage({ params }: PageProps) {
  const { id } = await params;

  let companion;
  try {
    companion = await readPublicCompanion(id);
  } catch (error: unknown) {
    if (error instanceof AppError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  let isHost = false;
  let isMember = false;
  let isGuest = true;
  let tripId: string | undefined = undefined;

  try {
    const reqHeaders = await headers();
    const viewerContext = await getCompanionViewerContext(reqHeaders, id, tripReadDependencies);
    if (viewerContext.relationship === "HOST") {
      isHost = true;
      isGuest = false;
      tripId = viewerContext.tripId;
    } else {
      // User is either a visitor (outsider/member) or unauthenticated guest
      try {
        // Only the relationship is needed, without loading the private itinerary.
        const group = await requireGroup(reqHeaders, id, tripReadDependencies);
        if (group.relationship === "MEMBER") {
          isMember = true;
          isGuest = false;
        } else if (group.relationship === "HOST") {
          isHost = true;
          isGuest = false;
        }
      } catch (groupError: unknown) {
        if (groupError instanceof AppError && groupError.status === 403) {
          // 403 means user is logged in, but not member or host => OUTSIDER
          isGuest = false;
        } else if (groupError instanceof AppError && groupError.status === 401) {
          // 401 means user is not logged in => GUEST
          isGuest = true;
        }
      }
    }
  } catch {
    isGuest = true;
  }

  return (
    <main className="companion-page" lang="vi">
      <div className="companion-container">
        {/* ─── Breadcrumbs ─── */}
        <div className="companion-breadcrumbs">
          <Link href="/">Trang chủ</Link>
          <span className="companion-breadcrumbs-sep">/</span>
          <Link href={"/trip-companions" as Route}>Tìm bạn đồng hành</Link>
          <span className="companion-breadcrumbs-sep">/</span>
          <span>Giới thiệu chuyến</span>
        </div>

        {/* ─── Public View ─── */}
        <CompanionIntroductionView
          introduction={companion.introduction}
          publicationId={companion.publicationId}
          recruitmentStatus={companion.recruitmentStatus}
          isHost={isHost}
          isMember={isMember}
          isGuest={isGuest}
          tripId={tripId}
        />
      </div>
    </main>
  );
}
