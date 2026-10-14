"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { AdminCollapsibleSection } from "@/components/admin/admin-form-shell";
import PublishedMediaImage from "@/components/published-media-image";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { createClientImageIntent, parseImageResult, uploadClientImage } from "@/lib/destination-image-client";
import { destinationDtoSchema, type DestinationDto } from "@/modules/destination/destination-contract";
import { MAX_IMAGE_BYTES, IMAGE_TYPES } from "@/modules/destination/destination-media-contract";
import type { DestinationV3Input } from "@/modules/destination/destination-v3-contract";
import "./destination-images.css";

type Media = NonNullable<DestinationDto["profile"]>["media"][number];
type QueueItem = { file: File; key: string; preview: string; status: "QUEUED" | "UPLOADING" | "ERROR" | "UNKNOWN" | "SUCCESS"; progress: number; error: string };
// Route handoff keeps File objects in memory only; no browser persistence or credentials.
const handoffs = new Map<string, QueueItem[]>();
export type DestinationImagesHandle = { uploadAll(id: string): Promise<boolean>; handoff(id: string): void };
type Props = {
  dto?: DestinationDto; id: string | null; disabled: boolean;
  onConfirmed(dto: DestinationDto): void; onPatch(patch: Partial<DestinationV3Input>): void;
  onState(state: { busy: boolean; pending: boolean; uncertainReview: boolean }): void;
  errors: Record<string, string>;
};
const DestinationImages = forwardRef<DestinationImagesHandle, Props>(function DestinationImages({ dto, id, disabled, onConfirmed, onPatch, onState, errors }, ref) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState("");
  const [configRetry, setConfigRetry] = useState(0);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef(queue);
  const [media, setMedia] = useState<Media[]>(dto?.profile?.media ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const onConfirmedRef = useRef(onConfirmed); onConfirmedRef.current = onConfirmed;
  const [review, setReview] = useState<Record<string, string>>({});
  const reviewAttempt = useRef<{ key: string; input: unknown } | null>(null);
  const [reviewUnknown, setReviewUnknown] = useState(false);
  const saved = dto?.profile?.media ?? [];
  const changed = JSON.stringify(media) !== JSON.stringify(saved);
  const input = useRef<HTMLInputElement>(null);
  function updateQueue(next: QueueItem[]) { queueRef.current = next; if (mounted.current) setQueue(next); }
  function updateItem(key: string, change: Partial<QueueItem>) { updateQueue(queueRef.current.map(item => item.key === key ? { ...item, ...change } : item)); }
  useEffect(() => {
    mounted.current = true;
    if (id && handoffs.has(id)) { updateQueue(handoffs.get(id)!); handoffs.delete(id); }
    return () => { mounted.current = false; abort.current?.abort(); queueRef.current.forEach(item => URL.revokeObjectURL(item.preview)); };
  }, [id]);
  useEffect(() => { setMedia(dto?.profile?.media ?? []); onPatch({}); }, [dto]); // Only confirmed DB snapshots become the media baseline.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setConfigError("Kiểm tra cấu hình quá lâu. Thử lại."); }, 20_000);
    setConfigured(null); setConfigError("");
    void fetch("/api/admin/destination-images/configuration", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || body.success !== true || typeof body.data?.configured !== "boolean") throw Error(); return body.data.configured as boolean; })
      .then(value => { if (!controller.signal.aborted) setConfigured(value); })
      .catch(() => { if (!controller.signal.aborted) setConfigError("Không thể kiểm tra cấu hình ảnh. Kiểm tra phiên Admin và thử lại."); })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [configRetry]);
  useEffect(() => { onState({ busy, pending: queue.some(item => item.status !== "SUCCESS") || reviewUnknown, uncertainReview: reviewUnknown }); }, [busy, queue, reviewUnknown, onState]);
  function changeMedia(next: Media[]) {
    setMedia(next);
    const patches = next.flatMap(item => {
      const old = saved.find(m => m.id === item.id);
      if (!old) return [];
      const fields = Object.fromEntries((["url", "alt", "caption", "author", "sourceUrl"] as const).filter(k => item[k] !== old[k]).map(k => [k, item[k]]));
      return Object.keys(fields).length ? [{ id: item.id!, ...fields }] : [];
    });
    const removed = saved.filter(old => !next.some(item => item.id === old.id)).map(item => item.id!);
    const order = next.map(item => item.id!);
    const orderChanged = next.some((item, index) => item.id !== saved[index]?.id) || next.length !== saved.length;
    const cover = next.find(item => item.isCover)?.id ?? null;
    const coverChanged = cover !== (saved.find(item => item.isCover)?.id ?? null);
    onPatch({ ...(patches.length ? { media: patches } : {}), ...(removed.length ? { removedMediaIds: removed } : {}), ...(orderChanged ? { mediaOrder: order } : {}), ...(coverChanged ? { coverMediaId: cover } : {}) });
  }
  function selectFiles(files: FileList | File[]) {
    if (disabled || busyRef.current || configured !== true || reviewUnknown) return;
    setError("");
    const next = [...queueRef.current];
    for (const file of Array.from(files)) {
      if (saved.length + next.filter(item => item.status !== "SUCCESS").length >= 20) { setError("Tối đa 20 ảnh. Gỡ ảnh hoặc file trong hàng đợi trước khi thêm."); break; }
      if (!IMAGE_TYPES.includes(file.type as typeof IMAGE_TYPES[number]) || !file.size || file.size > MAX_IMAGE_BYTES) { setError(`File “${file.name}” không hợp lệ. Chọn JPEG, PNG, WebP hoặc AVIF tối đa 10 MB.`); continue; }
      next.push({ file, key: createIdempotencyKey(), preview: URL.createObjectURL(file), status: "QUEUED", progress: 0, error: "" });
    }
    updateQueue(next);
  }
  async function uploadAll(destinationId: string) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true);
    abort.current = new AbortController();
    try {
      for (const item of queueRef.current) {
        if (item.status === "SUCCESS" || abort.current.signal.aborted) continue;
        updateItem(item.key, { status: "UPLOADING", progress: 0, error: "" });
        const intent = await createClientImageIntent(destinationId, item.file, item.key, abort.current.signal);
        if (intent.status !== "SUCCESS") { updateItem(item.key, { status: intent.status === "UNKNOWN" ? "UNKNOWN" : "ERROR", error: intent.message }); continue; }
        const result = await uploadClientImage(destinationId, item.file, item.key, value => updateItem(item.key, { progress: value }), abort.current.signal);
        if (result.status === "SUCCESS") { updateItem(item.key, { status: "SUCCESS", progress: 100 }); if (mounted.current) onConfirmedRef.current(result.data); }
        else updateItem(item.key, { status: result.status === "UNKNOWN" ? "UNKNOWN" : "ERROR", error: result.message });
      }
      return queueRef.current.every(item => item.status === "SUCCESS");
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  useImperativeHandle(ref, () => ({ uploadAll, handoff(destinationId) {
    const pending = queueRef.current.filter(item => item.status !== "SUCCESS").map(item => ({ ...item, preview: URL.createObjectURL(item.file) }));
    if (pending.length) handoffs.set(destinationId, pending);
  } }));
  async function reviewImage(item: Media, decision: "APPROVED" | "REJECTED" | "UNKNOWN") {
    if (!id || !dto || busyRef.current || disabled || changed) return;
    const evidence = review[item.id!] ?? item.rightsEvidence ?? "";
    if (!reviewUnknown && !evidence.trim()) { setError("Nhập bằng chứng/quyết định quyền sử dụng trước khi duyệt."); return; }
    const attempt = reviewUnknown && reviewAttempt.current ? reviewAttempt.current : { key: createIdempotencyKey(), input: { id: item.id, expectedUpdatedAt: dto.updatedAt, decision, evidence } };
    reviewAttempt.current = attempt;
    busyRef.current = true; setBusy(true); setError("");
    abort.current = new AbortController();
    try {
      const response = await fetch(`/api/admin/destinations/${encodeURIComponent(id)}/images/review`, { method: "POST", signal: AbortSignal.any([abort.current.signal, AbortSignal.timeout(30_000)]),
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key }, body: JSON.stringify(attempt.input) });
      const result = parseImageResult(await response.json(), data => destinationDtoSchema.parse(data));
      if (result.status === "SUCCESS") { onConfirmedRef.current(result.data); setReviewUnknown(false); reviewAttempt.current = null; }
      else { setError(result.message); setReviewUnknown(result.status === "UNKNOWN"); if (result.status === "FAILED") reviewAttempt.current = null; }
    } catch { setReviewUnknown(true); setError("Chưa xác định kết quả duyệt. Dùng Đọc lại và thử lại; giữ nguyên key và quyết định."); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const blocked = disabled || busy || reviewUnknown;
  return <AdminCollapsibleSection id="dv3-images" icon={ImagePlus} title="Hình ảnh" badge="optional" description="Ảnh đại diện và thư viện ảnh. Ảnh chỉ hiển thị công khai sau khi được duyệt quyền sử dụng.">
    <p className="af-helper" aria-live="polite">{media.length} / 20 ảnh đã lưu · {queue.filter(item => item.status !== "SUCCESS").length} ảnh chờ tải</p>
    {configured === null && !configError && <p role="status" className="af-helper">Đang kiểm tra khả năng tải ảnh…</p>}
    {configured === false && <p role="status" className="af-helper">Chưa cấu hình tải ảnh. Bạn vẫn có thể lưu thông tin và quản lý ảnh đã có.</p>}
    {configError && <div role="alert"><p>{configError}</p><button type="button" className="af-btn" onClick={() => setConfigRetry(n => n + 1)}>Kiểm tra lại</button></div>}
    <div className="dimg-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFiles(e.dataTransfer.files); }}>
      <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(",")} hidden disabled={blocked || configured !== true} onChange={e => { if (e.target.files) selectFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" className="af-btn" disabled={blocked || configured !== true || media.length >= 20} onClick={() => input.current?.click()}><ImagePlus size={18} aria-hidden="true" />Tải ảnh lên</button>
      <p className="af-helper">Kéo thả hoặc chọn nhiều ảnh · JPEG, PNG, WebP, AVIF · tối đa 10 MB/ảnh.</p>
      {!id && <p className="af-helper">Ảnh được giữ trên máy cho đến khi tạo điểm đến ẩn thành công.</p>}
    </div>
    {error && <p role="alert" className="af-field-error">{error}</p>}
    {queue.length > 0 && <div className="dimg-queue">
      {queue.map(item => <div className="dimg-queue-row" key={item.key}>
        <img src={item.preview} alt={`Xem trước ${item.file.name}`} width={80} height={64} />
        <div><strong>{item.file.name}</strong><p role="status">{item.status === "SUCCESS" ? "Đã lưu · Chưa xác minh quyền" : item.status === "UPLOADING" ? item.progress < 100 ? `Đang gửi file: ${item.progress}%` : "Đang xác minh và lưu ảnh…" : item.status === "QUEUED" ? "Chờ tải" : item.error}</p>
          {item.status === "UPLOADING" && <progress max={100} value={item.progress} aria-label={`Tiến độ gửi ${item.file.name}`} />}</div>
        {item.status !== "SUCCESS" && <button className="af-btn" type="button" disabled={blocked || item.status === "UNKNOWN"} onClick={() => { URL.revokeObjectURL(item.preview); updateQueue(queueRef.current.filter(q => q.key !== item.key)); }}>Bỏ file</button>}
      </div>)}
      {id && <button className="af-btn" type="button" disabled={disabled || busy || changed || reviewUnknown || queue.every(item => item.status === "SUCCESS")} onClick={() => void uploadAll(id)}>Tải ảnh chờ / thử lại</button>}
      {busy && !disabled && <button type="button" className="af-btn" onClick={() => abort.current?.abort()}>Dừng chờ · đối chiếu khi thử lại</button>}
      {changed && <p className="af-helper">Lưu chỉnh sửa ảnh trước khi tải thêm hoặc duyệt quyền.</p>}
    </div>}
    <div className="dimg-gallery">{media.map((item, index) => <article className="dimg-card" key={item.id}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh lớn: ${item.alt}`}><PublishedMediaImage url={item.url} alt={item.alt} /><span>Xem ảnh lớn</span></a>
      <div className="dimg-card-body"><p>{item.isCover ? "Ảnh đại diện · " : ""}{item.websiteRights === "APPROVED" ? "Đã duyệt" : item.websiteRights === "REJECTED" ? "Đã từ chối" : "Chưa xác minh"}</p>
        <label htmlFor={`media-alt-${item.id}`}>Mô tả ảnh (alt)</label><input className="af-input" id={`media-alt-${item.id}`} value={item.alt} maxLength={300} disabled={blocked} aria-invalid={Boolean(errors[`media.${item.id}.alt`])} aria-describedby={errors[`media.${item.id}.alt`] ? `media-error-${item.id}-alt` : undefined} onChange={e => changeMedia(media.map(m => m.id === item.id ? { ...m, alt: e.target.value } : m))} />
        {errors[`media.${item.id}.alt`] && <p id={`media-error-${item.id}-alt`} role="alert" className="af-field-error">{errors[`media.${item.id}.alt`]}</p>}
        <div className="dimg-actions"><button className="af-btn" type="button" disabled={blocked || item.isCover} onClick={() => changeMedia(media.map(m => ({ ...m, isCover: m.id === item.id })))}>Đặt đại diện</button>
          <button className="af-btn" type="button" disabled={blocked || index === 0} aria-label={`Đưa ảnh ${item.alt} lên trước`} onClick={() => { const next = [...media]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; changeMedia(next); }}>Lên</button>
          <button className="af-btn" type="button" disabled={blocked || index === media.length - 1} aria-label={`Đưa ảnh ${item.alt} xuống sau`} onClick={() => { const next = [...media]; [next[index + 1], next[index]] = [next[index]!, next[index + 1]!]; changeMedia(next); }}>Xuống</button>
          <button className="af-btn" type="button" disabled={blocked} onClick={() => changeMedia(media.filter(m => m.id !== item.id))}>Gỡ ảnh</button></div>
        <details className="dv3-disclosure"><summary>Chú thích, tác giả & quyền sử dụng</summary>
          {(["caption", "author", "sourceUrl"] as const).map(field => <div key={field}><label htmlFor={`media-${field}-${item.id}`}>{field === "caption" ? "Chú thích" : field === "author" ? "Tác giả" : "URL nguồn HTTPS"}</label><input className="af-input" type={field === "sourceUrl" ? "url" : "text"} id={`media-${field}-${item.id}`} value={item[field] ?? ""} disabled={blocked} aria-invalid={Boolean(errors[`media.${item.id}.${field}`])} aria-describedby={errors[`media.${item.id}.${field}`] ? `media-error-${item.id}-${field}` : undefined} onChange={e => changeMedia(media.map(m => m.id === item.id ? { ...m, [field]: e.target.value || null } : m))} />{errors[`media.${item.id}.${field}`] && <p id={`media-error-${item.id}-${field}`} role="alert" className="af-field-error">{errors[`media.${item.id}.${field}`]}</p>}</div>)}
          <label htmlFor={`media-evidence-${item.id}`}>Bằng chứng quyền sử dụng</label><textarea className="af-textarea resize-none" id={`media-evidence-${item.id}`} value={review[item.id!] ?? item.rightsEvidence ?? ""} maxLength={2000} disabled={blocked} onChange={e => setReview(old => ({ ...old, [item.id!]: e.target.value }))} />
          <p className="af-helper">Xác nhận chỉ khi đã có quyền sử dụng. Lưu chỉnh sửa ảnh trước khi duyệt. Gỡ ảnh chỉ bỏ liên kết khỏi điểm đến.</p>
          <div className="dimg-actions"><button type="button" className="af-btn" disabled={blocked || changed} onClick={() => void reviewImage(item, "APPROVED")}>Xác nhận duyệt quyền</button><button type="button" className="af-btn" disabled={blocked || changed} onClick={() => void reviewImage(item, "REJECTED")}>Từ chối</button><button type="button" className="af-btn" disabled={blocked || changed} onClick={() => void reviewImage(item, "UNKNOWN")}>Thu hồi duyệt</button></div>
        </details>
      </div>
    </article>)}</div>
    {!media.length && <p className="af-helper">Chưa có ảnh. Hình ảnh là tùy chọn.</p>}
    {reviewUnknown && <button type="button" className="af-btn" disabled={disabled || busy} onClick={() => { const item = media.find(m => m.id === (reviewAttempt.current?.input as { id?: string })?.id); if (item) void reviewImage(item, "UNKNOWN"); }}>Đọc lại và thử lại quyết định</button>}
    {changed && <p role="status" className="af-helper">Thay đổi ảnh chưa lưu. Bấm Lưu thay đổi để xác nhận; tải lại hồ sơ để hủy.</p>}
  </AdminCollapsibleSection>;
});
export default DestinationImages;
