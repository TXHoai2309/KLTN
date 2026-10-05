import { db } from "@/services";
import { AppError } from "@/server/http/app-error";
import { listPublicLocations, parsePublicListQuery } from "@/modules/destination/public-destination-list";
import ExploreResults from "./explore-results";
import "./explore.css";
export const dynamic = "force-dynamic";
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) { if (Array.isArray(value)) value.forEach(item => query.append(key, item)); else if (value !== undefined) query.set(key, value); }
  try { const data = await listPublicLocations(parsePublicListQuery(query), db); return <ExploreResults data={data} />; }
  catch (error) { return <ExploreResults error={error instanceof AppError ? error.message : "Không thể tải dữ liệu điểm đến. Vui lòng thử lại."} />; }
}
