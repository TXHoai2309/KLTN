import { analyzePreferencesResponse } from "@/modules/preference-extraction/preference-extraction-http";
import { preferenceExtractionDependencies } from "@/modules/preference-extraction/preference-extraction-server";

export const runtime = "nodejs";
// The adapter timeout is 15 seconds; keep a small deployment buffer.
export const maxDuration = 20;

export async function POST(request: Request) {
  return analyzePreferencesResponse(request, preferenceExtractionDependencies);
}
