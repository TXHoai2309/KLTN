import { destinationDtoSchema, type DestinationDto } from "@/modules/destination/destination-contract";
import { imageIntentSchema, type ImageIntent, type InitialImageSelection } from "@/modules/destination/destination-media-contract";
export type ImageResult<T> = { status: "SUCCESS"; data: T } | { status: "FAILED" | "UNKNOWN"; message: string };
export function parseImageResult<T>(body: unknown, parse: (data: unknown) => T): ImageResult<T> {
  const b = body as { success?: boolean; operationStatus?: string; data?: unknown; error?: { message?: string } } | null;
  if (b?.success === true && b.operationStatus === "SUCCESS") {
    try { return { status: "SUCCESS", data: parse(b.data) }; } catch { /* uncertain response */ }
  }
  if (b?.success === false && b.operationStatus === "FAILED") return { status: "FAILED", message: b.error?.message ?? "Không thể lưu ảnh. Giữ ảnh và thử lại." };
  return { status: "UNKNOWN", message: "Chưa xác định kết quả. Đọc lại và thử lại với cùng file và key." };
}
export async function createClientImageIntent(id: string, file: File, key: string, signal: AbortSignal, initialSelection?: InitialImageSelection): Promise<ImageResult<ImageIntent>> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
    const response = await fetch(`/api/admin/destinations/${encodeURIComponent(id)}/images/intents`, {
      method: "POST", credentials: "same-origin", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ name: file.name.slice(0, 300), size: file.size, mime: file.type, sha256, ...(initialSelection ? { initialSelection } : {}) }),
    });
    return parseImageResult(await response.json(), data => imageIntentSchema.parse(data));
  } catch { return { status: "UNKNOWN", message: "Không nhận được kết quả tạo yêu cầu ảnh. Thử lại với cùng file." }; }
}
export function uploadClientImage(id: string, file: File, key: string, progress: (value: number) => void, signal: AbortSignal): Promise<ImageResult<DestinationDto>> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (result: ImageResult<DestinationDto>) => { signal.removeEventListener("abort", abort); resolve(result); };
    const uncertain = () => finish({ status: "UNKNOWN", message: "Chưa xác định kết quả tải ảnh. Thử lại với cùng file và key để đối chiếu." });
    xhr.open("POST", `/api/admin/destinations/${encodeURIComponent(id)}/images/upload`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("Idempotency-Key", key);
    xhr.timeout = 60_000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { try { finish(parseImageResult(JSON.parse(xhr.responseText), data => destinationDtoSchema.parse(data))); } catch { uncertain(); } };
    xhr.onerror = xhr.ontimeout = xhr.onabort = uncertain;
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { uncertain(); return; }
    xhr.send(file);
  });
}
