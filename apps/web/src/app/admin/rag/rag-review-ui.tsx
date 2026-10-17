"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileText, Plus, AlertTriangle, LoaderCircle, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";
import { confirmedRagDetail } from "@/modules/rag-document/rag-review-state";
import { RagIndexPanel } from "./rag-index-panel";

type RagStatus = "UPLOADED" | "REVIEWING" | "APPROVED" | "INDEXED" | "DISABLED";
type RagAction = "START_REVIEW" | "APPROVE" | "DISABLE" | "ENABLE_PUBLIC_QA" | "DISABLE_PUBLIC_QA";
type RagIneligibilityReason = "STATUS_NOT_INDEXED" | "NOT_PUBLIC_APPROVED" | "NO_READY_INDEX" | "EMBEDDING_MISMATCH";

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
};

const date = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function useRagRead<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
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
    publicQaApproved?: boolean;
    publicQaEligible?: boolean;
    ineligibilityReason?: RagIneligibilityReason | null;
  };
}) {
  return (
    <div className="rag-statuses">
      <span className={`rag-status is-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>
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

export function RagList() {
  const { data, error, retry } = useRagRead<{ items: RagItem[] }>("/api/admin/rag-documents");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const items = data?.items ?? [];
  const totalCount = items.length;
  const indexedCount = items.filter(i => i.status === "INDEXED").length;
  const publicApprovedCount = items.filter(i => i.publicQaApproved).length;
  const publicEligibleCount = items.filter(i => i.publicQaEligible).length;
  const unapprovedIndexed = items.filter(i => i.status === "INDEXED" && !i.publicQaApproved);

  async function handleBulkEnableIndexed() {
    if (bulkBusy || unapprovedIndexed.length === 0) return;
    setBulkBusy(true);
    setBulkMessage("");
    try {
      const response = await fetch("/api/admin/rag-documents/bulk-public-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ENABLE_ALL_INDEXED" }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        throw new Error(body.error?.message || "Không thể thực hiện duyệt hàng loạt.");
      }
      setBulkMessage(`Đã cấp quyền AI công khai cho ${body.data?.updatedCount ?? unapprovedIndexed.length} tài liệu đã lập chỉ mục.`);
      retry();
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Duyệt hàng loạt thất bại.");
    } finally {
      setBulkBusy(false);
    }
  }

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

        {data && (
          <div className="rag-stats-grid">
            <div className="rag-stat-card">
              <div className="rag-stat-label">Tổng tài liệu</div>
              <div className="rag-stat-value">{totalCount}</div>
            </div>
            <div className="rag-stat-card">
              <div className="rag-stat-label">Đã lập chỉ mục</div>
              <div className="rag-stat-value">{indexedCount}</div>
            </div>
            <div className="rag-stat-card">
              <div className="rag-stat-label">Đã cấp quyền AI</div>
              <div className="rag-stat-value">{publicApprovedCount}</div>
            </div>
            <div className="rag-stat-card">
              <div className="rag-stat-label">Sẵn sàng cho AI</div>
              <div className="rag-stat-value">{publicEligibleCount}</div>
            </div>
          </div>
        )}

        {unapprovedIndexed.length > 0 && (
          <div className="rag-bulk-bar">
            <div className="rag-bulk-info">
              Có <strong>{unapprovedIndexed.length}</strong> tài liệu đã lập chỉ mục nhưng chưa được cấp quyền làm nguồn trả lời AI công khai.
            </div>
            <Button
              type="button"
              className="destination-primary"
              disabled={bulkBusy}
              onClick={() => void handleBulkEnableIndexed()}
            >
              <Sparkles size={16} aria-hidden="true" />
              {bulkBusy ? "Đang xử lý…" : `Duyệt công khai tất cả (${unapprovedIndexed.length})`}
            </Button>
          </div>
        )}

        {bulkMessage && (
          <div className="rag-action-feedback" role="status" style={{ marginBottom: "16px" }}>
            {bulkMessage}
          </div>
        )}

        <section className="destination-card" aria-labelledby="rag-list-title">
          <div className="destination-section-heading">
            <span className="destination-section-icon" aria-hidden="true">
              <FileText size={21} />
            </span>
            <div>
              <h2 id="rag-list-title">Danh sách tài liệu</h2>
              <p>Tài liệu cần được lập chỉ mục và cấp quyền AI công khai để trợ lý có thể tự động tìm kiếm.</p>
            </div>
          </div>
          {error || !data ? (
            <RagState error={error} retry={retry} />
          ) : data.items.length === 0 ? (
            <div className="destination-state destination-empty">
              <FileText size={34} aria-hidden="true" />
              <h3>Chưa có tài liệu nào</h3>
              <p>Tải tài liệu đầu tiên để bắt đầu kiểm duyệt.</p>
              <Link className="destination-primary" href={"/admin/rag/upload" as Route}>
                Tải tài liệu mới
              </Link>
            </div>
          ) : (
            <ul className="rag-document-list">
              {data.items.map(item => (
                <li key={item.id} className="rag-document-row">
                  <div className="rag-document-main">
                    <FileText size={20} aria-hidden="true" />
                    <div>
                      <strong>{item.originalFileName}</strong>
                      <p>{item.sourceTitle}</p>
                    </div>
                  </div>
                  <div className="rag-document-meta">
                    <span>{item.fileType}</span>
                    <RagStatusBadge item={item} />
                  </div>
                  <Link
                    className="destination-edit"
                    href={`/admin/rag/${encodeURIComponent(item.id)}` as Route}
                    aria-label={`Mở chi tiết ${item.originalFileName}`}
                  >
                    Mở chi tiết
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export function RagDetailView({ id }: { id: string }) {
  const { data, setData, error, retry } = useRagRead<{ document: RagDetail }>(`/api/admin/rag-documents/${encodeURIComponent(id)}`);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const flight = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const pending = useRef<{ action: RagAction; key: string } | null>(null);

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
        setFeedback(
          action === "DISABLE"
            ? "Đã vô hiệu hóa. Tài liệu không còn đủ điều kiện cho lượt truy xuất mới."
            : action === "APPROVE"
              ? "Đã phê duyệt. Tài liệu chưa được lập chỉ mục nên chưa dùng cho truy xuất."
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
      } else {
        setUncertain(true);
        setFeedback("Chưa xác định được kết quả. Thử lại với cùng yêu cầu hoặc tải lại chi tiết để kiểm tra.");
      }
    } finally {
      flight.current = false;
      if (generation.current === requestGeneration) setBusy(false);
    }
  }

  const item = data?.document;
  return (
    <main className="destination-page rag-review-page">
      <div className="destination-container destination-form-container">
        <Link className="destination-back destination-button" href={"/admin/rag" as Route}>
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
            </section>

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

            <section className="destination-card" aria-labelledby="rag-actions-title">
              <h2 id="rag-actions-title">Quản lý trạng thái tài liệu</h2>
              <p className="destination-helper">
                {item.status === "DISABLED"
                  ? "Tài liệu đã vô hiệu hóa và không được dùng cho lượt truy xuất mới."
                  : item.status === "INDEXED"
                    ? "Tài liệu đã lập chỉ mục. Vô hiệu hóa sẽ dừng mọi lượt truy xuất."
                    : "Hãy kiểm tra nội dung tệp gốc trước khi phê duyệt. APPROVED chưa đủ điều kiện truy xuất cho đến khi lập chỉ mục thành công."}
              </p>
              <div className="rag-actions">
                {item.allowedActions.includes("START_REVIEW") && (
                  <Button className="destination-primary" disabled={busy || uncertain} onClick={() => void act("START_REVIEW")}>
                    Bắt đầu kiểm duyệt
                  </Button>
                )}
                {item.allowedActions.includes("APPROVE") && (
                  <Button className="destination-primary" disabled={busy || uncertain} onClick={() => void act("APPROVE")}>
                    Phê duyệt
                  </Button>
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
                {item.allowedActions.length === 0 && (
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
          </>
        )}
      </div>
    </main>
  );
}
