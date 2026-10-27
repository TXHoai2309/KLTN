import { z } from "zod";
import { tripRequirementInputSchema } from "../trip-requirement/trip-requirement-contract";
import { plannerResultSchema } from "../trip-planner/planner-contract";
import { qaContextSchema } from "../ai/qa-contract";

const id = z.string().min(1).max(128);
export const PLANNING_PREFERENCE_FIELDS = ["interests", "pace", "companions", "mobility", "destinations"] as const;
export type PlanningPreferenceField = typeof PLANNING_PREFERENCE_FIELDS[number];
export const planningDepartureWindowSchema = z.object({ from: z.iso.date(), to: z.iso.date(), anchorDate: z.iso.date() }).strict().refine(w => w.from <= w.to);
export const planningNeedsSchema = z.object({
  requirement: tripRequirementInputSchema.partial(),
  requiredDestinationIds: z.array(id).max(28),
  preferredDestinationIds: z.array(id).max(28),
  excludedDestinationIds: z.array(id).max(128).optional(),
  destinationNames: z.record(id, z.string().max(200)).refine(value => Object.keys(value).length <= 64).default({}),
  departureWindow: planningDepartureWindowSchema.optional(),
  dateDeferred: z.boolean().optional(),
  preferencesDone: z.boolean().optional(),
  skippedPreferences: z.array(z.enum(PLANNING_PREFERENCE_FIELDS)).max(5).optional(),
  companionDraft: z.object({ type: z.enum(["SOLO", "COUPLE", "FAMILY", "FRIENDS", "OTHER"]).optional(), groupSize: z.number().int().min(1).max(20).optional() }).strict().optional(),
}).strict();
export type PlanningNeeds = z.infer<typeof planningNeedsSchema>;
export const EMPTY_PLANNING_NEEDS: PlanningNeeds = { requirement: {}, requiredDestinationIds: [], preferredDestinationIds: [], destinationNames: {} };
export const planningSelectionSchema = z.object({ days: z.array(z.array(id).max(4)).min(1).max(14) }).strict();
export type PlanningSelection = z.infer<typeof planningSelectionSchema>;
export const planningUnresolvedSchema = z.object({ name: z.string().max(160), required: z.boolean(), remove: z.boolean().default(false), choices: z.array(z.object({ id, name: z.string().max(200) }).strict()).max(8) }).strict();
export const planningEditSchema = z.object({ kind: z.enum(["ADD", "REMOVE", "REPLACE", "REPLAN_DAY"]), day: z.number().int().min(1).max(14), targetId: id.nullable(), destinationId: id.nullable(), required: z.boolean().optional() }).strict();
export type PlanningEdit = z.infer<typeof planningEditSchema>;
export const planningDialogueContextSchema = z.object({
  question: z.string().max(4000),
  field: z.enum(["durationDays", "transport", "startDate", "preferences"]).nullable(),
  preferenceField: z.enum(PLANNING_PREFERENCE_FIELDS).optional(),
  recent: z.array(z.object({ question: z.string().max(1000), reply: z.string().max(4000) }).strict()).max(8),
  current: planningSelectionSchema.nullable(),
  publicTurns: z.array(z.object({ question: z.string().max(1000), answer: z.string().max(1200) }).strict()).max(3).optional(),
}).strict();
export type PlanningDialogueContext = z.infer<typeof planningDialogueContextSchema>;
export const planningExchangeSchema = z.object({ id, question: z.string().max(1000), reply: z.string().min(1).max(4000), at: z.number().int().nonnegative(), afterQaTurnId: id.nullable().optional() }).strict();
export const planningCheckpointSchema = z.object({
  needs: planningNeedsSchema, unresolved: z.array(planningUnresolvedSchema).max(8),
  resume: z.enum(["NEEDS", "REGENERATE"]), dateConfirmation: planningNeedsSchema.optional(),
}).strict();
export type PlanningCheckpoint = z.infer<typeof planningCheckpointSchema>;
export const planningOperationSchema = z.object({ kind: z.enum(["ADD", "REMOVE", "REPLACE", "REPLAN_DAY"]), day: z.number().int().min(1).max(14).nullable(), targetName: z.string().max(200).nullable(), destinationName: z.string().max(200).nullable() }).strict();
export const planningRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START"), conversationId: id.nullable(), context: qaContextSchema.default({ type: "GENERAL" }) }).strict(),
  z.object({ action: z.literal("READ"), conversationId: id }).strict(),
  z.object({ action: z.literal("CHECKPOINT"), conversationId: id, version: z.number().int().nonnegative(), revision: z.number().int().nonnegative(), checkpoint: planningCheckpointSchema, exchanges: z.array(planningExchangeSchema).max(40) }).strict(),
  z.object({ action: z.literal("RECONCILE"), conversationId: id }).strict(),
  z.object({ action: z.literal("ANALYZE"), conversationId: id, version: z.number().int().nonnegative(), text: z.string().trim().min(1).max(1000), draft: planningNeedsSchema, unresolved: z.array(planningUnresolvedSchema).max(8).default([]), dialogue: planningDialogueContextSchema.optional() }).strict(),
  z.object({ action: z.literal("REVIEW"), conversationId: id, version: z.number().int().nonnegative(), needs: planningNeedsSchema }).strict(),
  z.object({ action: z.literal("GENERATE"), conversationId: id, version: z.number().int().nonnegative(), previous: planningSelectionSchema.nullable(), instruction: z.string().trim().max(1000), edit: planningEditSchema.optional() }).strict(),
  z.object({ action: z.literal("SAVE"), conversationId: id, version: z.number().int().nonnegative(), confirm: z.literal(true), proposal: plannerResultSchema }).strict(),
]);
export type PlanningRequest = z.infer<typeof planningRequestSchema>;
export const planningWorkspaceSchema = z.object({
  conversationId: id, version: z.number().int().nonnegative(), needs: planningNeedsSchema,
  pendingSaveKey: z.string().nullable(), savedTripId: id.nullable(),
  context: qaContextSchema.default({ type: "GENERAL" }),
  today: z.iso.date().optional(),
  dialogueRevision: z.number().int().nonnegative().optional(),
  checkpoint: planningCheckpointSchema.nullable().optional(),
  exchanges: z.array(planningExchangeSchema).optional(),
}).strict();
export type PlanningWorkspace = z.infer<typeof planningWorkspaceSchema>;
export const planningAnalysisSchema = z.object({
  intent: z.enum(["NEEDS", "EDIT", "QA", "CLARIFY"]), needs: planningNeedsSchema,
  message: z.string().max(800), unresolved: z.array(planningUnresolvedSchema).max(8),
  operation: planningOperationSchema.nullable().optional(),
  options: z.array(z.object({ id, name: z.string().max(200), reason: z.string().max(400) }).strict()).max(3).optional(),
  dateDeferred: z.boolean().optional(),
  preferencesSkipped: z.boolean().optional(),
  mandatoryAddition: z.boolean().optional(),
  replyAction: z.enum(["NONE", "CONFIRM", "CANCEL"]).optional(),
  dateConfirmation: planningNeedsSchema.optional(),
  followUpMessage: z.string().max(4000).optional(),
}).strict();
export type PlanningAnalysis = z.infer<typeof planningAnalysisSchema>;
export const planningGeneratedSchema = z.object({
  proposal: plannerResultSchema, selection: planningSelectionSchema,
  attempts: z.array(z.object({ status: plannerResultSchema.shape.status, checks: z.array(z.object({ key: z.string(), status: z.string() }).strict()) }).strict()).min(1).max(3),
  repairError: z.string().nullable(),
  version: z.number().int().nonnegative().optional(),
  reply: z.string().max(4000).optional(),
}).strict();
export type PlanningGenerated = z.infer<typeof planningGeneratedSchema>;
