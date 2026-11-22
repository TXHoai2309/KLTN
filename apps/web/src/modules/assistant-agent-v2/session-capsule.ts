import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { planningSessionStateSchema } from "./travel-planning-session";
import { inTripSessionStateSchema } from "./in-trip-session";
import { sessionExpired } from "./session-head-store";

const base = z.object({ format: z.literal(1), sessionId: z.uuid(), actorId: z.string().min(1).max(128), version: z.number().int().nonnegative(), expiresAt: z.number().int().positive() });
export const sessionCapsuleSchema = z.discriminatedUnion("mode", [
  base.extend({ mode: z.literal("PLANNING"), state: planningSessionStateSchema }).strict(),
  base.extend({ mode: z.literal("IN_TRIP"), tripId: z.string().min(1).max(128), state: inTripSessionStateSchema }).strict(),
]);
export type SessionCapsule = z.infer<typeof sessionCapsuleSchema>;
const aad = Buffer.from("KLTN/assistant-v2/session-capsule/v1");
function encryptionKey(secret: string) {
  if (secret.length < 32) throw new AppError("ASSISTANT_STATE_UNAVAILABLE", "Chưa có cấu hình bảo vệ phiên trợ lý.", 503);
  return Buffer.from(hkdfSync("sha256", secret, "KLTN-assistant-v2", aad, 32));
}
export function capsuleSessionId(actorId: string, startKey: string, secret: string) {
  const hash = createHmac("sha256", encryptionKey(secret)).update(JSON.stringify([actorId, startKey])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function sealSessionCapsule(state: SessionCapsule, secret: string) {
  const plain = Buffer.from(JSON.stringify(sessionCapsuleSchema.parse(state)));
  if (plain.length > 3_000_000) throw sessionExpired();
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(plain)), cipher.final()]);
  const token = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
  if (token.length > 800_000) throw sessionExpired();
  return token;
}
export function openSessionCapsule(token: string, actorId: string, sessionId: string, secret: string, now: number): SessionCapsule {
  const key = encryptionKey(secret);
  try {
    if (token.length > 800_000 || !/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/u.test(token)) throw sessionExpired();
    const [, ivText, tagText, dataText] = token.split(".");
    const iv = Buffer.from(ivText!, "base64url"), tag = Buffer.from(tagText!, "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw sessionExpired();
    const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAAD(aad); decipher.setAuthTag(tag);
    const compressed = Buffer.concat([decipher.update(Buffer.from(dataText!, "base64url")), decipher.final()]);
    const state = sessionCapsuleSchema.parse(JSON.parse(inflateRawSync(compressed, { maxOutputLength: 3_000_000 }).toString("utf8")));
    if (state.actorId !== actorId || state.sessionId !== sessionId || state.expiresAt <= now) throw sessionExpired();
    return state;
  } catch { throw sessionExpired(); }
}
