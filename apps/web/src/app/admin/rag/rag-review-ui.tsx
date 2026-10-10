"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileText, Plus, AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";
import { confirmedRagDetail } from "@/modules/rag-document/rag-review-state";
import { RagIndexPanel } from "./rag-index-panel";
import "./rag-index-panel.css";

type RagStatus = "UPLOADED" | "REVIEWING" | "APPROVED" | "INDEXED" | "DISABLED";
type RagAction = "START_REVIEW" | "APPROVE";
type RagItem = {
  id: string; originalFileName: string; sourceTitle: string; fileType: "PDF" | "DOCX" | "TXT";
  status: RagStatus; retrievalEligible: boolean; createdAt: string; updatedAt: string;
};
type RagDetail = RagItem & {
  mimeType: string; sizeBytes: number; sourceUrl: string | null; author: string | null;
  topic: string | null; locality: string | null; uploadedById: string; allowedActions: RagAction[];
};
type RagTransition = Pick<RagDetail, "id" | "status" | "updatedAt" | "retrievalEligible" | "allowedActions">;

const statusLabel: Record<RagStatus, string> = {
  UPLOADED: "Chờ kiểm duyệt", REVIEWING: "Đang kiểm duyệt", APPROVED: "Đã phê duyệt",
  INDEXED: "Đã lập chỉ mục", DISABLED: "Đã vô hiệu hóa",
};
const date = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function useRagRead<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    void fetch(url, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error?.message || "Không thể tải tài liệu.");
      if (!controller.signal.aborted) setData(body.data as T);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không thể tải tài liệu.");
    });
    return () => controller.abort();
  }, [url, reload]);
  return { data, setData, error, retry: () => setReload(value => value + 1) };
}

function RagState({ error, retry, detail = false }: { error: string; retry: () => void; detail?: boolean }) {
  return <div className="destination-state" role={error ? "alert" : "status"}>
    {error ? <AlertTriangle size={27} aria-hidden="true" /> : <LoaderCircle size={27} className="destination-spinner" aria-hidden="true" />}
    <h2>{error ? "Chưa tải được tài liệu" : "Đang tải tài liệu…"}</h2>
    {error && <><p>{error}</p><Button type="button" onClick={retry}>Thử lại</Button></>}
    {!error && <p>{detail ? "Đang tải chi tiết tài liệu." : "Đang tải danh sách tài liệu."}</p>}
  </div>;
}

