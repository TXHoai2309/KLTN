import "server-only";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { AppError } from "@/server/http/app-error";
import { IMAGE_FORMATS, MAX_IMAGE_BYTES, type ImageIntent } from "./destination-media-contract";

export type ImageAsset = {
  asset_id: string; public_id: string; secure_url: string; resource_type: string; type: string;
  format: string; bytes: number; width: number; height: number; version: number;
  asset_folder?: string; folder?: string;
  context?: { custom?: Record<string, string> };
};
export interface DestinationImageProvider {
  cloud: string;
  folderMode(): Promise<"dynamic" | "fixed">;
  inspect(bytes: Buffer): Promise<string>;
  find(intent: ImageIntent): Promise<ImageAsset | null>;
  upload(intent: ImageIntent, bytes: Buffer): Promise<void>;
}
const unavailable = () => new AppError("IMAGE_PROVIDER_UNAVAILABLE", "Dịch vụ ảnh chưa sẵn sàng. Giữ ảnh và thử lại.", 503);
export function cloudinaryConfiguration() {
  // Runtime values come from Varlock; API credentials remain sensitive/server-only.
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  const folder = process.env.CLOUDINARY_DESTINATION_FOLDER?.trim() || "KLTN/destinations";
  // An environment override must never redirect this integration to another project.
  return cloud && /^[a-zA-Z0-9_-]+$/.test(cloud) && api_key && api_secret && folder === "KLTN/destinations"
    ? { cloud, folder, options: { cloud_name: cloud, api_key, api_secret, secure: true, timeout: 20_000 } } : null;
}
export async function inspectImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new AppError("IMAGE_TOO_LARGE", "Ảnh phải có dung lượng từ 1 byte đến 10 MB.", 413);
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning", animated: false });
    const metadata = await image.metadata();
    const format = metadata.format === "heif" && metadata.compression === "av1" ? "avif" : metadata.format;
    if (!format || !IMAGE_FORMATS.includes(format as typeof IMAGE_FORMATS[number]) || (metadata.pages ?? 1) > 1) throw Error("format");
    await image.resize(1, 1).toBuffer(); // Decode real pixels, not just the client MIME/header.
    return format;
  } catch { throw new AppError("INVALID_IMAGE", "Chọn ảnh JPEG, PNG, WebP hoặc AVIF hợp lệ, tối đa 25 triệu điểm ảnh; không nhận ảnh động.", 400); }
}
let modeCache: { cloud: string; apiKey: string; mode: "dynamic" | "fixed"; until: number } | undefined;
export function destinationImageProvider(): DestinationImageProvider {
  const config = cloudinaryConfiguration();
  if (!config) throw new AppError("IMAGE_UPLOAD_NOT_CONFIGURED", "Chưa cấu hình tải ảnh. Các thông tin điểm đến vẫn có thể lưu.", 503);
  const options = config.options;
  return {
    cloud: config.cloud,
    inspect: inspectImage,
    async folderMode() {
      if (modeCache && modeCache.cloud === config.cloud && modeCache.apiKey === options.api_key && modeCache.until > Date.now()) return modeCache.mode;
      try {
        const result = await cloudinary.api.config({ ...options, settings: true });
        const mode = result.settings?.folder_mode;
        if (mode !== "dynamic" && mode !== "fixed") throw Error("mode");
        modeCache = { cloud: config.cloud, apiKey: options.api_key, mode, until: Date.now() + 300_000 };
        return mode;
      } catch { throw unavailable(); }
    },
    async find(intent) {
      try { return await cloudinary.api.resource(intent.publicId, { ...options, resource_type: "image", type: "upload", context: true }) as ImageAsset; }
      catch (error) {
        if (error && typeof error === "object" && "http_code" in error && error.http_code === 404) return null;
        throw unavailable();
      }
    },
    async upload(intent, bytes) {
      await new Promise<void>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          ...options, resource_type: "image", type: "upload", public_id: intent.mode === "fixed" ? intent.publicId.split("/").pop() : intent.publicId,
          ...(intent.mode === "dynamic" ? { asset_folder: intent.folder } : { folder: intent.folder }),
          overwrite: false, unique_filename: false, use_filename: false,
          allowed_formats: [...IMAGE_FORMATS],
          context: { kltn_intent: intent.intentKey, kltn_sha256: intent.sha256 },
        }, (error) => error ? reject(unavailable()) : resolve());
        stream.on("error", () => reject(unavailable()));
        stream.end(bytes);
      });
    },
  };
}
