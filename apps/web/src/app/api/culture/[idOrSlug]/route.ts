import { publicCultureDetailResponse } from "@/modules/culture/culture.service";
import { db } from "@/services";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ idOrSlug: string }> },
) {
  const { idOrSlug } = await params;
  return publicCultureDetailResponse(idOrSlug, db);
}
