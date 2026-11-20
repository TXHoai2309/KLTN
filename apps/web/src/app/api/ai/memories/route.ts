import { memoriesResponse } from "@/modules/tripsage-memory/memory-http";
import { tripsageMemoryRuntime } from "@/modules/tripsage-memory/memory-runtime";
import { authorizationDependencies } from "@/server/authorization/server";

export const runtime = "nodejs";

const deps = { authorization: authorizationDependencies, memory: tripsageMemoryRuntime };
export const GET = (request: Request) => memoriesResponse(request, deps);
export const DELETE = (request: Request) => memoriesResponse(request, deps);
