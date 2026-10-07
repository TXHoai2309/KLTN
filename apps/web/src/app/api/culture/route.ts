import { publicCultureResponse } from "@/modules/culture/culture.service";
import { db } from "@/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return publicCultureResponse(request, db);
}
