import { planningResponse } from "@/modules/assistant-planning/planning-http";
import { assistantPlanningHttpDependencies } from "@/modules/assistant-planning/planning-runtime";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) { return planningResponse(request, assistantPlanningHttpDependencies); }
