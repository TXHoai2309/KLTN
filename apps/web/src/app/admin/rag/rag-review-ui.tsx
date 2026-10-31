"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileText, Plus, AlertTriangle, LoaderCircle, ShieldCheck, ShieldAlert, Sparkles, Trash2, RotateCcw, MoreHorizontal, ExternalLink, Download, CheckCircle2, X, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@KLTN/ui/components/button";
import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";
import { confirmedRagDetail } from "@/modules/rag-document/rag-review-state";
import { RagIndexPanel } from "./rag-index-panel";

type RagStatus = "UPLOADED" | "REVIEWING" | "APPROVED" | "INDEXED" | "DISABLED";
type RagAction = "START_REVIEW" | "APPROVE" | "DISABLE" | "ENABLE_PUBLIC_QA" | "DISABLE_PUBLIC_QA";
type RagIneligibilityReason = "STATUS_NOT_INDEXED" | "NOT_PUBLIC_APPROVED" | "NO_READY_INDEX" | "EMBEDDING_MISMATCH" | "DOCUMENT_DELETED";

type RagItem = {
  id: string;
  originalFileName: string;
  sourceTitle: string;
  fileType: "PDF" | "DOCX" | "TXT";
  status: RagStatus;
  retrievalEligible: boolean;
  publicQaApproved: boolean;
  publicQaEligible: boolean;
  ineligibilityReason: RagIneligibilityReason | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RagDetail = RagItem & {
  mimeType: string;
  sizeBytes: number;
  sourceUrl: string | null;
  author: string | null;
  topic: string | null;
  locality: string | null;
  uploadedById: string;
  allowedActions: RagAction[];
};

type RagTransition = Pick<RagDetail, "id" | "status" | "updatedAt" | "retrievalEligible" | "allowedActions" | "publicQaApproved" | "publicQaEligible" | "ineligibilityReason">;
type RagBulkResult = { updatedCount: number; ids: string[] };

function isRagBulkResult(value: unknown): value is RagBulkResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RagBulkResult>;
  return Number.isInteger(candidate.updatedCount) &&
    (candidate.updatedCount ?? -1) >= 0 &&
    Array.isArray(candidate.ids) &&
    candidate.ids.every(id => typeof id === "string");
}

const statusLabel: Record<RagStatus, string> = {
  UPLOADED: "Chờ kiểm duyệt",
  REVIEWING: "Đang kiểm duyệt",
  APPROVED: "Đã phê duyệt",
  INDEXED: "Đã lập chỉ mục",
  DISABLED: "Đã vô hiệu hóa",
};

const ineligibilityReasonLabel: Record<RagIneligibilityReason, string> = {
  STATUS_NOT_INDEXED: "Chưa lập chỉ mục (INDEXED)",
  NOT_PUBLIC_APPROVED: "Chưa cấp quyền AI công khai",
  NO_READY_INDEX: "Chỉ mục chưa sẵn sàng (READY)",
  EMBEDDING_MISMATCH: "Mô hình vector không tương thích",
  DOCUMENT_DELETED: "Tài liệu đã xóa; không dùng cho truy xuất",
};

const date = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function useRagRead<T>(url: string, initialValue: T | null = null) {
  const [data, setData] = useState<T | null>(initialValue);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (initialValue && reload === 0) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    void fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.success !== true) throw new Error(body.error?.message || "Không thể tải tài liệu.");
        if (!controller.signal.aborted) setData(body.data as T);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không thể tải tài liệu.");
      });
    return () => controller.abort();
  }, [url, reload]);
  return { data, setData, error, retry: () => setReload(value => value + 1) };
}

function RagState({ error, retry, detail = false }: { error: string; retry: () => void; detail?: boolean }) {
  return (
    <div className="destination-state" role={error ? "alert" : "status"}>
      {error ? <AlertTriangle size={27} aria-hidden="true" /> : <LoaderCircle size={27} className="destination-spinner" aria-hidden="true" />}
      <h2>{error ? "Chưa tải được tài liệu" : "Đang tải tài liệu…"}</h2>
      {error && (
        <>
          <p>{error}</p>
          <Button type="button" onClick={retry}>
            Thử lại
          </Button>
        </>
      )}
      {!error && <p>{detail ? "Đang tải chi tiết tài liệu." : "Đang tải danh sách tài liệu."}</p>}
    </div>
  );
}

