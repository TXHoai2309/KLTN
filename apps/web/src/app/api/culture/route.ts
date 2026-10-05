import { db } from "@/services";
import { publicCultureResponse } from "@/modules/culture/public-culture-list";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return publicCultureResponse(request, db); }
