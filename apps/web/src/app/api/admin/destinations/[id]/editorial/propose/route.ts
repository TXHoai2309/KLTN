import { destinationDependencies } from "@/modules/destination/destination-server";
import { editorialAiClient } from "@/modules/destination-editorial/editorial-server";
import { createEditorialProposalHandler } from "@/modules/destination-editorial/editorial-http";

export const runtime = "nodejs";
export const maxDuration = 210;
export const POST = createEditorialProposalHandler(destinationDependencies, editorialAiClient);