export function RagStatusBadge({
  item,
}: {
  item: {
    status: RagStatus;
    retrievalEligible: boolean;
    deletedAt?: string | null;
    publicQaApproved?: boolean;
    publicQaEligible?: boolean;
    ineligibilityReason?: RagIneligibilityReason | null;
  };
}) {
  return (
    <div className="rag-statuses">
      <span className={`rag-status is-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>
      {item.deletedAt && <span className="rag-status is-deleted">Đã xóa</span>}
      <span className="rag-retrieval">{item.retrievalEligible ? "Đủ điều kiện truy xuất" : "Chưa dùng cho truy xuất"}</span>
      {item.publicQaApproved !== undefined && (
        item.publicQaApproved ? (
          <span className="rag-badge is-public-approved" title="Tài liệu được phép làm nguồn AI công khai">
            <ShieldCheck size={13} aria-hidden="true" /> Đã cấp quyền AI
          </span>
        ) : (
          <span className="rag-badge is-public-unapproved" title="Chưa cho phép AI sử dụng công khai">
            <ShieldAlert size={13} aria-hidden="true" /> Chưa cấp quyền AI
          </span>
        )
      )}
      {item.publicQaEligible ? (
        <span className="rag-badge is-ai-eligible" title="Tài liệu đáp ứng đầy đủ điều kiện để AI tìm kiếm và trả lời">
          <Sparkles size={13} aria-hidden="true" /> Sẵn sàng cho AI
        </span>
      ) : item.ineligibilityReason ? (
        <span className="rag-badge is-ai-ineligible" title={`Lý do: ${ineligibilityReasonLabel[item.ineligibilityReason]}`}>
          {ineligibilityReasonLabel[item.ineligibilityReason]}
        </span>
      ) : null}
    </div>
  );
}

type RagListView = "active" | "deleted";
type RagLifecycleAttempt = { kind: "delete" | "restore"; key: string };

export function RagList({ initialView = "active" }: { initialView?: RagListView }) {
  const deletedView = initialView === "deleted";
  const listUrl = deletedView ? "/api/admin/rag-documents?view=deleted" : "/api/admin/rag-documents";
  const { data, setData, error, retry } = useRagRead<{ items: RagItem[] }>(listUrl);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkUnknown, setBulkUnknown] = useState(false);
  const bulkAttempt = useRef<{ key: string; body: { action: "ENABLE_ALL_INDEXED" } } | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [uncertainIds, setUncertainIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<RagItem | null>(null);
  const attempts = useRef(new Map<string, RagLifecycleAttempt>());
  const activeRequests = useRef(new Set<string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (confirmation && !dialog.current?.open) dialog.current?.showModal();
    else if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);
  useEffect(() => {
    if (confirmation || !restoreFocus.current) return;
    restoreFocus.current = false;
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else listHeading.current?.focus();
    });
  }, [confirmation, data]);

  const items = data?.items ?? [];
  const indexedCount = items.filter(i => i.status === "INDEXED").length;
  const publicApprovedCount = items.filter(i => i.publicQaApproved).length;
  const publicEligibleCount = items.filter(i => i.publicQaEligible).length;
  const unapprovedIndexed = items.filter(i => i.status === "INDEXED" && !i.publicQaApproved);

  async function handleBulkEnableIndexed() {
    if (bulkBusy || deletedView || unapprovedIndexed.length === 0) return;
    const attempt = bulkAttempt.current ?? {
      key: createIdempotencyKey(),
      body: { action: "ENABLE_ALL_INDEXED" as const },
    };
    bulkAttempt.current = attempt;
    setBulkBusy(true);
    setBulkMessage("");
    try {
      const outcome = await sendIdempotentMutation<RagBulkResult>("/api/admin/rag-documents/bulk-public-qa", {
        idempotencyKey: attempt.key,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt.body),
        },
      });
      if (outcome.status === "SUCCESS" && isRagBulkResult(outcome.data)) {
        bulkAttempt.current = null;
        setBulkUnknown(false);
        setBulkMessage(`Đã cấp quyền AI công khai cho ${outcome.data.updatedCount} tài liệu đã lập chỉ mục.`);
        retry();
      } else if (outcome.status === "FAILED") {
        bulkAttempt.current = null;
        setBulkUnknown(false);
        setBulkMessage(outcome.error.message);
      } else {
        setBulkUnknown(true);
        setBulkMessage("Chưa xác định được kết quả lưu. Yêu cầu có thể đã được xử lý. Hãy kiểm tra lại trước khi tiếp tục để tránh cập nhật trùng.");
      }
    } catch {
      setBulkUnknown(true);
      setBulkMessage("Chưa xác định được kết quả lưu. Yêu cầu có thể đã được xử lý. Hãy kiểm tra lại trước khi tiếp tục để tránh cập nhật trùng.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runLifecycle(item: RagItem, kind: RagLifecycleAttempt["kind"]) {
    if (activeRequests.current.has(item.id)) return;
    const existing = attempts.current.get(item.id);
    const attempt = existing?.kind === kind ? existing : { kind, key: createIdempotencyKey() };
    attempts.current.set(item.id, attempt);
    activeRequests.current.add(item.id);
    setPendingIds(current => new Set(current).add(item.id));
    try {
      const result = await sendIdempotentMutation<{ id: string }>(
        kind === "delete" ? `/api/admin/rag-documents/${encodeURIComponent(item.id)}` : `/api/admin/rag-documents/${encodeURIComponent(item.id)}/restore`,
        { idempotencyKey: attempt.key, init: { method: kind === "delete" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: "{}" } },
      );
      if (result.status === "SUCCESS") {
        attempts.current.delete(item.id);
        setUncertainIds(current => { const next = new Set(current); next.delete(item.id); return next; });
        setData(current => current ? { items: current.items.filter(entry => entry.id !== item.id) } : current);
        if (kind === "delete") setConfirmation(current => current?.id === item.id ? null : current);
        restoreFocus.current = true;
        toast.success(kind === "delete" ? "Đã chuyển tài liệu vào danh sách đã xóa." : "Đã khôi phục tài liệu về trạng thái vô hiệu hóa.", { position: "bottom-right" });
      } else if (result.status === "FAILED") {
        attempts.current.delete(item.id);
        setUncertainIds(current => { const next = new Set(current); next.delete(item.id); return next; });
        if (kind === "delete") setConfirmation(current => current?.id === item.id ? null : current);
        toast.error(result.error.message || `Không thể ${kind === "delete" ? "xóa" : "khôi phục"} tài liệu.`, { position: "bottom-right" });
      } else {
        setUncertainIds(current => new Set(current).add(item.id));
        toast.warning(`Chưa xác định kết quả ${kind === "delete" ? "xóa" : "khôi phục"}.`, {
          position: "bottom-right", description: "Thử lại cùng thao tác sẽ giữ nguyên request và Idempotency-Key.",
        });
      }
    } catch {
      setUncertainIds(current => new Set(current).add(item.id));
      toast.warning("Chưa xác định kết quả thao tác.", { position: "bottom-right", description: "Request và Idempotency-Key được giữ nguyên để thử lại." });
    } finally {
      activeRequests.current.delete(item.id);
      setPendingIds(current => { const next = new Set(current); next.delete(item.id); return next; });
    }
  }

  function openDelete(item: RagItem, button: HTMLButtonElement) {
    if (activeRequests.current.has(item.id)) return;
    button.closest("details")?.removeAttribute("open");
    opener.current = button;
    setConfirmation(item);
  }
  function confirmDelete() {
    if (confirmation) void runLifecycle(confirmation, "delete");
  }
  function cancelDelete() {
    if (pendingIds.size) return;
    restoreFocus.current = true;
    setConfirmation(null);
  }
  function restore(item: RagItem, button: HTMLButtonElement) {
    if (activeRequests.current.has(item.id)) return;
    button.closest("details")?.removeAttribute("open");
    opener.current = button;
    void runLifecycle(item, "restore");
  }

  const activeHref = "/admin/rag" as Route;
  const deletedHref = "/admin/rag?view=deleted" as Route;

  return (
    <main className="destination-page rag-review-page">
      <div className="destination-container">
        <header className="destination-heading">
          <div>
            <h1>Tài liệu RAG</h1>
            <p>Theo dõi nguồn tài liệu, tiến trình kiểm duyệt và quyền truy xuất AI.</p>
          </div>
          <Link className="destination-primary" href={"/admin/rag/upload" as Route}>
            <Plus size={17} aria-hidden="true" />
            Tải tài liệu mới
          </Link>
        </header>

        {!deletedView && data && (
          <div className="rag-stats-grid">
            <div className="rag-stat-card"><div className="rag-stat-label">Tổng tài liệu</div><div className="rag-stat-value">{items.length}</div></div>
            <div className="rag-stat-card"><div className="rag-stat-label">Đã lập chỉ mục</div><div className="rag-stat-value">{indexedCount}</div></div>
            <div className="rag-stat-card"><div className="rag-stat-label">Đã cấp quyền AI</div><div className="rag-stat-value">{publicApprovedCount}</div></div>
            <div className="rag-stat-card"><div className="rag-stat-label">Sẵn sàng cho AI</div><div className="rag-stat-value">{publicEligibleCount}</div></div>
          </div>
        )}

        {!deletedView && unapprovedIndexed.length > 0 && (
          <div className="rag-bulk-bar">
            <div className="rag-bulk-info">Có <strong>{unapprovedIndexed.length}</strong> tài liệu đã lập chỉ mục nhưng chưa được cấp quyền làm nguồn trả lời AI công khai.</div>
            <Button type="button" className="destination-primary" disabled={bulkBusy} onClick={() => void handleBulkEnableIndexed()}>
              <Sparkles size={16} aria-hidden="true" />
              {bulkBusy ? "Đang xử lý…" : bulkUnknown ? "Kiểm tra lại kết quả" : `Duyệt công khai tất cả (${unapprovedIndexed.length})`}
            </Button>
          </div>
        )}

        {bulkMessage && <div className="rag-action-feedback" role="status" style={{ marginBottom: "16px" }}>{bulkMessage}</div>}

        <nav className="rag-list-tabs" aria-label="Lọc danh sách tài liệu">
          <Link href={activeHref} aria-current={!deletedView ? "page" : undefined}>Đang hoạt động</Link>
          <Link href={deletedHref} aria-current={deletedView ? "page" : undefined}>Đã xóa</Link>
        </nav>

        <section className="destination-card" aria-labelledby="rag-list-title">
          <div className="destination-section-heading">
            <span className="destination-section-icon" aria-hidden="true"><FileText size={21} /></span>
            <div>
              <h2 id="rag-list-title" ref={listHeading} tabIndex={-1}>{deletedView ? "Tài liệu đã xóa" : "Danh sách tài liệu"}</h2>
              <p>{deletedView ? "Tài liệu đã xóa được giữ nguyên lịch sử và không còn được dùng cho truy xuất mới." : "Tài liệu cần được lập chỉ mục và cấp quyền AI công khai để trợ lý có thể tự động tìm kiếm."}</p>
            </div>
          </div>
          {error || !data ? (
            <RagState error={error} retry={retry} />
          ) : data.items.length === 0 ? (
            <div className="destination-state destination-empty">
              <FileText size={34} aria-hidden="true" />
              <h3>{deletedView ? "Chưa có tài liệu đã xóa" : "Chưa có tài liệu nào"}</h3>
              <p>{deletedView ? "Tài liệu được xóa mềm sẽ xuất hiện tại đây để Admin có thể khôi phục." : "Tải tài liệu đầu tiên để bắt đầu kiểm duyệt."}</p>
              {!deletedView && <Link className="destination-primary" href={"/admin/rag/upload" as Route}>Tải tài liệu mới</Link>}
            </div>
          ) : (
            <ul className="rag-document-list">
              {items.map(item => {
                const pending = pendingIds.has(item.id);
                const uncertain = uncertainIds.has(item.id);
                return (
                  <li key={item.id} className="rag-document-row" aria-busy={pending}>
                    <div className="rag-document-main">
                      <FileText size={20} aria-hidden="true" />
                      <div><strong>{item.originalFileName}</strong><p>{item.sourceTitle}</p></div>
                    </div>
                    <div className="rag-document-meta">
                      <span>{item.fileType}{deletedView && item.deletedAt ? ` · Xóa ${date(item.deletedAt)}` : ""}</span>
                      <RagStatusBadge item={item} />
                    </div>
                    <div className="rag-row-actions rag-row-actions-desktop">
                      <Link className="destination-edit" href={`/admin/rag/${encodeURIComponent(item.id)}` as Route} aria-label={`Mở chi tiết ${item.originalFileName}`}>Mở chi tiết</Link>
                      {deletedView ? (
                        <button type="button" className="destination-restore rag-row-action" aria-label={`${uncertain ? "Thử lại khôi phục" : "Khôi phục"} ${item.originalFileName}`} disabled={pending} aria-busy={pending} onClick={event => restore(item, event.currentTarget)}>
                          {pending ? <LoaderCircle size={15} className="destination-spinner" aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
                          {pending ? "Đang khôi phục…" : uncertain ? "Thử lại" : "Khôi phục"}
                        </button>
                      ) : (
                        <button type="button" className="destination-delete rag-row-action" aria-label={`${uncertain ? "Thử lại xóa" : "Xóa"} ${item.originalFileName}`} disabled={pending} onClick={event => openDelete(item, event.currentTarget)}>
                          <Trash2 size={15} aria-hidden="true" />{uncertain ? "Thử xác nhận" : "Xóa"}
                        </button>
                      )}
                    </div>
                    <details className="rag-row-actions rag-row-actions-mobile">
                      <summary aria-label={`Thao tác với ${item.originalFileName}`}><MoreHorizontal size={18} aria-hidden="true" /><span className="destination-sr-only">Thao tác</span></summary>
                      <div className="rag-mobile-action-menu">
                        <Link
                          href={`/admin/rag/${encodeURIComponent(item.id)}` as Route}
                          aria-label={`Mở chi tiết ${item.originalFileName}`}
                          onClick={event => { const d = event.currentTarget.closest("details"); d?.removeAttribute("open"); }}
                        >
                          <ExternalLink size={14} aria-hidden="true" />
                          <span>Mở chi tiết</span>
                        </Link>
                        {deletedView ? (
                          <button
                            type="button"
                            onClick={event => {
                              const d = event.currentTarget.closest("details");
                              d?.removeAttribute("open");
                              restore(item, event.currentTarget);
                            }}
                            disabled={pending}
                            aria-busy={pending}
                          >
                            {pending ? <LoaderCircle size={14} className="destination-spinner" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
                            <span>{pending ? "Đang khôi phục…" : uncertain ? "Thử lại khôi phục" : "Khôi phục"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={event => {
                              const d = event.currentTarget.closest("details");
                              d?.removeAttribute("open");
                              openDelete(item, event.currentTarget);
                            }}
                            disabled={pending}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            <span>{uncertain ? "Thử xác nhận lại" : "Xóa"}</span>
                          </button>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <dialog ref={dialog} className="destination-confirm rag-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); cancelDelete(); }}>
        {confirmation && <>
          <h2 id={titleId}>{uncertainIds.has(confirmation.id) ? "Xác nhận lại việc xóa?" : "Xóa tài liệu RAG?"}</h2>
          <p id={descriptionId}>Bạn sắp xóa <strong>{confirmation.originalFileName}</strong>. Tài liệu sẽ bị ẩn khỏi danh sách hoạt động và dừng dùng cho truy xuất. File cùng lịch sử vẫn được giữ lại để có thể khôi phục.</p>
          {uncertainIds.has(confirmation.id) && <p className="destination-uncertain destination-dialog-warning" role="status" aria-live="polite">Kết quả lần trước chưa xác định. Thử lại sẽ dùng cùng request và Idempotency-Key.</p>}
          <div>
            <button type="button" autoFocus disabled={pendingIds.size > 0} onClick={cancelDelete}>Hủy</button>
            <button type="button" className="destination-destructive" disabled={pendingIds.size > 0} aria-busy={pendingIds.has(confirmation.id)} onClick={confirmDelete}>
              {pendingIds.has(confirmation.id) && <LoaderCircle size={15} className="destination-spinner" aria-hidden="true" />}
              {pendingIds.has(confirmation.id) ? "Đang xóa…" : uncertainIds.has(confirmation.id) ? "Thử lại cùng yêu cầu" : "Xóa tài liệu"}
            </button>
          </div>
        </>}
      </dialog>
    </main>
  );
}

export function RagDetailView({ id, initialDocument }: { id: string; initialDocument?: RagDetail }) {
  const { data, setData, error, retry } = useRagRead<{ document: RagDetail }>(
    `/api/admin/rag-documents/${encodeURIComponent(id)}`,
    initialDocument ? { document: initialDocument } : null,
  );
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const flight = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const pending = useRef<{ action: RagAction; key: string } | null>(null);

  useEffect(() => {
    if (isReviewModalOpen && !reviewDialogRef.current?.open) {
      reviewDialogRef.current?.showModal();
    } else if (!isReviewModalOpen && reviewDialogRef.current?.open) {
      reviewDialogRef.current?.close();
    }
  }, [isReviewModalOpen]);

  async function act(action: RagAction, key = createIdempotencyKey()) {
    if (flight.current || (pending.current && pending.current.key !== key)) return;
    flight.current = true;
    const requestGeneration = generation.current;
    setBusy(true);
    setFeedback("");
    pending.current = { action, key };
    try {
      const outcome = await sendIdempotentMutation<RagTransition>(`/api/admin/rag-documents/${encodeURIComponent(id)}/actions`, {
        idempotencyKey: key,
        init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
      });
      if (generation.current !== requestGeneration) return;
      if (outcome.status === "SUCCESS") {
        setData(current => (current ? { document: confirmedRagDetail(current.document, outcome) } : current));
        pending.current = null;
        setUncertain(false);
        if (action === "APPROVE") {
          setIsReviewModalOpen(false);
          toast.success("Đã phê duyệt tài liệu thành công. Hãy tiếp tục bước Lập chỉ mục AI bên dưới.", { position: "bottom-right" });
        } else if (action === "DISABLE") {
          setIsReviewModalOpen(false);
          toast.success("Đã vô hiệu hóa tài liệu.", { position: "bottom-right" });
        }
        setFeedback(
          action === "DISABLE"
            ? "Đã vô hiệu hóa. Tài liệu không còn đủ điều kiện cho lượt truy xuất mới."
            : action === "APPROVE"
              ? "Đã phê duyệt. Tài liệu đã sẵn sàng để lập chỉ mục vector AI."
              : action === "ENABLE_PUBLIC_QA"
                ? "Đã cấp quyền làm nguồn trả lời AI công khai."
                : action === "DISABLE_PUBLIC_QA"
                  ? "Đã thu hồi quyền làm nguồn trả lời AI công khai. AI sẽ ngừng sử dụng tài liệu này ngay lập tức."
                  : "Đã bắt đầu kiểm duyệt.",
        );
      } else if (outcome.status === "FAILED") {
        pending.current = null;
        setUncertain(false);
        setFeedback(outcome.error.message);
        toast.error(outcome.error.message || "Thao tác thất bại.", { position: "bottom-right" });
      } else {
        setUncertain(true);
        setFeedback("Chưa xác định được kết quả. Thử lại với cùng yêu cầu hoặc tải lại chi tiết để kiểm tra.");
        toast.warning("Chưa xác định được kết quả thao tác.", { position: "bottom-right" });
      }
    } finally {
      flight.current = false;
      if (generation.current === requestGeneration) setBusy(false);
    }
  }

  function handleStartReview() {
    setIsReviewModalOpen(true);
    if (item?.status === "UPLOADED") {
      void act("START_REVIEW");
    }
  }

  const item = data?.document;
  return (
    <main className="destination-page rag-review-page">
      <div className="destination-container destination-form-container">
        <Link className="destination-back destination-button" href={(item?.deletedAt ? "/admin/rag?view=deleted" : "/admin/rag") as Route}>
          <ArrowLeft size={17} aria-hidden="true" />
          Danh sách tài liệu
        </Link>
        <header className="destination-heading">
          <div>
            <h1>Chi tiết tài liệu RAG</h1>
            <p>Kiểm tra tệp gốc, thông tin nguồn và cấu hình quyền truy xuất AI.</p>
          </div>
        </header>
        {error || !item ? (
          <section className="destination-card">
            <RagState error={error} retry={retry} detail />
          </section>
        ) : (
          <>
            {/* KHỐI 1: Thông tin tệp gốc */}
            <section className="destination-card" aria-labelledby="rag-file-title">
              <div className="destination-section-heading">
                <span className="destination-section-icon" aria-hidden="true">
                  <FileText size={21} />
                </span>
                <div>
                  <h2 id="rag-file-title">{item.originalFileName}</h2>
                  <p>{item.sourceTitle}</p>
                </div>
              </div>
              <RagStatusBadge item={item} />
              <dl className="rag-detail-grid">
                <div>
                  <dt>Loại tệp</dt>
                  <dd>{item.fileType}</dd>
                </div>
                <div>
                  <dt>Dung lượng</dt>
                  <dd>{(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd>
                </div>
                <div>
                  <dt>Tải lên</dt>
                  <dd>{date(item.createdAt)}</dd>
                </div>
                <div>
                  <dt>Cập nhật</dt>
                  <dd>{date(item.updatedAt)}</dd>
                </div>
              </dl>
              <a className="destination-button rag-file-link" href={`/api/admin/rag-documents/${encodeURIComponent(id)}/file`}>
                Tải tài liệu gốc để xem
              </a>
            </section>

            {item.deletedAt && (
              <section className="destination-card rag-deleted-notice" role="status" aria-label="Tài liệu đã xóa">
                <strong>Tài liệu đã xóa mềm</strong>
                <p>Đã xóa lúc {date(item.deletedAt)}. Nội dung này chỉ đọc, được giữ lại để khôi phục và không dùng cho truy xuất mới.</p>
              </section>
            )}

            {/* KHỐI 2: Thông tin nguồn */}
            <section className="destination-card" aria-labelledby="rag-source-title">
              <h2 id="rag-source-title">Thông tin nguồn</h2>
              <dl className="rag-detail-grid">
                <div>
                  <dt>Nguồn</dt>
                  <dd>{item.sourceTitle}</dd>
                </div>
                <div>
                  <dt>URL nguồn</dt>
                  <dd>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Mở trang nguồn</a> : "Chưa khai báo"}</dd>
                </div>
                <div>
                  <dt>Tác giả</dt>
                  <dd>{item.author || "Chưa khai báo"}</dd>
                </div>
                <div>
                  <dt>Chủ đề</dt>
                  <dd>{item.topic || "Chưa khai báo"}</dd>
                </div>
                <div>
                  <dt>Địa phương</dt>
                  <dd>{item.locality || "Chưa khai báo"}</dd>
                </div>
              </dl>
            </section>

            {/* KHỐI 3: Quản lý trạng thái tài liệu (BƯỚC 1: KIỂM DUYỆT & DUYỆT - ĐẨY LÊN TRÊN!) */}
            {item.deletedAt ? (
              <section className="destination-card" aria-labelledby="rag-actions-title">
                <h2 id="rag-actions-title">Chế độ chỉ đọc</h2>
                <p className="destination-helper">Để khôi phục tài liệu về trạng thái vô hiệu hóa, quay lại danh sách “Đã xóa” và chọn Khôi phục.</p>
              </section>
            ) : (
              <section className="destination-card" aria-labelledby="rag-actions-title">
                <div className="destination-section-heading">
                  <span className="destination-section-icon" aria-hidden="true">
                    <ShieldCheck size={21} />
                  </span>
                  <div>
                    <h2 id="rag-actions-title">Quản lý trạng thái tài liệu</h2>
                    <p className="destination-helper">
                      {item.status === "DISABLED"
                        ? "Tài liệu đã vô hiệu hóa và không được dùng cho lượt truy xuất mới."
                        : item.status === "INDEXED"
                          ? "Tài liệu đã lập chỉ mục. Vô hiệu hóa sẽ dừng mọi lượt truy xuất."
                          : item.status === "APPROVED"
                            ? "Tài liệu đã được phê duyệt. Hãy tiếp tục bước Lập chỉ mục AI bên dưới."
                            : item.status === "REVIEWING"
                              ? "Tài liệu đang trong tiến trình kiểm duyệt. Mở hộp thoại kiểm duyệt để xem chi tiết và phê duyệt."
                              : "Tài liệu đang chờ kiểm duyệt. Bấm 'Bắt đầu kiểm duyệt' để mở thông tin đối soát và phê duyệt."}
                    </p>
                  </div>
                </div>

                <div className="rag-actions">
                  {item.allowedActions.includes("START_REVIEW") && (
                    <Button
                      className="destination-primary"
                      disabled={busy || uncertain}
                      onClick={() => handleStartReview()}
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      Bắt đầu kiểm duyệt
                    </Button>
                  )}
                  {item.allowedActions.includes("APPROVE") && (
                    <Button
                      className="destination-primary"
                      disabled={busy || uncertain}
                      onClick={() => setIsReviewModalOpen(true)}
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      Kiểm duyệt & Phê duyệt
                    </Button>
                  )}
                  {item.status === "APPROVED" && (
                    <p style={{ color: "var(--destination-green)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Tài liệu đã được phê duyệt. Hãy tiếp tục bước Lập chỉ mục AI bên dưới.
                    </p>
                  )}
                  {item.status === "INDEXED" && (
                    <p style={{ color: "var(--destination-green)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Tài liệu đã được lập chỉ mục vector AI.
                    </p>
                  )}
                  {item.allowedActions.includes("DISABLE") && (
                    <Button
                      variant="destructive"
                      disabled={busy || uncertain}
                      onClick={() => {
                        if (window.confirm("Vô hiệu hóa tài liệu này? Không thể kích hoạt lại bản ghi trong MVP.")) void act("DISABLE");
                      }}
                    >
                      Vô hiệu hóa
                    </Button>
                  )}
                  {item.allowedActions.length === 0 && item.status !== "APPROVED" && item.status !== "INDEXED" && (
                    <p>{item.status === "DISABLED" ? "Tài liệu đã vô hiệu hóa. Không có thao tác tiếp theo." : "Không có thao tác kiểm duyệt tiếp theo ở trạng thái này."}</p>
                  )}
                </div>
                {feedback && (
                  <div className="rag-action-feedback" role={pending.current ? "alert" : "status"}>
                    {feedback}
                    {pending.current && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const attempt = pending.current;
                          if (attempt) void act(attempt.action, attempt.key);
                        }}
                      >
                        Thử lại cùng yêu cầu
                      </Button>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* KHỐI 4: Lập chỉ mục AI (BƯỚC 2: LẬP CHỈ MỤC - ĐẨY XUỐNG DƯỚI QUẢN LÝ TRẠNG THÁI) */}
            {!item.deletedAt && (
              <RagIndexPanel
                key={id}
                documentId={id}
                status={item.status}
                onCompleted={() => {
                  const identity = generation.current;
                  void fetch("/api/admin/rag-documents/" + encodeURIComponent(id), { cache: "no-store" })
                    .then(async response => {
                      const body = await response.json();
                      if (response.ok && body.success === true && generation.current === identity) {
                        setData(current => (current ? { document: confirmedRagDetail(current.document, { status: "SUCCESS", data: body.data.document }) } : body.data));
                      }
                    })
                    .catch(() => {
                      if (generation.current === identity) {
                        setFeedback("Chỉ mục đã hoàn tất; chưa đọc được trạng thái tài liệu mới. Hãy tải lại chi tiết.");
                      }
                    });
                }}
              />
            )}

            {/* KHỐI 5: Quyền làm nguồn trả lời AI công khai (BƯỚC 3: CẤP QUYỀN AI CÔNG KHAI) */}
            <section className="destination-card" aria-labelledby="rag-public-qa-title">
              <div className="destination-section-heading">
                <span className="destination-section-icon" aria-hidden="true">
                  <Sparkles size={21} />
                </span>
                <div>
                  <h2 id="rag-public-qa-title">Quyền làm nguồn trả lời AI công khai</h2>
                  <p>Quyết định tài liệu có được trợ lý AI tìm kiếm và trích dẫn trong câu trả lời người dùng hay không.</p>
                </div>
              </div>

              <div className={`rag-eligibility-box ${item.publicQaEligible ? "is-eligible" : "is-ineligible"}`}>
                <strong>Trạng thái AI: </strong>
                {item.publicQaEligible ? (
                  <span>Tài liệu đã đủ điều kiện và đang được AI sử dụng tự động.</span>
                ) : item.ineligibilityReason ? (
                  <span>{ineligibilityReasonLabel[item.ineligibilityReason]}</span>
                ) : (
                  <span>Chưa đủ điều kiện sử dụng cho AI.</span>
                )}
              </div>

              <dl className="rag-detail-grid" style={{ marginTop: "14px" }}>
                <div>
                  <dt>Cấp quyền công khai</dt>
                  <dd>
                    {item.publicQaApproved ? (
                      <span style={{ color: "var(--destination-green)", fontWeight: 600 }}>Đã cấp quyền</span>
                    ) : (
                      <span style={{ color: "var(--destination-muted)" }}>Chưa cấp quyền</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Điều kiện cần</dt>
                  <dd>Đã lập chỉ mục (INDEXED) + Bản chỉ mục READY</dd>
                </div>
              </dl>

              {!item.deletedAt && (
                <div className="rag-actions">
                  {item.status !== "DISABLED" && !item.publicQaApproved && (
                    <Button
                      type="button"
                      className="destination-primary"
                      disabled={busy || uncertain}
                      onClick={() => void act("ENABLE_PUBLIC_QA")}
                    >
                      <ShieldCheck size={16} aria-hidden="true" /> Cho phép AI sử dụng công khai
                    </Button>
                  )}
                  {item.publicQaApproved && (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy || uncertain}
                      onClick={() => void act("DISABLE_PUBLIC_QA")}
                    >
                      <ShieldAlert size={16} aria-hidden="true" /> Thu hồi quyền AI công khai
                    </Button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* POPUP KIỂM DUYỆT TÀI LIỆU RAG */}
      {item && (
        <dialog
          ref={reviewDialogRef}
          className="rag-review-dialog"
          aria-labelledby="rag-review-dialog-title"
          onCancel={event => {
            event.preventDefault();
            if (!busy) setIsReviewModalOpen(false);
          }}
        >
          <div className="rag-review-dialog-header">
            <h2 id="rag-review-dialog-title">
              <ShieldCheck size={20} aria-hidden="true" />
              Kiểm duyệt tài liệu RAG
            </h2>
            <button
              type="button"
              className="rag-dialog-close"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setIsReviewModalOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="rag-review-dialog-body">
            {/* Tóm tắt tệp & trạng thái */}
            <div className="rag-review-dialog-card">
              <div className="rag-review-dialog-file-info">
                <FileText size={22} aria-hidden="true" />
                <div>
                  <strong>{item.originalFileName}</strong>
                  <p>{item.sourceTitle}</p>
                </div>
              </div>
              <div style={{ marginTop: "10px" }}>
                <RagStatusBadge item={item} />
              </div>
              <dl className="rag-review-dialog-grid">
                <div>
                  <dt>Loại tệp</dt>
                  <dd>{item.fileType}</dd>
                </div>
                <div>
                  <dt>Dung lượng</dt>
                  <dd>{(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd>
                </div>
                <div>
                  <dt>Ngày tải lên</dt>
                  <dd>{date(item.createdAt)}</dd>
                </div>
                <div>
                  <dt>Cập nhật lần cuối</dt>
                  <dd>{date(item.updatedAt)}</dd>
                </div>
              </dl>
            </div>

            {/* Thông tin nguồn đối soát */}
            <div className="rag-review-dialog-card">
              <h3 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 650, color: "var(--destination-ink)" }}>
                Thông tin nguồn đối soát
              </h3>
              <dl className="rag-review-dialog-grid" style={{ margin: 0, paddingTop: 0, borderTop: "none" }}>
                <div>
                  <dt>Nguồn tài liệu</dt>
                  <dd>{item.sourceTitle}</dd>
                </div>
                <div>
                  <dt>Tác giả</dt>
                  <dd>{item.author || "Chưa khai báo"}</dd>
                </div>
                <div>
                  <dt>Chủ đề</dt>
                  <dd>{item.topic || "Chưa khai báo"}</dd>
                </div>
                <div>
                  <dt>Địa phương</dt>
                  <dd>{item.locality || "Chưa khai báo"}</dd>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <dt>Trang web nguồn</dt>
                  <dd>
                    {item.sourceUrl ? (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <span>{item.sourceUrl}</span>
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    ) : (
                      "Chưa khai báo"
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Nút tải tệp gốc để đối soát */}
            <a
              className="rag-review-dialog-download"
              href={`/api/admin/rag-documents/${encodeURIComponent(id)}/file`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={16} aria-hidden="true" />
              <span>Tải tệp gốc để xem và đối soát nội dung</span>
            </a>

            {/* Hướng dẫn kiểm duyệt */}
            <div className="rag-review-guidance">
              <Info size={18} aria-hidden="true" />
              <div>
                <strong>Lưu ý kiểm duyệt:</strong> Hãy kiểm tra kỹ nội dung tệp gốc trước khi phê duyệt. Sau khi phê duyệt (APPROVED), tài liệu sẽ sẵn sàng cho việc lập chỉ mục vector AI.
              </div>
            </div>
          </div>

          <div className="rag-review-dialog-actions">
            <button
              type="button"
              className="destination-button"
              disabled={busy}
              onClick={() => setIsReviewModalOpen(false)}
            >
              Hủy / Để duyệt sau
            </button>

            {item.allowedActions.includes("DISABLE") && (
              <Button
                type="button"
                variant="destructive"
                disabled={busy || uncertain}
                onClick={() => {
                  if (window.confirm("Vô hiệu hóa tài liệu này? Không thể kích hoạt lại bản ghi trong MVP.")) {
                    void act("DISABLE");
                  }
                }}
              >
                Vô hiệu hóa
              </Button>
            )}

            <Button
              type="button"
              className="destination-primary"
              disabled={busy || uncertain || (!item.allowedActions.includes("APPROVE") && item.status !== "REVIEWING")}
              onClick={() => void act("APPROVE")}
            >
              {busy && pending.current?.action === "APPROVE" ? (
                <>
                  <LoaderCircle size={15} className="destination-spinner" aria-hidden="true" />
                  <span>Đang phê duyệt…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Phê duyệt tài liệu</span>
                </>
              )}
            </Button>
          </div>
        </dialog>
      )}
    </main>
  );
}
