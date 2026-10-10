"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@KLTN/ui/components/button";
import { createIdempotencyKey } from "@/lib/mutation-client";

type Job = {
  id: string; status: string; phase: string; attemptCount: number;
  failureCode: string | null; chunks: number; embeddings: number;
  totalChunks: number | null; updatedAt: string;
};
const phaseLabels: Record<string, string> = {
  QUEUED: "Chờ bắt đầu", ACQUIRING: "Đọc tài liệu gốc", EXTRACTING: "Trích xuất văn bản",
  CHUNKING: "Chia nội dung thành đoạn", PERSISTING_CHUNKS: "Lưu các đoạn",
  EMBEDDING: "Tạo embedding với OpenAI", PERSISTING_EMBEDDINGS: "Lưu embedding",
  VERIFYING: "Kiểm tra tính đầy đủ", PUBLISHING: "Công bố chỉ mục",
  COMPLETED: "Hoàn tất",
};
const terminal = new Set(["COMPLETED", "FAILED", "REJECTED", "CANCELLED", "TIMED_OUT", "UNKNOWN"]);

export function RagIndexPanel({ documentId, status }: { documentId: string; status: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const inflight = useRef(false);
  const mutationKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const endpoint = `/api/admin/rag-documents/${encodeURIComponent(documentId)}/index`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(endpoint, { cache: "no-store", signal });
      const body = await res.json();
      if (!res.ok || body.success !== true) throw new Error(body.error?.message ?? "Không thể lấy tiến độ.");
      if (!signal?.aborted && mounted.current) {
        setJob(body.data.job as Job | null);
        setError("");
      }
    } catch (reason) {
      if (!signal?.aborted && mounted.current)
        setError(reason instanceof Error ? reason.message : "Không thể cập nhật tiến độ.");
    } finally {
      if (mounted.current && !signal?.aborted) setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = setInterval(() => void refresh(controller.signal), 2000);
    return () => { mounted.current = false; controller.abort(); clearInterval(interval); };
  }, [refresh]);

  async function start() {
    if (inflight.current) return;
    inflight.current = true;
    setRunning(true);
    setError("");
    const key = mutationKey.current ?? createIdempotencyKey();
    mutationKey.current = key;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: "{}",
      });
      const body = await response.json();
      if (body.operationStatus === "UNKNOWN" || !response.ok && body.operationStatus !== "FAILED") {
        setError("Chưa xác định được kết quả API. Kiểm tra trạng thái bên dưới trước khi thử lại.");
      } else if (!response.ok) {
        mutationKey.current = null;
        setError(body.error?.message ?? "Không thể lập chỉ mục.");
      } else {
        mutationKey.current = null;
      }
    } catch {
      setError("Mất kết nối khi xử lý. Không tự gửi lại yêu cầu: hãy xem trạng thái job.");
    } finally {
      inflight.current = false;
      if (mounted.current) { setRunning(false); await refresh(); }
    }
  }

  const active = job && !terminal.has(job.status);
  const eligible = status === "APPROVED" || status === "INDEXED";
  const canStart = eligible && !loading && !running && !active && job?.status !== "UNKNOWN";
  const progress = job?.totalChunks && job.totalChunks > 0
    ? Math.min(100, Math.floor((job.embeddings / job.totalChunks) * 100)) : null;
  return <section className="destination-card rag-index-card" aria-labelledby="rag-index-title">
    <h2 id="rag-index-title">Lập chỉ mục AI</h2>
    <p className="destination-helper">Trích xuất nội dung, chia đoạn và lưu embeddings phục vụ RAG. Tiến độ lấy từ database.</p>
    <div className="rag-index-toolbar">
      <Button type="button" disabled={!canStart} onClick={() => void start()}>
        {running ? "Đang xử lý…" : status === "INDEXED" ? "Lập chỉ mục lại" : "Lập chỉ mục"}
      </Button>
      {loading ? <span role="status">Đang tải trạng thái…</span> : job
        ? <span role="status">{phaseLabels[job.phase] ?? job.phase} — {job.status}</span>
        : <span>Chưa có lần lập chỉ mục nào.</span>}
    </div>
    {job && <div className="rag-index-progress" role="status" aria-live="polite">
      <p>Đã lưu {job.embeddings}/{job.totalChunks ?? "?"} embeddings; {job.chunks} chunks.</p>
      {progress !== null ? <>
        <progress value={job.embeddings} max={job.totalChunks ?? 1} aria-label="Tiến độ embeddings" />
        <span>{progress}% embeddings đã lưu</span>
      </> : <p>Đang chuẩn bị dữ liệu; chưa thể tính phần trăm.</p>}
      {job.failureCode && <p role="alert">Mã lỗi: {job.failureCode}</p>}
      {job.status === "UNKNOWN" && <p role="alert">Kết quả chưa xác định. Không tự gửi lại API để tránh tính phí trùng.</p>}
      {job.status === "COMPLETED" && <p>Đã lập chỉ mục thành công. Tải lại trang để xem trạng thái tài liệu mới.</p>}
    </div>}
    {error && <p className="rag-index-error" role="alert">{error}</p>}
  </section>;
}
