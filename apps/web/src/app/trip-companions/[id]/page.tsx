import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanionIntroductionView } from "@/components/trip-companions/companion-introduction-view";
import { getPublicCompanion } from "@/modules/trip-companions/companion-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import "@/app/trip-companions/companion.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await getPublicCompanion(id, tripReadDependencies.database);
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
    companion = await getPublicCompanion(id, tripReadDependencies.database);
  } catch (error: unknown) {
    if (error instanceof AppError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="companion-page" lang="vi">
      <div className="companion-container">
        {/* ─── Breadcrumbs ─── */}
        <div className="companion-breadcrumbs">
          <Link href="/">Trang chủ</Link>
          <span className="companion-breadcrumbs-sep">/</span>
          <span>Tìm bạn đồng hành</span>
          <span className="companion-breadcrumbs-sep">/</span>
          <span>Giới thiệu chuyến</span>
        </div>

        {/* ─── Public View ─── */}
        <CompanionIntroductionView
          introduction={companion.introduction}
          publicationId={companion.publicationId}
        />
      </div>
    </main>
  );
}
