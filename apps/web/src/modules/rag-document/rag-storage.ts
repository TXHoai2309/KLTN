import "server-only";
import { BlobAccessError, BlobNotFoundError, get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { AppError } from "@/server/http/app-error";
import { MAX_RAG_FILE_BYTES } from "./rag-file";

function storageToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new AppError("RAG_STORAGE_UNAVAILABLE", "Kho tài liệu chưa được cấu hình.", 503);
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export const ragStorage = {
  async accessible(pathname: string) {
    try { await head(pathname, { token: storageToken() }); return true; }
    catch (error) { if (error instanceof BlobNotFoundError || error instanceof BlobAccessError) return false; throw error; }
  },
  async issue(pathname: string, mimeType: string) {
    const token = await issueSignedToken({
      pathname, operations: ["put"], allowedContentTypes: [mimeType],
      maximumSizeInBytes: MAX_RAG_FILE_BYTES, validUntil: Date.now() + 5 * 60_000,
      token: storageToken(),
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: "put", pathname, access: "private", allowedContentTypes: [mimeType],
      maximumSizeInBytes: MAX_RAG_FILE_BYTES, addRandomSuffix: false,
    });
    return { pathname, uploadUrl: presignedUrl, contentType: mimeType };
  },
  async read(pathname: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
    const result = await get(pathname, { access: "private", token: storageToken() });
    if (signal?.aborted) {
      await result?.stream?.cancel().catch(() => undefined);
      throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
    }
    if (!result?.stream || !result.blob.size) throw new AppError("RAG_FILE_NOT_FOUND", "Không tìm thấy tệp trong kho riêng tư.", 404);
    if (result.blob.size > MAX_RAG_FILE_BYTES) throw new AppError("RAG_FILE_SIZE", "Tệp vượt giới hạn 20 MB.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = result.stream.getReader();
    const cancelOnAbort = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", cancelOnAbort, { once: true });
    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel().catch(() => undefined);
          throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
        }
        const { done, value } = await reader.read();
        if (signal?.aborted) throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RAG_FILE_BYTES) throw new AppError("RAG_FILE_SIZE", "Tệp vượt giới hạn 20 MB.", 400);
        chunks.push(value);
      }
    } finally {
      signal?.removeEventListener("abort", cancelOnAbort);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, mimeType: result.blob.contentType ?? "", sizeBytes: size };
  },
  async stream(pathname: string) {
    const result = await get(pathname, { access: "private", token: storageToken() });
    if (!result?.stream) throw new AppError("RAG_FILE_NOT_FOUND", "Không tìm thấy tệp trong kho riêng tư.", 404);
    return result.stream;
  },
};
