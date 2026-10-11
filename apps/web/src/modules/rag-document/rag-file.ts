import { validateDocxUpload } from "./rag-docx-validation";
import { AppError } from "@/server/http/app-error";

export const MAX_RAG_FILE_BYTES = 20 * 1024 * 1024;
export const ragMime = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TXT: "text/plain",
} as const;
export type RagFileType = keyof typeof ragMime;
export type RagStatus = "UPLOADED" | "REVIEWING" | "APPROVED" | "INDEXED" | "DISABLED";

export function retrievalEligible(status: RagStatus): boolean { return status === "INDEXED"; }

export function declaredRagFileType(fileName: string, mimeType: string, sizeBytes: number): RagFileType {
  if (!fileName || fileName.length > 255 || /[\\/\u0000-\u001f]/.test(fileName)) throw new AppError("INVALID_RAG_FILE", "Tên tệp không hợp lệ.", 400);
  const extension = fileName.split(".").pop()?.toUpperCase();
  if (extension !== "PDF" && extension !== "DOCX" && extension !== "TXT") throw new AppError("UNSUPPORTED_RAG_FILE", "Chỉ hỗ trợ PDF, DOCX hoặc TXT.", 400);
  if (mimeType !== ragMime[extension]) throw new AppError("INVALID_RAG_FILE", "Loại tệp khai báo không khớp tên tệp.", 400);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_RAG_FILE_BYTES) throw new AppError("RAG_FILE_SIZE", "Tệp phải có dung lượng từ 1 byte đến 20 MB.", 400);
  return extension;
}

const textDecoder = new TextDecoder("utf-8", { fatal: true });
export function validateRagFile(fileName: string, mimeType: string, bytes: Uint8Array): RagFileType {
  const type = declaredRagFileType(fileName, mimeType, bytes.byteLength);
  if (type === "PDF") {
    const start = new TextDecoder().decode(bytes.subarray(0, 8));
    const end = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
    if (!start.startsWith("%PDF-") || !end.includes("%%EOF")) throw new AppError("INVALID_RAG_FILE", "Nội dung PDF không hợp lệ.", 400);
  } else if (type === "DOCX") {
    validateDocxUpload(bytes);
  } else {
    let content: string;
    try { content = textDecoder.decode(bytes); } catch { throw new AppError("INVALID_RAG_FILE", "TXT phải là văn bản UTF-8.", 400); }
    if (!content.trim() || /[\u0000-\u0008\u000b\u000e-\u001f]/.test(content)) throw new AppError("INVALID_RAG_FILE", "TXT phải là văn bản thuần.", 400);
  }
  return type;
}
