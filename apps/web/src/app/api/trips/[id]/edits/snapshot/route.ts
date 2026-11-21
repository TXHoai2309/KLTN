import { getEditSnapshotResponse } from "@/modules/trip-edit/trip-edit-http";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return getEditSnapshotResponse(request, id, tripReadDependencies);
}
