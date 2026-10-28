import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@KLTN/db";
import { requireActor, type AuthorizationDependencies } from "@/server/authorization/guard";
import { AppError } from "@/server/http/app-error";
import { executeIdempotentWrite, preflightIdempotentReplay } from "@/server/http/idempotency";
import { declaredRagFileType, retrievalEligible, validateRagFile, type RagStatus } from "./rag-file";
import type { ragStorage } from "./rag-storage";

type Storage = Pick<typeof ragStorage, "issue" | "read" | "stream" | "accessible">;
export type RagDependencies = AuthorizationDependencies & { database: Database; storage: Storage };
export type RagFinalizeResult = { id: string; originalFileName: string; sourceTitle: string; status: RagStatus; retrievalEligible: false; publicQaApproved: false; publicQaEligible: false; ineligibilityReason: "STATUS_NOT_INDEXED" };
const fileFields = {
  originalFileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
};
const uploadRequest = z.object({ fileName: z.string(), mimeType: z.string(), sizeBytes: z.number() }).strict();
const finalizeRequest = z.object({
  pathname: z.string().max(500), ...fileFields,
  sourceTitle: z.string().trim().min(1).max(300),
  sourceUrl: z.string().trim().max(2000).optional(),
  author: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(200).optional(),
  locality: z.string().trim().max(200).optional(),
}).strict();
const reviewRequest = z.object({
  action: z.enum(["DISABLE", "ENABLE_PUBLIC_QA", "DISABLE_PUBLIC_QA"]),
  confirmedSourceReview: z.boolean().optional(),
}).strict();
export type RagReviewAction = z.infer<typeof reviewRequest>["action"];
type RagDocumentTransitionResult = {
  id: string;
  status: RagStatus;
  publicQaApproved: boolean;
  publicQaEligible: boolean;
  ineligibilityReason: RagIneligibilityReason | null;
  updatedAt: Date;
  retrievalEligible: boolean;
  allowedActions: RagReviewAction[];
};

const bulkRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ENABLE_ALL_INDEXED"),
  }).strict(),
  z.object({
    action: z.enum(["ENABLE_SELECTED", "DISABLE_SELECTED"]),
    documentIds: z.array(z.string().min(1).max(100)).min(1).max(200),
  }).strict(),
]);
export type RagBulkPublicQaRequest = z.infer<typeof bulkRequest>;

const listFields = {
  id: true, originalFileName: true, fileType: true, sourceTitle: true,
  status: true, publicQaApproved: true, deletedAt: true, createdAt: true, updatedAt: true,
} as const;
const detailFields = {
  ...listFields, mimeType: true, sizeBytes: true, sourceUrl: true, author: true,
  topic: true, locality: true, uploadedById: true,
} as const;

function validateId(id: string) {
  if (!/^[-\w]{1,100}$/.test(id)) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
}

export type RagIneligibilityReason =
  | "STATUS_NOT_INDEXED"
  | "NOT_PUBLIC_APPROVED"
  | "NO_READY_INDEX"
  | "EMBEDDING_MISMATCH"
  | "DOCUMENT_DELETED";

type GenerationSubset = {
  state: "BUILDING" | "READY";
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
} | null | undefined;

export function computeRagEligibility(
  status: RagStatus,
  publicQaApproved: boolean,
  generation: GenerationSubset,
  deletedAt: Date | null = null,
): { publicQaEligible: boolean; ineligibilityReason: RagIneligibilityReason | null } {
  if (deletedAt) {
    return { publicQaEligible: false, ineligibilityReason: "DOCUMENT_DELETED" };
  }
  if (status !== "INDEXED") {
    return { publicQaEligible: false, ineligibilityReason: "STATUS_NOT_INDEXED" };
  }
  if (!publicQaApproved) {
    return { publicQaEligible: false, ineligibilityReason: "NOT_PUBLIC_APPROVED" };
  }
  if (!generation || generation.state !== "READY") {
    return { publicQaEligible: false, ineligibilityReason: "NO_READY_INDEX" };
  }
  if (
    generation.embeddingProvider !== "openai" ||
    generation.embeddingModel !== "text-embedding-3-small" ||
    generation.embeddingDimensions !== 1536
  ) {
    return { publicQaEligible: false, ineligibilityReason: "EMBEDDING_MISMATCH" };
  }
  return { publicQaEligible: true, ineligibilityReason: null };
}

