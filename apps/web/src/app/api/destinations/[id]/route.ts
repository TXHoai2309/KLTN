import { db } from "@/services";
import { publicDestinationResponse } from "@/modules/destination/public-destination-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return publicDestinationResponse(request, (await params).id, db);
}
