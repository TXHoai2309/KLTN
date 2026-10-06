import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { db } from "@/services";
import { AppError } from "@/server/http/app-error";
import { getPublicCulture } from "@/modules/culture/culture.service";
import type { PublicCultureDetail } from "@/modules/culture/culture.types";

import CultureDetailCover from "./culture-detail-cover";
import CultureDetailSlots from "./culture-detail-slots";
import "./culture-detail.css";

export const dynamic = "force-dynamic";

type CultureSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type CultureDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: CultureSearchParams;
};

const unavailableMetadata: Metadata = {
  title: "Nội dung không khả dụng | KLTN",
  description: "Nội dung văn hóa này hiện không khả dụng.",
};

function isUnavailableCultureError(error: unknown): boolean {
  return (
    error instanceof AppError && error.code === "CULTURE_CONTENT_UNAVAILABLE"
  );
}

function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function cultureBackHref(
  rawSearchParams: Record<string, string | string[] | undefined>,
): "/culture" | `/culture?${string}` {
  const query = new URLSearchParams();
  const q = firstSearchValue(rawSearchParams.q).trim();
  const destination = firstSearchValue(rawSearchParams.destination).trim();
  const page = firstSearchValue(rawSearchParams.page).trim();

  if (q) query.set("q", q);
  if (destination) query.set("destination", destination);
  if (page) query.set("page", page);

  const serialized = query.toString();
  return serialized ? `/culture?${serialized}` : "/culture";
}

function formatUpdatedAt(updatedAt: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(updatedAt));
}

function bodyParagraphs(body: string): string[] {
  const normalized = body.replace(/\r\n?/g, "\n").trim();
  return normalized.split(/\n{2,}/).filter(Boolean);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const detail = await getPublicCulture(slug, db);
    return {
      title: `${detail.title} | Văn hóa Hà Giang`,
      description: detail.summary || "Nội dung văn hóa Hà Giang.",
    };
  } catch (error) {
    if (isUnavailableCultureError(error)) return unavailableMetadata;

    // Metadata must not prevent the route error boundary from rendering its
    // Vietnamese retry state when the data source has a technical failure.
    return unavailableMetadata;
  }
}

export default async function CultureDetailPage({
  params,
  searchParams,
}: CultureDetailPageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const backHref = cultureBackHref(rawSearchParams);

  let detail: PublicCultureDetail;
  try {
    detail = await getPublicCulture(slug, db);
  } catch (error) {
    if (isUnavailableCultureError(error)) notFound();
    throw error;
  }

  return (
    <main className="culture-detail-page" lang="vi">
      <div className="culture-detail-shell">
        <Link className="culture-detail-back" href={backHref}>
          <ArrowLeft aria-hidden="true" />
          <span>Về danh sách văn hóa</span>
        </Link>

        <article className="culture-detail-article">
          <CultureDetailCover
            src={detail.coverImageUrl}
            alt={detail.title}
          />

          <header className="culture-detail-header">
            <p className="culture-detail-eyebrow">Văn hóa Hà Giang</p>
            <h1>{detail.title}</h1>
            {detail.summary ? (
              <p className="culture-detail-summary">{detail.summary}</p>
            ) : null}
            <p className="culture-detail-updated">
              Cập nhật lần cuối: {" "}
              <time dateTime={detail.updatedAt}>
                {formatUpdatedAt(detail.updatedAt)}
              </time>
            </p>
          </header>

          <div className="culture-detail-body" aria-label="Nội dung văn hóa">
            {bodyParagraphs(detail.body).map((paragraph, index) => (
              <p key={`${detail.id}-paragraph-${index}`}>{paragraph}</p>
            ))}
          </div>

          <CultureDetailSlots
            sources={detail.sources}
            destinations={detail.destinations}
          />
        </article>
      </div>
    </main>
  );
}