function allowedActions(status: RagStatus, publicQaApproved = false, indexReady = true): RagReviewAction[] {
  if (status === "UPLOADED") return ["DISABLE"];
  if (status === "REVIEWING") return ["DISABLE"];
  if (status === "APPROVED") return ["DISABLE"];
  if (status === "INDEXED") {
    return publicQaApproved ? ["DISABLE", "DISABLE_PUBLIC_QA"] : indexReady ? ["DISABLE", "ENABLE_PUBLIC_QA"] : ["DISABLE"];
  }
  return [];
}

function nextStatus(status: RagStatus, action: RagReviewAction): RagStatus {
  if (action === "DISABLE" && status !== "DISABLED") return "DISABLED";
  throw new AppError("RAG_TRANSITION_INVALID", "Thao tác không hợp lệ ở trạng thái hiện tại.", 409);
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("INVALID_RAG_INPUT", "Thông tin tài liệu không hợp lệ.", 400);
  return result.data;
}

export async function createRagUploadUrl(headers: Headers, body: unknown, deps: RagDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  const input = parse(uploadRequest, body);
  const type = declaredRagFileType(input.fileName, input.mimeType, input.sizeBytes);
  const pathname = `rag/${actor.id}/${randomUUID()}.${type.toLowerCase()}`;
  return deps.storage.issue(pathname, input.mimeType);
}

export async function finalizeRagUpload(headers: Headers, body: unknown, key: string, deps: RagDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  const input = parse(finalizeRequest, body);
  const type = declaredRagFileType(input.originalFileName, input.mimeType, input.sizeBytes);
  const pathPattern = new RegExp(`^rag/${actor.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9a-f-]{36}\\.${type.toLowerCase()}$`);
  if (!pathPattern.test(input.pathname)) throw new AppError("INVALID_RAG_PATH", "Đường dẫn tệp không hợp lệ.", 400);
  if (input.sourceUrl) {
    try { const url = new URL(input.sourceUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
    catch { throw new AppError("INVALID_RAG_SOURCE", "URL nguồn không hợp lệ.", 400); }
  }
  const replay = await preflightIdempotentReplay<RagFinalizeResult>({
    database: deps.database, actorId: actor.id, operation: "rag-document:upload", key, input,
  });
  if (replay.status !== "ABSENT") return replay;
  const blob = await deps.storage.read(input.pathname);
  if (blob.sizeBytes !== input.sizeBytes || blob.mimeType !== input.mimeType) throw new AppError("INVALID_RAG_FILE", "Tệp trong kho không khớp thông tin khai báo.", 400);
  validateRagFile(input.originalFileName, blob.mimeType, blob.bytes);
  return executeIdempotentWrite<RagFinalizeResult>({
    database: deps.database, actorId: actor.id, operation: "rag-document:upload", key, input,
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      if (await tx.ragDocument.findUnique({ where: { storagePath: input.pathname }, select: { id: true } })) throw new AppError("RAG_FILE_ALREADY_REGISTERED", "Tệp đã được ghi nhận.", 409);
      const row = await tx.ragDocument.create({ data: {
        originalFileName: input.originalFileName, fileType: type, mimeType: input.mimeType,
        sizeBytes: input.sizeBytes, storagePath: input.pathname, sourceTitle: input.sourceTitle,
        sourceUrl: input.sourceUrl || null, author: input.author || null, topic: input.topic || null,
        locality: input.locality || null, uploadedById: actor.id, status: "UPLOADED",
        publicQaApproved: false,
      } });
      return { id: row.id, originalFileName: row.originalFileName, sourceTitle: row.sourceTitle, status: row.status, retrievalEligible: false, publicQaApproved: false, publicQaEligible: false, ineligibilityReason: "STATUS_NOT_INDEXED" as const };
    },
  });
}

export async function getRagOriginal(headers: Headers, id: string, deps: RagDependencies) {
  await requireActor(headers, deps, "admin");
  validateId(id);
  const row = await deps.database.ragDocument.findUnique({ where: { id }, select: { originalFileName: true, mimeType: true, storagePath: true } });
  if (!row) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
  return { row, stream: await deps.storage.stream(row.storagePath) };
}

export type RagDocumentListView = "active" | "deleted";

export async function listRagDocuments(headers: Headers, deps: RagDependencies, view: RagDocumentListView = "active") {
  await requireActor(headers, deps, "admin");
  const [rows, publications] = await Promise.all([
    deps.database.ragDocument.findMany({
      where: { deletedAt: view === "deleted" ? { not: null } : null },
      select: listFields, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    deps.database.ragIndexPublication.findMany({
      select: {
        ragDocumentId: true,
        generation: {
          select: {
            state: true,
            embeddingProvider: true,
            embeddingModel: true,
            embeddingDimensions: true,
          },
        },
      },
    }),
  ]);
  const pubMap = new Map(publications.map(p => [p.ragDocumentId, p.generation]));
  return { items: rows.map(row => {
    const gen = pubMap.get(row.id);
    const { publicQaEligible, ineligibilityReason } = computeRagEligibility(row.status, row.publicQaApproved, gen, row.deletedAt);
    return {
      id: row.id, originalFileName: row.originalFileName, sourceTitle: row.sourceTitle,
      fileType: row.fileType, status: row.status, publicQaApproved: row.publicQaApproved,
      deletedAt: row.deletedAt,
      publicQaEligible, ineligibilityReason,
      retrievalEligible: !row.deletedAt && retrievalEligible(row.status),
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }) };
}

const emptyRequest = z.object({}).strict();

export async function softDeleteRagDocument(headers: Headers, id: string, body: unknown, key: string, deps: RagDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  validateId(id);
  parse(emptyRequest, body);
  const input = { documentId: id, action: "DELETE" as const };
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: `rag-document:${id}:delete`, key, input,
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const now = new Date();
      // Updating the document first takes the same document-before-job lock used
      // by index admission and publication finalization.
      const updated = await tx.ragDocument.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: now, publicQaApproved: false, updatedAt: now },
      });
      if (updated.count === 0) {
        const existing = await tx.ragDocument.findUnique({ where: { id }, select: { deletedAt: true } });
        if (!existing) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
        if (!existing.deletedAt) throw new AppError("RAG_DOCUMENT_DELETE_CONFLICT", "Không thể xóa tài liệu lúc này. Hãy thử lại.", 409);
        return { id, deletedAt: existing.deletedAt };
      }

      await tx.ragIndexJob.updateMany({
        where: { ragDocumentId: id, status: { in: ["QUEUED", "UNKNOWN"] } },
        data: { status: "CANCELLED", cancelRequestedAt: now, completedAt: now, failureCode: "DOCUMENT_DELETED", leaseToken: null, leaseExpiresAt: null, updatedAt: now },
      });
      await tx.ragIndexJob.updateMany({
        where: { ragDocumentId: id, status: "RUNNING", cancelRequestedAt: null },
        data: { cancelRequestedAt: now, updatedAt: now },
      });
      return { id, deletedAt: now };
    },
  });
}

