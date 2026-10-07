import { db } from "@/services";
import { publicLocationResponse } from "@/modules/destination/public-destination-list";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return publicLocationResponse(request, db); }
