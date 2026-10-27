import { planningResponse } from "@/modules/assistant-planning/planning-http";
import { planningDependencies } from "@/modules/assistant-planning/planning-runtime";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) { return planningResponse(request, planningDependencies); }