export async function restoreRagDocument(headers: Headers, id: string, body: unknown, key: string, deps: RagDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  validateId(id);
  parse(emptyRequest, body);
  const input = { documentId: id, action: "RESTORE" as const };
  return executeIdempotentWrite({
    database: deps.database, actorId: actor.id, operation: `rag-document:${id}:restore`, key, input,
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const now = new Date();
      const updated = await tx.ragDocument.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null, status: "DISABLED", publicQaApproved: false, updatedAt: now },
      });
      if (updated.count !== 1) {
        const existing = await tx.ragDocument.findUnique({ where: { id }, select: { deletedAt: true } });
        if (!existing) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
        throw new AppError("RAG_DOCUMENT_NOT_DELETED", "Tài liệu không nằm trong danh sách đã xóa.", 409);
      }
      return { id, status: "DISABLED" as const, deletedAt: null, publicQaApproved: false, updatedAt: now };
    },
  });
}

export async function getRagDocument(headers: Headers, id: string, deps: RagDependencies) {
  await requireActor(headers, deps, "admin");
  validateId(id);
  const [row, pub] = await Promise.all([
    deps.database.ragDocument.findUnique({ where: { id }, select: detailFields }),
    deps.database.ragIndexPublication.findUnique({
      where: { ragDocumentId: id },
      select: {
        generation: {
          select: {
            state: true,
            embeddingProvider: true,
            embeddingModel: true,
            embeddingDimensions: true,
          },
        },
      },
    }),
  ]);
  if (!row) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
  const { publicQaEligible, ineligibilityReason } = computeRagEligibility(row.status, row.publicQaApproved, pub?.generation, row.deletedAt);
  return { document: {
    id: row.id, originalFileName: row.originalFileName, fileType: row.fileType,
    mimeType: row.mimeType, sizeBytes: row.sizeBytes, sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl, author: row.author, topic: row.topic,
    locality: row.locality, uploadedById: row.uploadedById, status: row.status,
    publicQaApproved: row.publicQaApproved, publicQaEligible, ineligibilityReason, deletedAt: row.deletedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    retrievalEligible: !row.deletedAt && retrievalEligible(row.status), allowedActions: row.deletedAt ? [] : allowedActions(row.status, row.publicQaApproved, computeRagEligibility(row.status, true, pub?.generation, row.deletedAt).publicQaEligible),
  } };
}

