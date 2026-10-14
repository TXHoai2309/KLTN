import { AppError } from "@/server/http/app-error";
import { MAX_IMAGE_BYTES } from "./destination-media-contract";
import { noDestinationQuery } from "./destination-http";
export function imageOrigin(request: Request) {
  noDestinationQuery(request);
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Yêu cầu không hợp lệ.", 403);
}
export async function imageBytes(request: Request) {
  imageOrigin(request);
  if (request.headers.get("content-type") !== "application/octet-stream") throw new AppError("INVALID_IMAGE", "Yêu cầu phải chứa file ảnh.", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE_BYTES)) throw new AppError("IMAGE_TOO_LARGE", "Ảnh tối đa 10 MB.", 413);
  if (!request.body) throw new AppError("INVALID_IMAGE", "Chọn file ảnh.", 400);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 30_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new AppError("IMAGE_BODY_TIMEOUT", "Đọc file quá lâu. Thử tải lại.", 408);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new AppError("IMAGE_TOO_LARGE", "Ảnh tối đa 10 MB.", 413); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
