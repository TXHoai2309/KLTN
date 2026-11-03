"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { AdminCollapsibleSection } from "@/components/admin/admin-form-shell";
import PublishedMediaImage from "@/components/published-media-image";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { createClientImageIntent, uploadClientImage } from "@/lib/destination-image-client";
import { type DestinationDto } from "@/modules/destination/destination-contract";
import { MAX_IMAGE_BYTES, IMAGE_TYPES, type InitialImageSelection } from "@/modules/destination/destination-media-contract";
import type { DestinationV3Input } from "@/modules/destination/destination-v3-contract";
import { isDestinationMediaUsable } from "@/modules/destination/destination-media-eligibility";
import "./destination-images.css";

type Media = NonNullable<DestinationDto["profile"]>["media"][number];
type QueueItem = { file: File; key: string; preview: string; status: "QUEUED" | "UPLOADING" | "ERROR" | "UNKNOWN" | "SUCCESS"; progress: number; error: string; initialSelection?: InitialImageSelection };
// Route handoff keeps File objects in memory only; no browser persistence or credentials.
const handoffs = new Map<string, QueueItem[]>();
export type DestinationImagesHandle = { uploadAll(id: string): Promise<boolean>; isBusy(): boolean; handoff(id: string): void };
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
  const runningUpload = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const onConfirmedRef = useRef(onConfirmed); onConfirmedRef.current = onConfirmed;
  const saved = dto?.profile?.media ?? [];
  const changed = JSON.stringify(media) !== JSON.stringify(saved);
  const input = useRef<HTMLInputElement>(null);
  function updateQueue(next: QueueItem[]) { queueRef.current = next; if (mounted.current) setQueue(next); }
  function updateItem(key: string, change: Partial<QueueItem>) { updateQueue(queueRef.current.map(item => item.key === key ? { ...item, ...change } : item)); }
  function changeSelection(next: QueueItem[]) {
    const hasCover = next.some(item => item.initialSelection?.isCover);
    updateQueue(next.map((item, position) => ({ ...item, initialSelection: {
      caption: item.initialSelection?.caption ?? null,
      isCover: hasCover ? item.initialSelection?.isCover === true : position === 0,
      position,
    } })));
  }
  function removeFile(item: QueueItem) {
    URL.revokeObjectURL(item.preview);
    const next = queueRef.current.filter(q => q.key !== item.key);
    if (!id) changeSelection(next); else updateQueue(next);
  }
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
  useEffect(() => { onState({ busy, pending: queue.some(item => item.status !== "SUCCESS") , uncertainReview: false }); }, [busy, queue, onState]);
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
    if (disabled || busyRef.current || configured !== true || changed) return;
    setError("");
    const next = [...queueRef.current];
    for (const file of Array.from(files)) {
      if (saved.length + next.filter(item => item.status !== "SUCCESS").length >= 20) { setError("Tối đa 20 ảnh. Gỡ ảnh hoặc file trong hàng đợi trước khi thêm."); break; }
      if (!IMAGE_TYPES.includes(file.type as typeof IMAGE_TYPES[number]) || !file.size || file.size > MAX_IMAGE_BYTES) { setError(`File “${file.name}” không hợp lệ. Chọn JPEG, PNG, WebP hoặc AVIF tối đa 10 MB.`); continue; }
      next.push({ file, key: createIdempotencyKey(), preview: URL.createObjectURL(file), status: "QUEUED", progress: 0, error: "" });
    }
    if (!id) changeSelection(next); else updateQueue(next);
    if (id) void uploadAll(id, true);
  }
  function uploadAll(destinationId: string, queuedOnly = false): Promise<boolean> {
    if (runningUpload.current) return runningUpload.current;
    if (busyRef.current) return Promise.resolve(false);
    const items = queueRef.current.filter(item => queuedOnly ? item.status === "QUEUED" : item.status !== "SUCCESS");
    if (!items.length) return Promise.resolve(queueRef.current.every(item => item.status === "SUCCESS"));
    busyRef.current = true; setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    let cursor = 0;
    let confirmedUpdatedAt = dto ? Date.parse(dto.updatedAt) : -Infinity;
    let confirmedMediaCount = dto?.profile?.media.length ?? -1;
    const worker = async () => {
      while (!controller.signal.aborted && cursor < items.length) {
        const item = items[cursor++]!;
        updateItem(item.key, { status: "UPLOADING", progress: 0, error: "" });
        const intent = await createClientImageIntent(destinationId, item.file, item.key, controller.signal, item.initialSelection);
        if (intent.status !== "SUCCESS") { updateItem(item.key, { status: intent.status === "UNKNOWN" ? "UNKNOWN" : "ERROR", error: intent.message }); continue; }
        const result = await uploadClientImage(destinationId, item.file, item.key, value => updateItem(item.key, { progress: value }), controller.signal);
        if (result.status === "SUCCESS") {
          updateItem(item.key, { status: "SUCCESS", progress: 100 });
          // Delayed responses and older idempotent replays must not replace a
          // newer DB snapshot; use append count only to break equal timestamps.
          const count = result.data.profile?.media.length ?? 0;
          const updatedAt = Date.parse(result.data.updatedAt);
          if (mounted.current && (updatedAt > confirmedUpdatedAt || (updatedAt === confirmedUpdatedAt && count > confirmedMediaCount))) {
            confirmedUpdatedAt = updatedAt; confirmedMediaCount = count; onConfirmedRef.current(result.data);
          }
        }
        else updateItem(item.key, { status: result.status === "UNKNOWN" ? "UNKNOWN" : "ERROR", error: result.message });
      }
    };
    runningUpload.current = Promise.all([worker(), worker()])
      .then(() => queueRef.current.every(item => item.status === "SUCCESS"))
      .finally(() => { runningUpload.current = null; busyRef.current = false; if (mounted.current) setBusy(false); });
    return runningUpload.current;
  }
  useImperativeHandle(ref, () => ({ uploadAll, isBusy: () => busyRef.current, handoff(destinationId) {
    const pending = queueRef.current.filter(item => item.status !== "SUCCESS").map(item => ({ ...item, preview: URL.createObjectURL(item.file) }));
    if (pending.length) handoffs.set(destinationId, pending);
  } }));
  const blocked = disabled || busy;
  return <AdminCollapsibleSection id="dv3-images" icon={ImagePlus} title="Hình ảnh" badge="optional" description="Tải ảnh, chọn ảnh đại diện và sắp xếp thư viện. Chú thích là tùy chọn.">
    <p className="af-helper" aria-live="polite">{id ? `${media.length} / 20 ảnh đã lưu · ${queue.filter(item => item.status !== "SUCCESS").length} ảnh chờ tải` : `${queue.length} / 20 ảnh đã chọn`}</p>
    {configured === null && !configError && <p role="status" className="af-helper">Đang kiểm tra khả năng tải ảnh…</p>}
    {configured === false && <p role="status" className="af-helper">Chưa cấu hình tải ảnh. Bạn vẫn có thể lưu thông tin và quản lý ảnh đã có.</p>}
    {configError && <div role="alert"><p>{configError}</p><button type="button" className="af-btn" onClick={() => setConfigRetry(n => n + 1)}>Kiểm tra lại</button></div>}
    <div className="dimg-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFiles(e.dataTransfer.files); }}>
      <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(",")} hidden disabled={blocked || changed || configured !== true} onChange={e => { if (e.target.files) selectFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" className="af-btn" disabled={blocked || changed || configured !== true || (id ? media.length : queue.length) >= 20} onClick={() => input.current?.click()}><ImagePlus size={18} aria-hidden="true" />{id ? "Tải ảnh lên" : "Chọn ảnh"}</button>
      <p className="af-helper">Kéo thả hoặc chọn nhiều ảnh · JPEG, PNG, WebP, AVIF · tối đa 10 MB/ảnh.</p>
      {!id && <p className="af-helper">Chọn ảnh để xem trước, thêm chú thích và sắp xếp ngay. Ảnh sẽ được tải lên khi bạn bấm Tạo điểm đến.</p>}
      {id && <p className="af-helper">Ảnh tự tải và lưu ngay khi chọn, không cần bấm Lưu thay đổi.</p>}
      {changed && <p className="af-helper">Lưu chỉnh sửa ảnh hiện tại trước khi tải thêm.</p>}
    </div>
    {error && <p role="alert" className="af-field-error">{error}</p>}
    {id && queue.length > 0 && <div className="dimg-queue">
      {queue.map(item => <div className="dimg-queue-row" key={item.key}>
        <img src={item.preview} alt={`Xem trước ${item.file.name}`} width={80} height={64} />
        <div><strong>{item.file.name}</strong><p role="status">{item.status === "SUCCESS" ? "Đã lưu" : item.status === "UPLOADING" ? item.progress < 100 ? `Đang gửi file: ${item.progress}%` : "Đang xác minh và lưu ảnh…" : item.status === "QUEUED" ? "Chờ tải" : item.error}</p>
          {item.status === "UPLOADING" && <progress max={100} value={item.progress} aria-label={`Tiến độ gửi ${item.file.name}`} />}</div>
        {item.status !== "SUCCESS" && <button className="af-btn" type="button" disabled={blocked || item.status === "UNKNOWN"} onClick={() => removeFile(item)}>Bỏ file</button>}
      </div>)}
      {id && <button className="af-btn" type="button" disabled={disabled || busy || changed || queue.every(item => item.status === "SUCCESS")} onClick={() => void uploadAll(id)}>Tải ảnh chờ / thử lại</button>}
      {busy && !disabled && <button type="button" className="af-btn" onClick={() => abort.current?.abort()}>Dừng chờ · đối chiếu khi thử lại</button>}
      {changed && <p className="af-helper">Lưu chỉnh sửa ảnh trước khi tải thêm hoặc duyệt quyền.</p>}
    </div>}
    <div className="dimg-gallery">
      {!id && queue.map((item, index) => <article className="dimg-card dimg-local-card" key={item.key}>
        <a href={item.preview} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh lớn: ${item.file.name}`}>
          <img src={item.preview} alt={`Xem trước ${item.file.name}`} width={640} height={400} /><span>Xem ảnh lớn</span>
        </a>
        <div className="dimg-card-body">
          <strong className="dimg-filename">{item.file.name}</strong>
          <div className="dimg-local-meta">
            {item.initialSelection?.isCover && <span>Ảnh đại diện</span>}
            <p role="status" className="af-helper">{item.status === "SUCCESS" ? "Đã lưu" : item.status === "UPLOADING" ? item.progress < 100 ? `Đang gửi file: ${item.progress}%` : "Đang xác minh và lưu ảnh…" : item.status === "QUEUED" ? "Xem trước · Chưa lưu" : item.error}</p>
          </div>
          {item.status === "UPLOADING" && <progress max={100} value={item.progress} aria-label={`Tiến độ gửi ${item.file.name}`} />}
          <label htmlFor={`queued-caption-${item.key}`}>Chú thích (không bắt buộc)</label>
          <input className="af-input" id={`queued-caption-${item.key}`} value={item.initialSelection?.caption ?? ""} maxLength={1000} disabled={blocked} onChange={e => updateItem(item.key, { initialSelection: { ...item.initialSelection!, caption: e.target.value || null } })} />
          <div className="dimg-actions">
            <button className="af-btn" type="button" disabled={blocked || item.initialSelection?.isCover} onClick={() => changeSelection(queueRef.current.map(q => ({ ...q, initialSelection: { ...q.initialSelection!, isCover: q.key === item.key } })))}>Đặt đại diện</button>
            <button className="af-btn" type="button" disabled={blocked || index === 0} aria-label={`Đưa ảnh ${item.file.name} lên trước`} onClick={() => { const next = [...queueRef.current]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; changeSelection(next); }}>Lên</button>
            <button className="af-btn" type="button" disabled={blocked || index === queue.length - 1} aria-label={`Đưa ảnh ${item.file.name} xuống sau`} onClick={() => { const next = [...queueRef.current]; [next[index + 1], next[index]] = [next[index]!, next[index + 1]!]; changeSelection(next); }}>Xuống</button>
            <button className="af-btn" type="button" disabled={blocked} onClick={() => removeFile(item)}>Gỡ ảnh</button>
          </div>
        </div>
      </article>)}
      {id && media.map((item, index) => {
      const usable = Boolean(id && isDestinationMediaUsable(item, id));
      return <article className="dimg-card" key={item.id}>
        <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Xem ảnh lớn: ${item.alt}`}><PublishedMediaImage url={item.url} alt={item.alt} /><span>Xem ảnh lớn</span></a>
        <div className="dimg-card-body">
          {item.isCover && <p>Ảnh đại diện</p>}
          {!usable && <p className="af-helper">{item.websiteRights === "REJECTED" ? "Ảnh đã bị chặn sử dụng." : "Ảnh cũ được giữ lại, chưa chuyển sang sử dụng trên website."}</p>}
          <label htmlFor={`media-caption-${item.id}`}>Chú thích (không bắt buộc)</label>
          <input className="af-input" id={`media-caption-${item.id}`} value={item.caption ?? ""} maxLength={1000} disabled={blocked} aria-invalid={Boolean(errors[`media.${item.id}.caption`])} onChange={e => changeMedia(media.map(m => m.id === item.id ? { ...m, caption: e.target.value || null } : m))} />
          {errors[`media.${item.id}.caption`] && <p role="alert" className="af-field-error">{errors[`media.${item.id}.caption`]}</p>}
          <div className="dimg-actions">
            <button className="af-btn" type="button" disabled={blocked || item.isCover || !usable} onClick={() => changeMedia(media.map(m => ({ ...m, isCover: m.id === item.id })))}>Đặt đại diện</button>
            <button className="af-btn" type="button" disabled={blocked || index === 0} aria-label={`Đưa ảnh ${item.alt} lên trước`} onClick={() => { const next = [...media]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; changeMedia(next); }}>Lên</button>
            <button className="af-btn" type="button" disabled={blocked || index === media.length - 1} aria-label={`Đưa ảnh ${item.alt} xuống sau`} onClick={() => { const next = [...media]; [next[index + 1], next[index]] = [next[index]!, next[index + 1]!]; changeMedia(next); }}>Xuống</button>
            <button className="af-btn" type="button" disabled={blocked} onClick={() => changeMedia(media.filter(m => m.id !== item.id))}>Gỡ ảnh</button>
          </div>
        </div>
      </article>;
    })}</div>
    {!media.length && !queue.length && <p className="af-helper">Chưa có ảnh. Hình ảnh là tùy chọn.</p>}
    {changed && <p role="status" className="af-helper">Thay đổi ảnh chưa lưu. Bấm Lưu thay đổi để xác nhận; tải lại hồ sơ để hủy.</p>}
  </AdminCollapsibleSection>;
});
export default DestinationImages;
