"use client";
import "./destinations.css";
import "@/components/admin/admin-form-shell.css";
import "./destination-v3.css";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  FileText,
  MapPin,
  Clock3,
  ShieldCheck,
  LoaderCircle,
  Save,
  Plus,
  Expand,
} from "lucide-react";
import { toast } from "sonner";
import {
  DESTINATION_DESCRIPTION_MAX_LENGTH,
  type DestinationDto,
} from "@/modules/destination/destination-contract";
import {
  destinationV3CreateSchema,
  destinationV3PatchSchema,
  type DestinationV3Input,
} from "@/modules/destination/destination-v3-contract";
import { destinationCategories } from "@/modules/destination/destination-categories";
import { shortDescription } from "@/modules/destination/short-description";
import {
  loadDestination,
  loadDestinations,
  saveDestination,
} from "@/lib/destination-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import {
  claimSubmission,
  releaseSubmission,
} from "@/lib/auth-submission-guard";
import { markDestinationSaved } from "@/lib/destination-save-notice";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import {
  AdminField,
  AdminLabel,
  AdminCollapsibleSection,
  AdminPageHeader,
  AdminVisibilityBadge,
  AdminStickyActions,
  AdminLoadingState,
  AdminAlert,
  AdminValidationSummary,
  focusFormError,
} from "@/components/admin/admin-form-shell";
import AdminContentPreview from "@/components/admin/admin-content-preview";
import {
  destinationProfileSchema,
  sourceSchema,
} from "@/modules/content-profile/content-profile-contract";
import { weekdayLabels } from "@/modules/destination/destination-contract";
import OpeningHoursEditor from "./opening-hours-editor";
import { useDestinationVisibility } from "./destination-visibility-action";
import DestinationAddressField from "./destination-address-field";
import DestinationMapsField from "./destination-maps-field";
import DestinationImages, { type DestinationImagesHandle } from "./destination-images";
import {
  destinationDraft,
  destinationDraftPayload,
  type DestinationDraft,
} from "./destination-v3-form-model";

