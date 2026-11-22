import { z } from "zod";
import { tripJourneySchema } from "./trip-origin-contract";
import { tripProposalSchema } from "../trip-validation/trip-proposal-contract";

export const journeyEditPreviewSchema = z.object({ baseRevision: z.iso.datetime(), journey: tripJourneySchema }).strict();
export const journeyEditApplySchema = z.object({ baseRevision: z.iso.datetime(), confirmed: z.literal(true), candidate: tripProposalSchema }).strict();
export type JourneyEditApply = z.infer<typeof journeyEditApplySchema>;
