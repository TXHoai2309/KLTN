import { notFound } from "next/navigation";
import { db } from "@/services";
import { AppError } from "@/server/http/app-error";
import { getPublicDestination } from "@/modules/destination/public-destination-service";
import DestinationDetail, { DetailState } from "./destination-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết điểm đến | Hà Giang Travel Assistant" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return <DestinationDetail destination={await getPublicDestination(id, db)} />; }
  catch (error) {
    if (error instanceof AppError) {
      if (error.code === "DESTINATION_NOT_FOUND") notFound();
      if (error.code === "DESTINATION_UNAVAILABLE") return <DetailState state="unavailable" />;
    }
    throw error;
  }
}