function Status({ item }: { item: Pick<RagItem, "status" | "retrievalEligible"> }) {
  return <div className="rag-statuses"><span className={`rag-status is-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span><span className="rag-retrieval">{item.retrievalEligible ? "Đủ điều kiện truy xuất" : "Chưa dùng cho truy xuất"}</span></div>;
}

export function RagList() {
  const { data, error, retry } = useRagRead<{ items: RagItem[] }>("/api/admin/rag-documents");
  return <main className="destination-page rag-review-page"><div className="destination-container">
    <header className="destination-heading"><div><h1>Tài liệu RAG</h1><p>Theo dõi nguồn tài liệu và tiến trình kiểm duyệt.</p></div><Link className="destination-primary" href={"/admin/rag/upload" as Route}><Plus size={17} aria-hidden="true" />Tải tài liệu mới</Link></header>
    <section className="destination-card" aria-labelledby="rag-list-title"><div className="destination-section-heading"><span className="destination-section-icon" aria-hidden="true"><FileText size={21} /></span><div><h2 id="rag-list-title">Danh sách tài liệu</h2><p>Chỉ tài liệu đã lập chỉ mục mới đủ điều kiện truy xuất.</p></div></div>
      {error || !data ? <RagState error={error} retry={retry} /> : data.items.length === 0 ? <div className="destination-state destination-empty"><FileText size={34} aria-hidden="true" /><h3>Chưa có tài liệu nào</h3><p>Tải tài liệu đầu tiên để bắt đầu kiểm duyệt.</p><Link className="destination-primary" href={"/admin/rag/upload" as Route}>Tải tài liệu mới</Link></div> : <ul className="rag-document-list">{data.items.map(item => <li key={item.id} className="rag-document-row"><div className="rag-document-main"><FileText size={20} aria-hidden="true" /><div><strong>{item.originalFileName}</strong><p>{item.sourceTitle}</p></div></div><div className="rag-document-meta"><span>{item.fileType}</span><Status item={item} /></div><Link className="destination-edit" href={`/admin/rag/${encodeURIComponent(item.id)}` as Route} aria-label={`Mở chi tiết ${item.originalFileName}`}>Mở chi tiết</Link></li>)}</ul>}
    </section>
  </div></main>;
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
    if (flight.current || pending.current && pending.current.key !== key) return;
    flight.current = true;
    const requestGeneration = generation.current;
    setBusy(true); setFeedback(""); pending.current = { action, key };
    try {
      const outcome = await sendIdempotentMutation<RagTransition>(`/api/admin/rag-documents/${encodeURIComponent(id)}/actions`, {
        idempotencyKey: key,
        init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
      });
      if (generation.current !== requestGeneration) return;
      if (outcome.status === "SUCCESS") {
        setData(current => current ? { document: confirmedRagDetail(current.document, outcome) } : current);
        pending.current = null; setUncertain(false);
        setFeedback(action === "APPROVE" ? "Đã phê duyệt. Tài liệu chưa được lập chỉ mục nên chưa dùng cho truy xuất." : "Đã bắt đầu kiểm duyệt.");
      } else if (outcome.status === "FAILED") {
        pending.current = null; setUncertain(false);
        setFeedback(outcome.error.message);
      } else {
        setUncertain(true);
        setFeedback("Chưa xác định được kết quả. Thử lại với cùng yêu cầu hoặc tải lại chi tiết để kiểm tra.");
      }
    } finally { flight.current = false; if (generation.current === requestGeneration) setBusy(false); }
  }

  const item = data?.document;
  return <main className="destination-page rag-review-page"><div className="destination-container destination-form-container">
    <Link className="destination-back destination-button" href={"/admin/rag" as Route}><ArrowLeft size={17} aria-hidden="true" />Danh sách tài liệu</Link>
    <header className="destination-heading"><div><h1>Chi tiết tài liệu RAG</h1><p>Kiểm tra tệp gốc và thông tin nguồn trước khi phê duyệt.</p></div></header>
    {error || !item ? <section className="destination-card"><RagState error={error} retry={retry} detail /></section> : <>
      <section className="destination-card" aria-labelledby="rag-file-title"><div className="destination-section-heading"><span className="destination-section-icon" aria-hidden="true"><FileText size={21} /></span><div><h2 id="rag-file-title">{item.originalFileName}</h2><p>{item.sourceTitle}</p></div></div>
        <Status item={item} /><dl className="rag-detail-grid"><div><dt>Loại tệp</dt><dd>{item.fileType}</dd></div><div><dt>Dung lượng</dt><dd>{(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd></div><div><dt>Tải lên</dt><dd>{date(item.createdAt)}</dd></div><div><dt>Cập nhật</dt><dd>{date(item.updatedAt)}</dd></div></dl>
        <a className="destination-button rag-file-link" href={`/api/admin/rag-documents/${encodeURIComponent(id)}/file`}>Tải tài liệu gốc để xem</a>
      </section>
      <section className="destination-card" aria-labelledby="rag-source-title"><h2 id="rag-source-title">Thông tin nguồn</h2><dl className="rag-detail-grid"><div><dt>Nguồn</dt><dd>{item.sourceTitle}</dd></div><div><dt>URL nguồn</dt><dd>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Mở trang nguồn</a> : "Chưa khai báo"}</dd></div><div><dt>Tác giả</dt><dd>{item.author || "Chưa khai báo"}</dd></div><div><dt>Chủ đề</dt><dd>{item.topic || "Chưa khai báo"}</dd></div><div><dt>Địa phương</dt><dd>{item.locality || "Chưa khai báo"}</dd></div></dl></section>
      <RagIndexPanel documentId={id} status={item.status} />
      <section className="destination-card" aria-labelledby="rag-actions-title"><h2 id="rag-actions-title">Kiểm duyệt</h2><p className="destination-helper">Hãy tải và kiểm tra nội dung tệp gốc trước khi phê duyệt. APPROVED chưa đủ điều kiện truy xuất cho đến khi lập chỉ mục thành công.</p>
        <div className="rag-actions">{item.allowedActions.includes("START_REVIEW") && <Button className="destination-primary" disabled={busy || uncertain} onClick={() => void act("START_REVIEW")}>Bắt đầu kiểm duyệt</Button>}{item.allowedActions.includes("APPROVE") && <Button className="destination-primary" disabled={busy || uncertain} onClick={() => void act("APPROVE")}>Phê duyệt</Button>}{item.allowedActions.length === 0 && <p>Không có thao tác kiểm duyệt tiếp theo ở trạng thái này.</p>}</div>
        {feedback && <div className="rag-action-feedback" role={pending.current ? "alert" : "status"}>{feedback}{pending.current && <Button type="button" disabled={busy} onClick={() => { const attempt = pending.current; if (attempt) void act(attempt.action, attempt.key); }}>Thử lại cùng yêu cầu</Button>}</div>}
      </section>
    </>}
  </div></main>;
}