export async function transitionRagDocument(headers: Headers, id: string, body: unknown, key: string, deps: RagDependencies) {
  const actor = await requireActor(headers, deps, "admin");
  validateId(id);
  const { action, confirmedSourceReview } = parse(reviewRequest, body);
  const input = { id, action, ...(action === "ENABLE_PUBLIC_QA" ? { confirmedSourceReview } : {}) };
  const replay = await preflightIdempotentReplay<RagDocumentTransitionResult>({
    database: deps.database, actorId: actor.id, operation: `rag-document:${id}:${action}`, key, input,
  });
  if (replay.status !== "ABSENT") return replay;
  return executeIdempotentWrite<RagDocumentTransitionResult>({
    database: deps.database, actorId: actor.id, operation: `rag-document:${id}:${action}`,
    key, input,
    execute: async tx => {
      await requireActor(headers, { ...deps, database: tx as unknown as Database }, "admin");
      const current = await tx.ragDocument.findUnique({ where: { id }, select: { status: true, deletedAt: true } });
      if (!current) throw new AppError("RAG_DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu.", 404);
      if (current.deletedAt) throw new AppError("RAG_DOCUMENT_DELETED", "Tài liệu đã xóa và chỉ có thể xem ở chế độ chỉ đọc.", 409);
      if (action === "ENABLE_PUBLIC_QA") {
        if (current.status !== "INDEXED") throw new AppError("RAG_TRANSITION_INVALID", "Chỉ tài liệu đã lập chỉ mục mới có thể cấp quyền công khai.", 409);
        if (confirmedSourceReview !== true) throw new AppError("RAG_SOURCE_REVIEW_REQUIRED", "Hãy đối soát tệp gốc và nguồn trước khi cấp quyền công khai.", 400);
        const publication = await tx.ragIndexPublication.findUnique({ where: { ragDocumentId: id }, select: { generation: { select: { state: true, embeddingProvider: true, embeddingModel: true, embeddingDimensions: true } } } });
        if (computeRagEligibility(current.status, true, publication?.generation).publicQaEligible !== true) throw new AppError("RAG_INDEX_NOT_READY", "Chỉ mục chưa sẵn sàng để sử dụng công khai.", 409);
        await tx.ragDocument.update({ where: { id }, data: { publicQaApproved: true } });
      } else if (action === "DISABLE_PUBLIC_QA") {
        await tx.ragDocument.update({ where: { id }, data: { publicQaApproved: false } });
      } else {
        const status = nextStatus(current.status, action);
        const updated = await tx.ragDocument.updateMany({ where: { id, status: current.status }, data: { status } });
        if (updated.count !== 1) throw new AppError("RAG_TRANSITION_INVALID", "Trạng thái tài liệu đã thay đổi. Hãy tải lại.", 409);
      }
      const saved = await tx.ragDocument.findUnique({ where: { id }, select: { status: true, publicQaApproved: true, updatedAt: true } });
      const pub = await tx.ragIndexPublication.findUnique({
        where: { ragDocumentId: id },
        select: {
          generation: {
            select: {
              state: true,
              embeddingProvider: true,
              embeddingModel: true,
              embeddingDimensions: true,
            },
          },
        },
      });
      const { publicQaEligible, ineligibilityReason } = computeRagEligibility(saved!.status, saved!.publicQaApproved, pub?.generation);
      return {
        id,
        status: saved!.status,
        publicQaApproved: saved!.publicQaApproved,
        publicQaEligible,
        ineligibilityReason,
        updatedAt: saved!.updatedAt,
        retrievalEligible: retrievalEligible(saved!.status),
        allowedActions: allowedActions(saved!.status, saved!.publicQaApproved, computeRagEligibility(saved!.status, true, pub?.generation).publicQaEligible),
      };
    },
  });
}

export async function bulkSetRagPublicQa(headers: Headers, body: unknown, deps: RagDependencies) {
  await requireActor(headers, deps, "admin");
  const input = parse(bulkRequest, body);
  if (input.action !== "DISABLE_SELECTED") throw new AppError("RAG_SOURCE_REVIEW_REQUIRED", "Cấp quyền công khai từng tài liệu sau khi đối soát tệp gốc.", 409);
  const res = await deps.database.ragDocument.updateMany({
    where: { id: { in: input.documentIds }, deletedAt: null },
    data: { publicQaApproved: false },
  });
  return { updatedCount: res.count, ids: input.documentIds };
}
