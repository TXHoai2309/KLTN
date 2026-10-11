"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, UploadCloud, ShieldCheck, AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription } from "@KLTN/ui/components/attachment";
import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";

type Metadata = { sourceTitle: string; sourceUrl: string; author: string; topic: string; locality: string };
type FinalizeBody = Metadata & { pathname: string; originalFileName: string; mimeType: string; sizeBytes: number };
type UploadStatus = "idle" | "invalid" | "uploading" | "success" | "failed" | "unknown";
type Result = { id: string; originalFileName: string; sourceTitle: string; status: "UPLOADED"; retrievalEligible: false };
const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain",
};
const maxBytes = 20 * 1024 * 1024;

function validateSelection(file: File | null): string | null {
  if (!file) return "Hãy chọn một tài liệu.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!mimeByExtension[extension]) return "Chỉ hỗ trợ PDF, DOCX hoặc TXT.";
  if (file.size < 1 || file.size > maxBytes) return "Tệp phải có dung lượng từ 1 byte đến 20 MB.";
  return null;
}

export default function RagUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({ sourceTitle: "", sourceUrl: "", author: "", topic: "", locality: "" });
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef<{ body: FinalizeBody; key: string } | null>(null);

  const flight = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  const busy = status === "uploading";
  const locked = busy || status === "unknown";
  const update = (field: keyof Metadata, value: string) => {
    setMetadata(current => ({ ...current, [field]: value }));
    if (status === "invalid" || status === "failed") { setStatus("idle"); setMessage(""); }
  };

  async function finalize(body: FinalizeBody, key: string, requestGeneration: number) {
    const outcome = await sendIdempotentMutation<Result>("/api/admin/rag-documents", {
      idempotencyKey: key,
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    });
    if (generation.current !== requestGeneration) return;
    if (outcome.status === "SUCCESS") {
      pending.current = null; setResult(outcome.data); setStatus("success");
      setMessage("Tài liệu đã được tải lên. Trạng thái UPLOADED, chưa tham gia RAG.");
    } else if (outcome.status === "FAILED") {
      pending.current = null; setStatus("failed"); setMessage(outcome.error.message);
    } else {
      setStatus("unknown"); setMessage("Chưa xác định được kết quả ghi. Thử lại sẽ dùng cùng yêu cầu, không tải tệp mới.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current) return;
    flight.current = true;
    const requestGeneration = generation.current;
    try {
      if (status === "unknown" && pending.current) {
        setStatus("uploading"); await finalize(pending.current.body, pending.current.key, requestGeneration); return;
      }
      const validation = validateSelection(file);
      if (validation || !metadata.sourceTitle.trim()) {
        setStatus("invalid"); setMessage(validation || "Hãy nhập tên nguồn tài liệu."); return;
      }
      if (metadata.sourceUrl.trim()) {
        try { const url = new URL(metadata.sourceUrl.trim()); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
        catch { setStatus("invalid"); setMessage("URL nguồn phải bắt đầu bằng http:// hoặc https://."); return; }
      }
      const selected = file!;
      const mimeType = mimeByExtension[selected.name.split(".").pop()!.toLowerCase()];
      setStatus("uploading"); setMessage("Đang tải tệp lên kho riêng tư…"); setResult(null);
      try {
        const ticketResponse = await fetch("/api/admin/rag-documents/upload-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: selected.name, mimeType, sizeBytes: selected.size }),
        });
        const ticket = await ticketResponse.json();
        if (generation.current !== requestGeneration) return;
        if (!ticketResponse.ok || ticket.success !== true) throw new Error(ticket.error?.message || "Không thể chuẩn bị tải tệp.");
        const body: FinalizeBody = {
          pathname: ticket.data.pathname, originalFileName: selected.name, mimeType, sizeBytes: selected.size,
          sourceTitle: metadata.sourceTitle.trim(), sourceUrl: metadata.sourceUrl.trim(),
          author: metadata.author.trim(), topic: metadata.topic.trim(), locality: metadata.locality.trim(),
        };
        const key = createIdempotencyKey();
        pending.current = { body, key };
        let put: Response;
        try { put = await fetch(ticket.data.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: selected }); }
        catch {
          if (generation.current !== requestGeneration) return;
          setStatus("unknown");
          setMessage("Chưa xác định tệp đã tới kho riêng tư hay chưa. Thử xác nhận lại với cùng yêu cầu.");
          return;
        }
        if (generation.current !== requestGeneration) return;
        if (!put.ok) { pending.current = null; throw new Error("Không thể tải tệp lên kho riêng tư. Hãy thử lại."); }
        setMessage("Đang kiểm tra tệp và xác nhận bản ghi…");
        await finalize(body, key, requestGeneration);
      } catch (error) {
        if (generation.current !== requestGeneration) return;
        setStatus("failed"); setMessage(error instanceof Error ? error.message : "Không thể tải tệp. Hãy thử lại.");
      }
    } finally { flight.current = false; }
  }

  const fields: { key: keyof Metadata; label: string; placeholder: string; maxLength: number }[] = [
    { key: "sourceTitle", label: "Tên nguồn tài liệu", placeholder: "Ví dụ: Tài liệu hướng dẫn du lịch", maxLength: 300 },
    { key: "sourceUrl", label: "URL nguồn", placeholder: "https://...", maxLength: 2000 },
    { key: "author", label: "Tác giả / đơn vị", placeholder: "Tên tác giả hoặc đơn vị phát hành", maxLength: 200 },
    { key: "topic", label: "Chủ đề", placeholder: "Chủ đề của tài liệu", maxLength: 200 },
    { key: "locality", label: "Địa phương", placeholder: "Khu vực liên quan", maxLength: 200 },
  ];

  return <main className="destination-page rag-upload-page"><div className="destination-container destination-form-container">
    <Link href={"/admin/rag" as import("next").Route} className="destination-button destination-back"><ArrowLeft size={16} aria-hidden="true" /> Danh sách tài liệu</Link>
    <header className="destination-heading"><div><h1>Tải tài liệu RAG</h1><p>Bổ sung tài liệu tham chiếu vào quy trình quản lý tri thức.</p></div></header>
    <form onSubmit={submit} noValidate>
      <section className="destination-card" aria-labelledby="rag-file-heading">
        <div className="destination-section-heading"><span className="destination-section-icon"><UploadCloud size={20} aria-hidden="true" /></span><div><h2 id="rag-file-heading">Tài liệu</h2><p>PDF, DOCX hoặc TXT · Tối đa 20 MB mỗi tệp</p></div></div>
        <label htmlFor="rag-file">Chọn tệp <span aria-hidden="true">*</span></label>
        <Input id="rag-file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={locked} required onChange={event => { setFile(event.target.files?.[0] ?? null); setStatus("idle"); setMessage(""); setResult(null); }} />
        {file ? <Attachment state={status === "uploading" ? "uploading" : status === "failed" || status === "invalid" ? "error" : status === "success" ? "done" : "idle"} className="rag-file-summary"><AttachmentMedia><FileText aria-hidden="true" /></AttachmentMedia><AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle><AttachmentDescription>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.name.split(".").pop()?.toUpperCase()}</AttachmentDescription></AttachmentContent></Attachment> : <p className="destination-helper">Chưa chọn tài liệu.</p>}
      </section>
      <section className="destination-card" aria-labelledby="rag-source-heading">
        <div className="destination-section-heading"><span className="destination-section-icon"><ShieldCheck size={20} aria-hidden="true" /></span><div><h2 id="rag-source-heading">Thông tin nguồn</h2><p>Giúp Quản trị viên nhận biết và kiểm duyệt tài liệu sau này.</p></div></div>
        <div className="destination-grid">{fields.map(({ key, label, placeholder, maxLength }) => <div className="destination-field" key={key}><label htmlFor={`rag-${key}`}>{label}{key === "sourceTitle" && <span aria-hidden="true"> *</span>}</label><Input id={`rag-${key}`} type={key === "sourceUrl" ? "url" : "text"} value={metadata[key]} onChange={event => update(key, event.target.value)} placeholder={placeholder} maxLength={maxLength} required={key === "sourceTitle"} disabled={locked} /></div>)}</div>
      </section>
      {message && <div className={`rag-upload-message is-${status}`} role={status === "invalid" || status === "failed" ? "alert" : "status"} aria-live="polite">{status === "uploading" ? <LoaderCircle className="destination-spinner" size={18} aria-hidden="true" /> : status === "success" ? <ShieldCheck size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}<span>{message}</span></div>}
      {result && <p className="rag-upload-result"><Link href={`/admin/rag/${result.id}` as import("next").Route}>Mở chi tiết và kiểm duyệt tài liệu</Link></p>}
      <div className="destination-form-actions"><p>Tài liệu mới bắt đầu ở UPLOADED và chưa được dùng cho câu trả lời RAG.</p><div className="destination-action-buttons"><Button type="submit" className="destination-primary" size="lg" disabled={busy} aria-busy={busy}>{busy ? "Đang tải…" : status === "unknown" ? "Thử xác nhận lại" : "Tải tài liệu"}</Button></div></div>
    </form>
  </div></main>;
}