export default function DestinationForm({ id }: { id: string | null }) {
  const router = useRouter();
  const [dto, setDto] = useState<DestinationDto>();
  const [draft, setDraft] = useState(destinationDraft);
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [preview, setPreview] = useState(false);
  const [descriptionEditorOpen, setDescriptionEditorOpen] = useState(false);
  const images = useRef<DestinationImagesHandle>(null);
  const descriptionDialog = useRef<HTMLDialogElement>(null);
  const descriptionExpandButton = useRef<HTMLButtonElement>(null);
  const [mediaPatch, setMediaPatch] = useState<Partial<DestinationV3Input>>({});
  const [imageState, setImageState] = useState({ busy: false, pending: false, uncertainReview: false });
  const imageStateChanged = useCallback((value: { busy: boolean; pending: boolean; uncertainReview: boolean }) => setImageState(value), []);
  const mediaPatchChanged = useCallback((value: Partial<DestinationV3Input>) => {
    setMediaPatch(value);
    setErrors(old => Object.fromEntries(Object.entries(old).filter(([path]) => !path.startsWith("media."))));
  }, []);
  const lock = useRef(false);
  const attempt = useRef<{ key: string; input: DestinationV3Input } | null>(
    null,
  );
  const visibilityAction = useDestinationVisibility(
    (confirmed) => {
      const next = destinationDraft(confirmed);
      baseline.current = JSON.stringify(next);
      setDto(confirmed);
      setDraft(next);
    },
    lock,
  );
  const baseline = useRef(JSON.stringify(destinationDraft()));
  const dirty = JSON.stringify(draft) !== baseline.current || Object.keys(mediaPatch).length > 0 || imageState.pending;
  const markSafeToLeave = useUnsavedChanges(
    dirty,
    saving || unknown || visibilityAction.busy || imageState.busy,
  );
  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    void loadDestination(id)
      .then((value) => {
        if (active) {
          setDto(value);
          const next = destinationDraft(value);
          setDraft(next);
          baseline.current = JSON.stringify(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(
            "Không thể tải điểm đến. Kiểm tra phiên Admin và thử lại.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, reload]);
  useEffect(() => {
    const dialog = descriptionDialog.current;
    if (descriptionEditorOpen && dialog && !dialog.open) dialog.showModal();
  }, [descriptionEditorOpen]);
  function change<K extends keyof DestinationDraft>(
    key: K,
    value: DestinationDraft[K],
  ) {
    setDraft((old) => ({ ...old, [key]: value }));
    setErrors((old) =>
      Object.fromEntries(
        Object.entries(old).filter(
          ([path]) => path !== key && !path.startsWith(key + "."),
        ),
      ),
    );
    setFeedback("");
  }
  function closeDescriptionEditor() {
    setDescriptionEditorOpen(false);
    window.requestAnimationFrame(() => {
      if (descriptionExpandButton.current && !descriptionExpandButton.current.disabled)
        descriptionExpandButton.current.focus();
    });
  }
  const focusError = (path: string) => {
    if (path.startsWith("media.")) {
      const [, mediaId, field] = path.split(".");
      const control = document.getElementById(`media-${field}-${mediaId}`);
      const details = control?.closest("details"); if (details) details.open = true;
      if (control) { control.focus(); control.scrollIntoView({ block: "center" }); return; }
    }
    focusFormError(path, "dv3");
  };
  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (images.current?.isBusy() || imageState.busy || imageState.uncertainReview) return;
    if (!claimSubmission(lock)) return;
    let completed = false;
    try {
      let input: DestinationV3Input;
      if (unknown && attempt.current) input = attempt.current.input;
      else {
        const raw = { ...destinationDraftPayload(draft, dto), ...(id ? mediaPatch : {}) };
        const parsed = (
          id ? destinationV3PatchSchema : destinationV3CreateSchema
        ).safeParse(raw);
        if (!parsed.success) {
          const paths = parsed.error.issues.map((i) => {
            let path = i.path.join(".");
            if (i.path[0] === "media" && typeof i.path[1] === "number") {
              const mediaId = raw.media?.[i.path[1]]?.id;
              if (mediaId) path = path.replace(/^media\.\d+/u, "media." + mediaId);
            }
            if (i.path[0] === "sources" && typeof i.path[1] === "number") {
              const source = raw.sources?.[i.path[1]];
              const index = draft.sources.findIndex((s) => s === source);
              if (index >= 0)
                path = path.replace(/^sources\.\d+/u, "sources." + index);
            }
            return { path, message: i.message };
          });
          const next = Object.fromEntries(
            paths.map((i) => [i.path, i.message]),
          );
          setErrors(next);
          focusError(paths[0]?.path ?? "name");
          return;
        }
        input = parsed.data;
        if (
          !attempt.current ||
          JSON.stringify(attempt.current.input) !== JSON.stringify(input)
        )
          attempt.current = { key: createIdempotencyKey(), input };
      }
      setSaving(true);
      setFeedback("");
      setErrors({});
      if (unknown) {
        if (id) await loadDestination(id);
        else await loadDestinations();
      }
      const result = await saveDestination(id, input, attempt.current!.key);
      if (result.status === "SUCCESS") {
        toast.dismiss("destination-write");
        setDto(result.data);
        setMediaPatch({});
        const imagesComplete = await images.current?.uploadAll(result.data.id) ?? true;
        completed = true;
        markSafeToLeave();
        if (id) {
          const savedDraft = destinationDraft(result.data);
          baseline.current = JSON.stringify(savedDraft);
          setDraft(savedDraft);
          setUnknown(false);
          attempt.current = null;
          releaseSubmission(lock);
          setSaving(false);
          if (imagesComplete) toast.success("Đã lưu thay đổi.", {id:"destination-write",position:"bottom-right"});
          else {
            setFeedback("Nội dung đã lưu; còn ảnh chưa hoàn tất. Thử lại các ảnh chờ với cùng file và key.");
            toast.warning("Đã lưu nội dung; còn ảnh chưa hoàn tất.", { id: "destination-write", position: "bottom-right" });
          }
        } else {
          baseline.current = JSON.stringify(draft);
          if (imagesComplete) markDestinationSaved();
          else {
            images.current?.handoff(result.data.id);
            toast.warning("Điểm đến đã tạo ở trạng thái ẩn; còn ảnh chưa hoàn tất. Thử lại tại trang chỉnh sửa.", { id: "destination-write", position: "bottom-right" });
          }
        }
        router.push(`/admin/destinations/${encodeURIComponent(result.data.id)}/edit`);
        return;
      }
      if (result.status === "UNKNOWN") {
        setUnknown(true);
        toast.warning("Chưa xác định kết quả lưu.", {
          position: "bottom-right",
          id: "destination-write",
        });
        setFeedback(
          "Chưa xác định kết quả lưu. Nội dung và key được giữ nguyên; dùng Đọc lại và thử lại.",
        );
      } else {
        setUnknown(false);
        attempt.current = null;
        setFeedback(
          authorizationFeedback(result.httpStatus) ?? result.error.message,
        );
        if (Array.isArray(result.error.details)) {
          const details = result.error.details.filter(
            (i): i is { path: string; message: string } =>
              Boolean(
                i &&
                  typeof i.path === "string" &&
                  typeof i.message === "string",
              ),
          );
          setErrors(
            Object.fromEntries(details.map((i) => [i.path, i.message])),
          );
          if (details[0]) focusError(details[0].path);
        }
        toast.error("Lưu thất bại. Nội dung đang nhập được giữ nguyên.", {
          id: "destination-write",
          position: "bottom-right",
        });
      }
    } catch {
      setFeedback(
        "Không thể đọc lại dữ liệu. Nội dung và key vẫn được giữ nguyên.",
      );
    } finally {
      if (!completed) {
        releaseSubmission(lock);
        setSaving(false);
      }
    }
  }
  const disabled = saving || unknown || visibilityAction.busy;
  function field(
    key: "name" | "suggestedDurationMinutes" | "minimumDurationMinutes",
    label: string,
    required = false,
  ) {
    const placeholders: Record<string, string> = {
      name: "Ví dụ: Đèo Mã Pí Lèng, Cột cờ Lũng Cú...",
      suggestedDurationMinutes: "Ví dụ: 120 (phút)",
      minimumDurationMinutes: "Ví dụ: 60 (phút)",
    };
    return (
      <AdminField error={errors[key]} errorId={"err-" + key}>
        <AdminLabel
          htmlFor={"destination-" + key}
          required={required}
          optional={!required}
        >
          {label}
        </AdminLabel>
        <input
          id={"destination-" + key}
          className="af-input"
          value={draft[key]}
          placeholder={placeholders[key]}
          inputMode={key === "name" ? "text" : "numeric"}
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={Boolean(errors[key])}
          aria-describedby={errors[key] ? "err-" + key : undefined}
        />
      </AdminField>
    );
  }
  if (loading)
    return (
      <div className="af-root dv3-page">
        <AdminLoadingState>Đang tải biểu mẫu…</AdminLoadingState>
      </div>
    );
  if (loadError)
    return (
      <div className="af-root dv3-page">
        <AdminAlert variant="error">{loadError}</AdminAlert>
        <button
          type="button"
          className="af-btn"
          onClick={() => setReload((n) => n + 1)}
        >
          Thử tải lại
        </button>
      </div>
    );
  const summary =
    dto && draft.description === dto.description
      ? dto.profile?.shortDescription
      : shortDescription(draft.description);
  return (
    <div className="af-root dv3-page">
      <AdminPageHeader
        breadcrumb={<Link href="/admin/destinations">← Quản lý điểm đến</Link>}
        title={id ? "Chỉnh sửa điểm đến" : "Tạo điểm đến mới"}
        subtitle="Một hồ sơ ngắn gọn để khám phá và lập hành trình Hà Giang."
        meta={<><AdminVisibilityBadge visibility={dto?.visibility ?? "HIDDEN"} /><a className="af-btn" href="#destination-save">Đi tới nút lưu</a></>}
      />
      <main className="dv3-main">
        {id && <div style={{ marginBottom: 20 }}><Link className="af-btn" href={`/admin/destinations/${encodeURIComponent(id)}/editorial` as Route}>Thiết kế trang giới thiệu</Link></div>}
        <form method="post" noValidate onSubmit={(e) => void submit(e)}>
          {feedback && (
            <AdminAlert variant={unknown ? "warning" : "error"}>
              {feedback}
            </AdminAlert>
          )}
          {visibilityAction.feedback}
          <AdminValidationSummary errors={errors} prefix="dv3" />
          <fieldset disabled={disabled} className="dv3-fields">
            <AdminCollapsibleSection
              id="dv3-basic"
              icon={FileText}
              title="Thông tin cơ bản"
              description="Tên, danh mục và một mô tả đầy đủ cho điểm đến."
              badge="required"
            >
              <div className="af-grid-2">
                {field("name", "Tên điểm đến", true)}
                <AdminField error={errors.category} errorId="err-category">
                  <AdminLabel htmlFor="destination-category" required>
                    Danh mục
                  </AdminLabel>
                  <select
                    id="destination-category"
                    className="af-select"
                    value={draft.category}
                    onChange={(e) => change("category", e.target.value)}
                    aria-invalid={Boolean(errors.category)}
                    aria-describedby={
                      errors.category ? "err-category" : undefined
                    }
                  >
                    <option value="">Chọn danh mục</option>
                    {dto &&
                      !destinationCategories.some(
                        (c) => c === dto.category,
                      ) && (
                        <option value={dto.category}>
                          {dto.category} (đang sử dụng)
                        </option>
                      )}
                    {destinationCategories.map((c) => (
                      <option value={c} key={c}>
                        {c.charAt(0).toLocaleUpperCase("vi") + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </AdminField>
              </div>
              <AdminField error={errors.description} errorId="err-description">
                <AdminLabel htmlFor="destination-description" required>
                  Mô tả điểm đến
                </AdminLabel>
                <textarea
                  id="destination-description"
                  className="af-textarea dv3-description"
                  rows={6}
                  value={draft.description}
                  placeholder="Nhập mô tả chi tiết về cảnh quan, trải nghiệm du lịch, văn hóa và các thông tin cần biết cho du khách..."
                  maxLength={DESTINATION_DESCRIPTION_MAX_LENGTH}
                  onChange={(e) => {
                    change("description", e.target.value);
                  }}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby="description-help description-count err-description"
                />
                <div className="dv3-description-meta-row">
                  <div className="dv3-textarea-meta">
                    <p id="description-help" className="af-helper">
                      Mô tả đặc điểm, trải nghiệm và thông tin cần biết.
                    </p>
                    <span id="description-count" className="dv3-char-count">
                      {draft.description.length.toLocaleString("vi-VN")} / {DESTINATION_DESCRIPTION_MAX_LENGTH.toLocaleString("vi-VN")} ký tự
                    </span>
                  </div>
                  <button
                    id="destination-description-expand"
                    ref={descriptionExpandButton}
                    type="button"
                    className="af-btn dv3-description-expand"
                    disabled={disabled}
                    onClick={() => setDescriptionEditorOpen(true)}
                    aria-haspopup="dialog"
                  >
                    <Expand size={16} />
                    <span>Xem thêm và chỉnh sửa</span>
                  </button>
                </div>
              </AdminField>
              {summary && (
                <details className="dv3-disclosure">
                  <summary>Mô tả ngắn tự sinh</summary>
                  <p className="dv3-summary">{summary}</p>
                </details>
              )}
            </AdminCollapsibleSection>
            <AdminCollapsibleSection
              id="dv3-location"
              icon={MapPin}
              title="Địa chỉ & Google Maps"
              description="Địa chỉ hành chính hiện hành và tọa độ điểm chính xác."
            >
              <DestinationAddressField
                value={draft.address}
                onChange={(value) => change("address", value)}
                error={errors.address}
              />
              <DestinationMapsField
                value={draft.googleMapsUrl}
                onChange={(value) => change("googleMapsUrl", value)}
                error={errors.googleMapsUrl}
                legacy={
                  dto
                    ? {
                        url: dto.profile?.googleMapsUrl ?? "",
                        latitude: dto.latitude,
                        longitude: dto.longitude,
                      }
                    : undefined
                }
              />
            </AdminCollapsibleSection>
            <AdminCollapsibleSection
              id="dv3-planning"
              icon={Clock3}
              title="Thông tin lập hành trình"
              description="Bổ sung khi có dữ liệu. Bỏ trống không có nghĩa là 0 phút hoặc luôn mở cửa."
              badge="optional"
            >
              <div className="af-grid-2">
                {field(
                  "suggestedDurationMinutes",
                  "Thời lượng tham quan gợi ý (phút)",
                )}
                {field("minimumDurationMinutes", "Thời lượng tối thiểu (phút)")}
              </div>
              <details
                className="dv3-disclosure"
                open={
                  Object.keys(errors).some((k) =>
                    k.startsWith("openingDays"),
                  ) || undefined
                }
              >
                <summary>Giờ hoạt động</summary>
                <OpeningHoursEditor
                  days={draft.openingDays}
                  errors={errors}
                  onChange={(days) => change("openingDays", days)}
                />
              </details>
            </AdminCollapsibleSection>
            <DestinationImages ref={images} id={id} dto={dto} disabled={disabled} errors={errors}
              onConfirmed={setDto} onPatch={mediaPatchChanged} onState={imageStateChanged} />
            <AdminCollapsibleSection
              id="dv3-sources"
              icon={ShieldCheck}
              title="Nguồn & xuất bản"
              description="Tên nguồn và URL HTTPS công khai. URL hợp lệ chưa có nghĩa nội dung đã được kiểm chứng."
            >
              {draft.sources.length === 0 && (
                <p className="af-helper">Chưa thêm nguồn tham khảo.</p>
              )}
              {draft.sources.map((source, index) => (
                <div className="dv3-source" key={source.id ?? index}>
                  {(["title", "url"] as const).map((key) => (
                    <AdminField
                      key={key}
                      error={errors[`sources.${index}.${key}`]}
                      errorId={`err-source-${index}-${key}`}
                    >
                      <AdminLabel
                        htmlFor={`destination-sources.${index}.${key}`}
                      >
                        {key === "title" ? "Tên nguồn" : "URL HTTPS"}
                      </AdminLabel>
                      <input
                        id={`destination-sources.${index}.${key}`}
                        className="af-input"
                        type={key === "url" ? "url" : "text"}
                        value={source[key]}
                        onChange={(e) =>
                          change(
                            "sources",
                            draft.sources.map((s, i) =>
                              i === index ? { ...s, [key]: e.target.value } : s,
                            ),
                          )
                        }
                        aria-invalid={Boolean(
                          errors[`sources.${index}.${key}`],
                        )}
                        aria-describedby={`err-source-${index}-${key}`}
                      />
                    </AdminField>
                  ))}
                  <button
                    type="button"
                    className="af-btn"
                    aria-label={`Xóa nguồn ${source.title || index + 1}`}
                    onClick={() =>
                      change(
                        "sources",
                        draft.sources.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Xóa nguồn
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="af-btn"
                onClick={() =>
                  change("sources", [
                    ...draft.sources,
                    { id: undefined, title: "", url: "" },
                  ])
                }
                disabled={draft.sources.length >= 30}
              >
                + Thêm nguồn
              </button>
              <p className="af-helper">
                Đổi URL nguồn sẽ đưa quyền sử dụng và trạng thái duyệt của nguồn
                đó về chưa xác định; các nguồn không đổi giữ nguyên metadata.
              </p>
              <button
                type="button"
                className="af-btn"
                onClick={() => setPreview((v) => !v)}
                aria-expanded={preview}
              >
                {" "}
                {preview ? "Đóng xem trước" : "Xem trước hồ sơ"}
              </button>
              {preview && (
                <AdminContentPreview
                  simplifiedDestination
                  title={draft.name}
                  content={draft.description}
                  profile={{
                    ...destinationProfileSchema.parse({}),
                    ...dto?.profile,
                    shortDescription: summary ?? null,
                    address: draft.address || null,
                    googleMapsUrl: draft.googleMapsUrl || null,
                    sources: draft.sources.map((source) => {
                      const previous = dto?.profile?.sources.find(
                        (old) => old.id === source.id,
                      );
                      return {
                        ...sourceSchema.parse({ title: "Nguồn" }),
                        ...(previous?.url === source.url ? previous : {}),
                        ...source,
                        url: source.url || null,
                      };
                    }),
                  }}
                  location={
                    dto &&
                    draft.googleMapsUrl === (dto.profile?.googleMapsUrl ?? "")
                      ? {
                          latitude: String(dto.latitude),
                          longitude: String(dto.longitude),
                        }
                      : undefined
                  }
                  durations={{
                    suggested: draft.suggestedDurationMinutes,
                    minimum: draft.minimumDurationMinutes,
                  }}
                  hours={draft.openingDays.map((day, index) => ({
                    day: weekdayLabels[index]!,
                    status: day.status,
                    intervals: day.intervals,
                  }))}
                />
              )}
              <div className="dv3-publication">
                <AdminVisibilityBadge
                  visibility={dto?.visibility ?? "HIDDEN"}
                />
                <p className="af-helper">
                  {id
                    ? "Lưu nội dung không thay đổi trạng thái hiển thị. Xuất bản là thao tác riêng trên dữ liệu đã lưu."
                    : "Điểm đến mới luôn được tạo ở trạng thái ẩn. Kiểm tra hồ sơ trước khi xuất bản."}
                </p>
                {dto &&
                  visibilityAction.action(dto, dirty || saving || unknown)}
                {dto && dirty && (
                  <p className="af-helper">
                    Lưu thay đổi trước khi đổi trạng thái hiển thị.
                  </p>
                )}
              </div>
            </AdminCollapsibleSection>
          </fieldset>
          <AdminStickyActions
            message={
              <span className="dv3-sticky-status">
                <span className={`dv3-status-dot ${dirty ? "is-dirty" : "is-clean"}`} />
                <span>
                  {unknown
                    ? "Kết quả chưa xác định; giữ nguyên nội dung và key."
                    : dirty
                      ? "Có thay đổi chưa lưu."
                      : id
                        ? "Chưa có thay đổi."
                        : "Tạo ở trạng thái ẩn."}
                </span>
              </span>
            }
          >
            {!disabled && (
              <Link className="af-btn" href="/admin/destinations">
                Hủy
              </Link>
            )}
            <button
              id="destination-save"
              type="submit"
              className="af-btn af-btn-primary"
              disabled={saving || visibilityAction.busy || imageState.busy || imageState.uncertainReview}
              aria-busy={saving}
            >
              {saving ? (
                <LoaderCircle className="af-spinner" size={16} />
              ) : id ? (
                <Save size={16} />
              ) : (
                <Plus size={16} />
              )}
              <span>
                {unknown
                  ? "Đọc lại và thử lại"
                  : saving
                    ? "Đang lưu…"
                    : id
                      ? "Lưu thay đổi"
                      : "Tạo điểm đến"}
              </span>
            </button>
          </AdminStickyActions>
        </form>
      </main>
      {descriptionEditorOpen && (
        <dialog
          ref={descriptionDialog}
          id="destination-description-dialog"
          className="dv3-description-dialog"
          aria-labelledby="destination-description-dialog-title"
          aria-describedby="destination-description-dialog-help"
          onCancel={(event) => {
            event.preventDefault();
            closeDescriptionEditor();
          }}
          onClose={closeDescriptionEditor}
        >
          <div className="dv3-description-dialog-content">
            <header className="dv3-description-dialog-header">
              <div>
                <h2 id="destination-description-dialog-title">Mô tả điểm đến</h2>
                <p id="destination-description-dialog-help">
                  Nội dung dài được cuộn trong khung này, không làm trang biểu mẫu kéo dài thêm.
                </p>
              </div>
              <button
                type="button"
                className="af-btn"
                onClick={closeDescriptionEditor}
              >
                Đóng
              </button>
            </header>
            <label className="sr-only" htmlFor="destination-description-expanded">
              Mô tả điểm đến đầy đủ
            </label>
            <textarea
              id="destination-description-expanded"
              className="af-textarea dv3-description-expanded"
              rows={12}
              value={draft.description}
              maxLength={DESTINATION_DESCRIPTION_MAX_LENGTH}
              onChange={(e) => change("description", e.target.value)}
              aria-invalid={Boolean(errors.description)}
              aria-describedby="description-help description-count err-description"
              disabled={disabled}
              autoFocus
            />
            <p className="dv3-description-dialog-count">
              {draft.description.length.toLocaleString("vi-VN")} / {DESTINATION_DESCRIPTION_MAX_LENGTH.toLocaleString("vi-VN")} ký tự
            </p>
          </div>
        </dialog>
      )}
    </div>
  );
}
