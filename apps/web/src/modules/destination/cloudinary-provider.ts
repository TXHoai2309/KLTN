import "server-only";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { AppError } from "@/server/http/app-error";
import { IMAGE_FORMATS, MAX_IMAGE_BYTES, type ImageIntent } from "./destination-media-contract";
import {CloudinaryProviderError, cloudinaryErrorMetadata, type ImageUploadDiagnostics} from "./destination-image-diagnostics";
import { effectiveConfig } from "../runtime-config/runtime-config-service";

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
  upload(intent: ImageIntent, bytes: Buffer): Promise<ImageAsset | void>;
}
function validateCloudinaryConfiguration(cloud?: string, api_key?: string, api_secret?: string, folder = "KLTN/destinations") {
  return cloud && /^[a-zA-Z0-9_-]+$/.test(cloud) && api_key && api_secret && folder === "KLTN/destinations"
    ? { cloud, folder, options: { cloud_name: cloud, api_key, api_secret, secure: true, timeout: 20_000 } } : null;
}
export function cloudinaryConfiguration() {
  // Runtime values come from Varlock; API credentials remain sensitive/server-only.
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  const folder = process.env.CLOUDINARY_DESTINATION_FOLDER?.trim() || "KLTN/destinations";
  // An environment override must never redirect this integration to another project.
  return validateCloudinaryConfiguration(cloud, api_key, api_secret, folder);
}
export async function effectiveCloudinaryConfiguration() {
  const config = await effectiveConfig("CLOUDINARY");
  return validateCloudinaryConfiguration(config.cloudName?.toString(), config.apiKey?.toString(), config.apiSecret?.toString(), process.env.CLOUDINARY_DESTINATION_FOLDER?.trim() || "KLTN/destinations");
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
export function destinationImageProvider(diagnostics?:ImageUploadDiagnostics, config = cloudinaryConfiguration()): DestinationImageProvider {
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
      } catch (error) { throw new CloudinaryProviderError(error); }
    },
    async find(intent) {
      try { return await cloudinary.api.resource(intent.publicId, { ...options, resource_type: "image", type: "upload", context: true }) as ImageAsset; }
      catch (error) {
        // Admin SDK Promise rejections wrap HTTP errors as { error: { http_code } }.
        if (cloudinaryErrorMetadata(error).cloudinaryHttpStatus === 404) { diagnostics?.providerAbsent(error); return null; }
        throw new CloudinaryProviderError(error);
      }
    },
    async upload(intent, bytes) {
      return new Promise<ImageAsset | void>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          ...options, resource_type: "image", type: "upload", public_id: intent.mode === "fixed" ? intent.publicId.split("/").pop() : intent.publicId,
          ...(intent.mode === "dynamic" ? { asset_folder: intent.folder } : { folder: intent.folder }),
          overwrite: false, unique_filename: false, use_filename: false,
          allowed_formats: [...IMAGE_FORMATS],
          context: { kltn_intent: intent.intentKey, kltn_sha256: intent.sha256 },
        }, (error, result) => error ? reject(new CloudinaryProviderError(error)) : resolve(result as ImageAsset | undefined));
        stream.on("error", (error) => reject(new CloudinaryProviderError(error)));
        stream.end(bytes);
      });
    },
  };
}
export async function runtimeDestinationImageProvider(diagnostics?: ImageUploadDiagnostics): Promise<DestinationImageProvider> {
  return destinationImageProvider(diagnostics, await effectiveCloudinaryConfiguration());
}
