import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/server/http/app-error";

function rootKey(hex = process.env.RUNTIME_CONFIG_ENCRYPTION_KEY): Buffer {
  if (!hex || !/^[a-fA-F0-9]{64}$/u.test(hex)) throw new AppError("CONFIG_VAULT_UNAVAILABLE", "Kho cấu hình chưa được thiết lập.", 503);
  return Buffer.from(hex, "hex");
}

export function encryptConfig(value: object, scope: string, service: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", rootKey(), iv);
  cipher.setAAD(Buffer.from(`${scope}:${service}:v1`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), body: body.toString("base64") });
}

export function decryptConfig(payload: string, scope: string, service: string): unknown {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") throw Error("format");
    const data = parsed as Record<string, unknown>;
    if (data.v !== 1 || typeof data.iv !== "string" || typeof data.tag !== "string" || typeof data.body !== "string") throw Error("format");
    const iv = Buffer.from(data.iv, "base64");
    const tag = Buffer.from(data.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw Error("format");
    for (const candidate of [process.env.RUNTIME_CONFIG_ENCRYPTION_KEY, process.env.RUNTIME_CONFIG_ENCRYPTION_KEY_PREVIOUS]) {
      if (!candidate) continue;
      try {
        const decipher = createDecipheriv("aes-256-gcm", rootKey(candidate), iv);
        decipher.setAAD(Buffer.from(`${scope}:${service}:v1`));
        decipher.setAuthTag(tag);
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.body, "base64")), decipher.final()]).toString("utf8"));
      } catch { /* Try the previous root key during rotation. */ }
    }
    throw Error("decryption failed");
  } catch {
    throw new AppError("CONFIG_VAULT_UNAVAILABLE", "Không thể đọc cấu hình đang hoạt động.", 503);
  }
}
