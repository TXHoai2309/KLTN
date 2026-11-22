"use client";
import { useState, type FormEvent } from "react";

/** Paste a conversation link or id, read its tool trace, copy the JSON. */
export default function TraceClient() {
  const [input, setInput] = useState("");
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(event: FormEvent) {
    event.preventDefault();
    const id = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu)?.[0];
    if (!id) { setError("Dán link hội thoại hoặc mã hội thoại (UUID)."); return; }
    setLoading(true); setError(""); setJson(""); setCopied(false);
    try {
      const response = await fetch(`/api/admin/assistant-traces/${id}`, { cache: "no-store" });
      const body = await response.json() as { data?: unknown; error?: { message?: string } };
      if (!response.ok) setError(body.error?.message ?? "Không đọc được nhật ký.");
      else setJson(JSON.stringify(body.data, null, 2));
    } catch { setError("Không kết nối được máy chủ."); } finally { setLoading(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(json); setCopied(true); } catch { setError("Trình duyệt chặn sao chép; hãy chọn và sao chép thủ công."); }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Nhật ký công cụ của trợ lý</h1>
      <p className="mt-1 text-sm text-muted-foreground">Mỗi lượt gồm câu người dùng, câu trả lời và các công cụ AI đã gọi (đầu vào, kết quả, lỗi). Chỉ quản trị viên xem được. Lượt cũ trước khi có tính năng này không có dữ liệu công cụ.</p>
      <form onSubmit={load} className="mt-6 flex flex-wrap gap-2">
        <label htmlFor="trace-id" className="sr-only">Link hoặc mã hội thoại</label>
        <input id="trace-id" value={input} onChange={event => setInput(event.target.value)} placeholder="https://…/assistant?conversationId=…" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" />
        <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{loading ? "Đang đọc…" : "Xem nhật ký"}</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {json && (
        <section className="mt-6" aria-label="Nhật ký JSON">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{json.length.toLocaleString("vi-VN")} ký tự</span>
            <button type="button" onClick={() => void copy()} className="rounded-md border px-3 py-1.5 text-sm font-medium">{copied ? "Đã sao chép" : "Sao chép JSON"}</button>
          </div>
          <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">{json}</pre>
        </section>
      )}
    </main>
  );
}
