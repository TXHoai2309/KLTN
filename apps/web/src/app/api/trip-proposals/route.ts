import { plannerResponse } from "@/modules/trip-planner/planner-http";
import { plannerDependencies } from "@/modules/trip-planner/planner-runtime";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) { return plannerResponse(request, plannerDependencies); }
