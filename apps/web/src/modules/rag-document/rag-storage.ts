import "server-only";
import { BlobAccessError, BlobNotFoundError, get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { AppError } from "@/server/http/app-error";
import { MAX_RAG_FILE_BYTES } from "./rag-file";

function storageToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new AppError("RAG_STORAGE_UNAVAILABLE", "Kho tài liệu chưa được cấu hình.", 503);
  return process.env.BLOB_READ_WRITE_TOKEN;
}

async function privateContent(pathname: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
  let result;
  try {
    result = await get(pathname, { access: "private", token: storageToken(), abortSignal: signal });
  } catch (error) {
    if (signal?.aborted) throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
    if (error instanceof BlobNotFoundError) throw new AppError("RAG_FILE_NOT_FOUND", "Không tìm thấy tệp trong kho riêng tư.", 404);
    // Do not expose SDK error messages, which may contain private URLs.
    throw new AppError("RAG_STORAGE_UNAVAILABLE", "Không thể đọc kho tài liệu riêng tư. Hãy thử lại sau.", 503);
  }
  if (signal?.aborted) {
    await result?.stream?.cancel().catch(() => undefined);
    throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
  }
  if (!result) throw new AppError("RAG_FILE_NOT_FOUND", "Không tìm thấy tệp trong kho riêng tư.", 404);
  // A 304 has no body; it is not a missing object. We never request a
  // conditional read because verification/review requires the complete file.
  if (result.statusCode !== 200 || !result.stream) {
    throw new AppError("RAG_STORAGE_RESPONSE", "Kho tài liệu chưa trả về đầy đủ tệp. Hãy thử lại sau.", 502);
  }
  return result;
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
    const result = await privateContent(pathname, signal);
    // SDK 2.8.1 reports size=0 when Content-Length is absent. Only actual
    // streamed bytes determine emptiness/size; positive metadata is a precheck.
    if (result.blob.size > MAX_RAG_FILE_BYTES) {
      await result.stream.cancel().catch(() => undefined);
      throw new AppError("RAG_FILE_SIZE", "Tệp vượt giới hạn 20 MB.", 400);
    }
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
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (signal?.aborted) throw new AppError("RAG_READ_CANCELLED", "Đã hủy thao tác đọc tệp.", 409);
      if (error instanceof AppError) throw error;
      throw new AppError("RAG_STORAGE_UNAVAILABLE", "Không thể đọc đầy đủ tệp trong kho riêng tư.", 503);
    } finally {
      signal?.removeEventListener("abort", cancelOnAbort);
      reader.releaseLock();
    }
    if (size === 0) throw new AppError("RAG_FILE_SIZE", "Tệp phải có dung lượng từ 1 byte đến 20 MB.", 400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, mimeType: result.blob.contentType ?? "", sizeBytes: size };
  },
  async stream(pathname: string) {
    const result = await privateContent(pathname);
    return result.stream;
  },
};
