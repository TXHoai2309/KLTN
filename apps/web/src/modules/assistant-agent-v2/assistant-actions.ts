import "server-only";
import { z } from "zod";
import { planningAnalysisSchema, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import { generatePreliminaryInputSchema, generatePreliminaryProposal, preliminaryActionOutputSchema, refinePreliminaryInputSchema, refinePreliminaryProposal, refinementActionOutputSchema, understandBriefInputSchema, understandPlanningBrief, type PlanningActionServices } from "./planning-actions";
import type { AssistantAgentContext } from "./agent-context";
import { AssistantV2Error } from "./agent-errors";
import { replanInputSchema, replanOutputSchema, replanPreliminaryProposal } from "./planning-replanning";
import { answerHaGiangQuestion, qaActionInputSchema, qaActionOutputSchema, type QaActionServices } from "./qa-actions";
import { planningInterleavedSchema } from "../assistant-planning/planning-ai";
import { inTripLocationSchema } from "../in-trip/in-trip-location";
import { readSavedTrip, resolveCurrentLocation, createInTripProposal, validateInTripProposal, applyInTripProposal, savedTripSnapshotSchema, inTripReplanInputSchema, inTripReplanOutputSchema, inTripPreviewInputSchema, inTripPreviewOutputSchema, inTripApplyInputSchema, inTripApplyOutputSchema, type InTripActionServices } from "./in-trip-actions";

export type AssistantActionDefinition<Id extends string, Input, Output> = {
  readonly id: Id;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly outputSchema: z.ZodType<Output>;
  readonly execute: (input: Input, context: AssistantAgentContext) => Promise<Output>;
};

/** Validate both boundaries once. This wrapper never retries application work. */
export function createAssistantAction<const Id extends string, Input, Output>(
  definition: AssistantActionDefinition<Id, Input, Output>,
) {
  return Object.freeze({
    id: definition.id,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    async execute(raw: unknown, context: AssistantAgentContext): Promise<Output> {
      const input = definition.inputSchema.safeParse(raw);
      if (!input.success) throw new AssistantV2Error("INVALID_ACTION_INPUT");
      let output: Output;
      try {
        output = await definition.execute(input.data, context);
      } catch (cause) {
        throw new AssistantV2Error("ACTION_EXECUTION_FAILED", { cause });
      }
      const parsed = definition.outputSchema.safeParse(output);
      if (!parsed.success) throw new AssistantV2Error("INVALID_ACTION_OUTPUT");
      return parsed.data;
    },
  });
}

/** Application-owned capabilities. The read action uses supplied state only;
 * planning capabilities require actor-bound services and authoritative rechecks. */
export type AssistantActionServices = { planning?: PlanningActionServices; qa?: QaActionServices; inTrip?: InTripActionServices };

export function createAssistantActions(services: AssistantActionServices = {}) {
  return Object.freeze({
    "read-saved-trip": createAssistantAction({ id: "read-saved-trip", description: "Read the latest owned saved itinerary and revision.", inputSchema: z.object({}).strict(), outputSchema: savedTripSnapshotSchema, execute: (_input, context) => readSavedTrip(context, services.inTrip) }),
    "resolve-current-location": createAssistantAction({ id: "resolve-current-location", description: "Normalize an explicitly supplied US-35 GPS/manual location without persistence.", inputSchema: inTripLocationSchema, outputSchema: inTripLocationSchema, execute: (input, context) => resolveCurrentLocation(input, context, services.inTrip) }),
    "create-in-trip-proposal": createAssistantAction({ id: "create-in-trip-proposal", description: "Request an existing US-36 proposal; never apply it.", inputSchema: inTripReplanInputSchema, outputSchema: inTripReplanOutputSchema, execute: (input, context) => createInTripProposal(input, context, services.inTrip) }),
    "validate-in-trip-proposal": createAssistantAction({ id: "validate-in-trip-proposal", description: "Validate a pending saved-trip proposal via US-37.", inputSchema: inTripPreviewInputSchema, outputSchema: inTripPreviewOutputSchema, execute: (input, context) => validateInTripProposal(input, context, services.inTrip) }),
    "apply-in-trip-proposal": createAssistantAction({ id: "apply-in-trip-proposal", description: "Apply an explicitly confirmed proposal using the existing transactional idempotent service.", inputSchema: inTripApplyInputSchema, outputSchema: inTripApplyOutputSchema, execute: (input, context) => applyInTripProposal(input, context, services.inTrip) }),
    "read-planning-state": createAssistantAction({
      id: "read-planning-state",
      description: "Read the current planning workspace supplied by the server.",
      inputSchema: z.object({}).strict(),
      outputSchema: planningWorkspaceSchema.nullable(),
      execute: async (_input, context) => context.workspace,
    }),
    "understand-planning-brief": createAssistantAction({
      id: "understand-planning-brief",
      description: "Interpret stated needs using the existing bounded planning understanding service.",
      inputSchema: understandBriefInputSchema,
      outputSchema: planningAnalysisSchema.extend({ interleaved: planningInterleavedSchema.optional() }),
      execute: (input, context) => understandPlanningBrief(input, context, services.planning),
    }),
    "generate-preliminary-proposal": createAssistantAction({
      id: "generate-preliminary-proposal",
      description: "Generate and publish a preliminary proposal through the existing planning services without saving a Trip.",
      inputSchema: generatePreliminaryInputSchema,
      outputSchema: preliminaryActionOutputSchema,
      execute: (input, context) => generatePreliminaryProposal(input, context, services.planning),
    }),
    "refine-preliminary-proposal": createAssistantAction({
      id: "refine-preliminary-proposal",
      description: "Regenerate a preference-driven candidate through the existing engine and publish it atomically without saving a Trip.",
      inputSchema: refinePreliminaryInputSchema,
      outputSchema: refinementActionOutputSchema,
      execute: (input, context) => refinePreliminaryProposal(input, context, services.planning),
    }),
    "replan-preliminary-proposal": createAssistantAction({
      id: "replan-preliminary-proposal",
      description: "Apply a bounded edit to the canonical unsaved proposal, revalidate dependencies and publish once.",
      inputSchema: replanInputSchema,
      outputSchema: replanOutputSchema,
      execute: (input, context) => replanPreliminaryProposal(input, context, services.planning),
    }),
    "answer-ha-giang-question": createAssistantAction({
      id: "answer-ha-giang-question",
      description: "Answer through the existing source-only QA service without planning mutation capabilities.",
      inputSchema: qaActionInputSchema,
      outputSchema: qaActionOutputSchema,
      execute: (input, context) => answerHaGiangQuestion(input, context, services.qa),
    }),
  });
}

export type AssistantActionId = keyof ReturnType<typeof createAssistantActions>;
export type AssistantActionOutput<Id extends AssistantActionId> = Awaited<ReturnType<ReturnType<typeof createAssistantActions>[Id]["execute"]>>;
