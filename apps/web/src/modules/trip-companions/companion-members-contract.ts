import { z } from "zod";
import { companionIdSchema } from "./companion-contract";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";
const identity = z.object({ userId: companionIdSchema, displayName: z.string(), avatarUrl: publicHttpsUrl.nullable() }).strict();
export const companionMembersSchema = z.object({
  publicationId: companionIdSchema, host: identity,
  members: z.array(identity.extend({ joinedAt: z.iso.datetime() }).strict()),
}).strict();
export type CompanionMembers = z.infer<typeof companionMembersSchema>;
