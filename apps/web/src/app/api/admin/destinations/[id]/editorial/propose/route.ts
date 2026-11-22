import { destinationDependencies } from "@/modules/destination/destination-server";
import { editorialAiClient } from "@/modules/destination-editorial/editorial-server";
import { createEditorialProposalHandler } from "@/modules/destination-editorial/editorial-http";
import { effectiveConfig } from "@/modules/runtime-config/runtime-config-service";

export const runtime = "nodejs";
export const maxDuration = 270;
export const POST = createEditorialProposalHandler(destinationDependencies, editorialAiClient, async () => {
  const { editorialTimeoutMs } = await effectiveConfig("OPENAI", destinationDependencies.database);
  return typeof editorialTimeoutMs === "number" ? editorialTimeoutMs : undefined;
});
