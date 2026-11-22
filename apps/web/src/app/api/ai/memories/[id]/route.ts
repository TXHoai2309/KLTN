import { memoriesResponse } from "@/modules/tripsage-memory/memory-http";
import { tripsageMemoryRuntime } from "@/modules/tripsage-memory/memory-runtime";
import { authorizationDependencies } from "@/server/authorization/server";
import { applicationSettings } from "@/modules/runtime-config/runtime-config-service";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return memoriesResponse(request, {
    authorization: authorizationDependencies,
    memory: tripsageMemoryRuntime,
    memoryEnabled: async () => (await applicationSettings()).memory,
  }, (await params).id);
}
