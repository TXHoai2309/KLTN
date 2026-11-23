import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/services";
import { shortDescription } from "@/modules/destination/short-description";
import { AppError } from "@/server/http/app-error";
import { resolveExploreReturnTo } from "@/modules/destination/destination-detail-navigation";
import { getPublicDestination } from "@/modules/destination/public-destination-service";
import DestinationDetail, { DetailState } from "./destination-detail";
import { readPublicEditorial } from "@/modules/destination-editorial/editorial-service";

export const dynamic = "force-dynamic";

const readPublicDestinationForPage = cache((id: string) => getPublicDestination(id, db));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const destination = await readPublicDestinationForPage(id);
    const rawDesc = destination.profile?.shortDescription?.trim() || destination.description || "";
    const description = shortDescription(rawDesc, 155) || "Thông tin điểm đến và gợi ý tham quan tại Hà Giang.";
    return {
      title: `${destination.name.trim()} | Hà Giang Travel Assistant`,
      description,
    };
  } catch {
    return {
      title: "Chi tiết điểm đến | Hà Giang Travel Assistant",
    };
  }
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const returnTo = resolveExploreReturnTo(query.returnTo);
  try {
    // Each service enforces its own public visibility boundary. Await both
    // before rendering so canonical 404/410/errors still govern the whole page.
    const [destination, editorial] = await Promise.all([
      readPublicDestinationForPage(id),
      readPublicEditorial(id, db),
    ]);
    return <DestinationDetail destination={destination} returnTo={returnTo} editorial={editorial} />;
  }
  catch (error) {
    if (error instanceof AppError) {
      if (error.code === "DESTINATION_NOT_FOUND") notFound();
      if (error.code === "DESTINATION_UNAVAILABLE") return <DetailState state="unavailable" returnTo={returnTo} />;
    }
    throw error;
  }
}
