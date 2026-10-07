import { notFound } from "next/navigation";
import { db } from "@/services";
import { AppError } from "@/server/http/app-error";
import { resolveExploreReturnTo } from "@/modules/destination/destination-detail-navigation";
import { getPublicDestination } from "@/modules/destination/public-destination-service";
import DestinationDetail, { DetailState } from "./destination-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết điểm đến | Hà Giang Travel Assistant" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const returnTo = resolveExploreReturnTo(query.returnTo);
  try { return <DestinationDetail destination={await getPublicDestination(id, db)} returnTo={returnTo} />; }
  catch (error) {
    if (error instanceof AppError) {
      if (error.code === "DESTINATION_NOT_FOUND") notFound();
      if (error.code === "DESTINATION_UNAVAILABLE") return <DetailState state="unavailable" returnTo={returnTo} />;
    }
    throw error;
  }
}
