import { AppError } from "./app-error";

export type ReadJsonBodyOptions = {
  maxBytes: number;
  tooLargeError: AppError;
  emptyError: AppError;
  invalidJsonError: AppError;
};

/**
 * Read a JSON request body with a byte limit before JSON.parse. The route
 * decides the public AppError messages so existing API contracts can keep
 * their wording while sharing the stream-safety implementation.
 */
export async function readBoundedJsonBody(
  request: Request,
  options: ReadJsonBodyOptions,
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > options.maxBytes
    ) {
      throw options.tooLargeError;
    }
  }

  if (!request.body) throw options.emptyError;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        await reader.cancel();
        throw options.tooLargeError;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw options.invalidJsonError;
  }
}
