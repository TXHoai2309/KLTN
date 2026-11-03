"use client";

import { useId, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Clock3,
  Eye,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Pencil,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { CompanionIntroductionView } from "@/components/trip-companions/companion-introduction-view";
import {
  previewCompanionDraft,
  publishCompanionTrip,
} from "@/modules/trip-companions/companion-client";
import {
  companionDraftSchema,
  type CompanionDraft,
  type CompanionFormContext,
  type CompanionIntroduction,
} from "@/modules/trip-companions/companion-contract";

export interface PublicationFormClientProps {
  tripId: string;
  context: CompanionFormContext;
}

export function PublicationFormClient({ tripId, context }: PublicationFormClientProps) {
  // If already published, show current publication link and guidance
  if (context.publication) {
    return (
      <div className="companion-container">
        <div className="companion-breadcrumbs">
          <Link href="/trips">Chuyến đi của tôi</Link>
          <span className="companion-breadcrumbs-sep">/</span>
          <Link href={`/trips/${tripId}` as Route}>Chi tiết</Link>
          <span className="companion-breadcrumbs-sep">/</span>
          <span>Tìm bạn đồng hành</span>
        </div>

        <div className="companion-header">
          <p className="companion-eyebrow">
            <Users size={14} aria-hidden="true" />
            <span>Tìm bạn đồng hành</span>
          </p>
          <h1 className="companion-title">Chuyến đi đã được công khai</h1>
          <p className="companion-subtitle">
            Hành trình này đã có bài giới thiệu tìm bạn đồng hành công khai trên hệ thống.
          </p>
        </div>

        <div className="companion-card companion-form-card">
          <div className="companion-feedback-alert companion-feedback-success" role="status">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <div>
              <strong>Bài đăng đã sẵn sàng</strong>
              <p className="m-0 mt-1 text-sm text-muted-foreground">
                Tiêu đề: <em>&ldquo;{context.publication.draft.title}&rdquo;</em> · Số chỗ tìm thêm: {context.publication.draft.additionalCapacity}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href={`/trip-companions/${context.publication.publicationId}` as Route}
              className="companion-cta-button !w-auto"
            >
              <Eye size={16} aria-hidden="true" />
              <span>Xem bài giới thiệu công khai</span>
            </Link>
            <Link
              href={`/trips/${tripId}` as Route}
              className="companion-secondary-button"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Quay lại chi tiết chuyến đi</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <PublicationDraftForm key={tripId} tripId={tripId} context={context} />;
}

function PublicationDraftForm({ tripId, context }: PublicationFormClientProps) {
  const router = useRouter();

  // Active Draft form states
  const [draft, setDraft] = useState<CompanionDraft>({
    title: `Cùng khám phá Hà Giang (${context.trip.durationDays} ngày)`,
    introduction: "Mình muốn tìm thêm bạn cùng khám phá vùng cao nguyên đá. Lịch trình vừa phải, tôn trọng văn hóa bản địa và hòa đồng cùng nhóm.",
    additionalCapacity: 2,
    imageMediaId: context.imageOptions[0]?.mediaId ?? null,
  });

  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [previewData, setPreviewData] = useState<CompanionIntroduction | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [publishState, setPublishState] = useState<"idle" | "pending" | "failed" | "unknown" | "success">("idle");
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const draftRef = useRef(draft);
  const previewRequestRef = useRef(0);
  const reviewedDraftRef = useRef<CompanionDraft | null>(null);
  // The entire attempted request survives UNKNOWN, independently of editable state.
  const publishAttemptRef = useRef<{ tripId: string; draft: CompanionDraft; key: string } | null>(null);
  const isPublishingRef = useRef(false);
  const hasPublishedRef = useRef(false);

  const titleId = useId();
  const capacityId = useId();
  const introId = useId();
  const imageFieldId = useId();

  function invalidatePreview() {
    previewRequestRef.current += 1;
    reviewedDraftRef.current = null;
    setPreviewData(null);
    setPreviewLoading(false);
  }

  function updateDraft(change: Partial<CompanionDraft>) {
    // Guard handlers too: an already-dispatched input/image callback may be stale.
    if (publishAttemptRef.current || hasPublishedRef.current) return;
    draftRef.current = { ...draftRef.current, ...change };
    setDraft(draftRef.current);
    invalidatePreview();
    setPreviewError(null);
    setPublishState("idle");
    setPublishMessage(null);
    setTab("edit");
  }

  function editDraft() {
    if (!publishAttemptRef.current && !hasPublishedRef.current) setTab("edit");
  }

  // Preview action
  async function handlePreview() {
    if (publishAttemptRef.current || hasPublishedRef.current) return;
    setPreviewError(null);
    const parsed = companionDraftSchema.safeParse(draftRef.current);
    if (!parsed.success) {
      setPreviewError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    const snapshot = { ...parsed.data };
    const requestId = ++previewRequestRef.current;
    reviewedDraftRef.current = null;
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const intro = await previewCompanionDraft(tripId, snapshot);
      if (requestId !== previewRequestRef.current) return;
      reviewedDraftRef.current = snapshot;
      setPreviewData(intro);
      setTab("preview");
    } catch (err: unknown) {
      if (requestId === previewRequestRef.current) {
        const msg = err instanceof Error ? err.message : "Không thể tạo bản xem trước.";
        setPreviewError(msg);
      }
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  }

  // Publish action with strict idempotency and unknown-retry retention
  async function handlePublish() {
    if (isPublishingRef.current || hasPublishedRef.current) return;

    let attempt = publishAttemptRef.current;
    if (!attempt) {
      if (tab !== "preview" || !previewData || !reviewedDraftRef.current) {
        setPreviewError("Hãy xem trước nội dung hiện tại trước khi xác nhận công khai.");
        return;
      }
      attempt = { tripId, draft: { ...reviewedDraftRef.current }, key: crypto.randomUUID() };
      publishAttemptRef.current = attempt;
    }

    isPublishingRef.current = true;
    setPublishState("pending");
    setPublishMessage(null);

    let outcome: Awaited<ReturnType<typeof publishCompanionTrip>>;
    try {
      outcome = await publishCompanionTrip(attempt.tripId, attempt.draft, attempt.key);
    } catch (err: unknown) {
      // Unexpected client failure is not proof that the database write failed.
      setPublishState("unknown");
      setPublishMessage(err instanceof Error ? err.message : "Chưa nhận được xác nhận. Hãy thử lại cùng yêu cầu.");
      return;
    } finally {
      isPublishingRef.current = false;
    }

    if (outcome.status === "SUCCESS") {
      hasPublishedRef.current = true;
      setPublishState("success");
      toast.success("Đã công khai tìm bạn đồng hành thành công!");
      router.push(`/trip-companions/${outcome.data.publicationId}` as Route);
    } else if (outcome.status === "UNKNOWN") {
      setPublishState("unknown");
      setPublishMessage(outcome.error.message);
    } else {
      publishAttemptRef.current = null;
      invalidatePreview();
      setTab("edit");
      setPublishState("failed");
      setPublishMessage(outcome.error.message);
    }
  }

  const transportLabel = context.trip.transport === "CAR" ? "Ô tô" : "Xe máy";
  const isPending = publishState === "pending";
  const isUnknown = publishState === "unknown";
  const isLocked = isPending || isUnknown || publishState === "success";

  return (
    <div className="companion-container">
      {/* ─── Breadcrumbs ─── */}
      <div className="companion-breadcrumbs">
        <Link href="/trips">Chuyến đi của tôi</Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <Link href={`/trips/${tripId}` as Route}>Chi tiết</Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <span>Công khai tìm bạn đồng hành</span>
      </div>

      {/* ─── Page Heading ─── */}
      <div className="companion-header">
        <p className="companion-eyebrow">
          <Users size={14} aria-hidden="true" />
          <span>Tìm bạn đồng hành</span>
        </p>
        <h1 className="companion-title">Công khai chuyến đi</h1>
        <p className="companion-subtitle">
          Chia sẻ thông tin cơ bản về hành trình sắp tới để tìm thêm người đồng hành cùng bạn.
        </p>
      </div>

      {/* ─── Tab Switcher ─── */}
      <div className="companion-tab-bar" role="tablist" aria-label="Chế độ soạn thảo">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "edit"}
          data-active={tab === "edit"}
          className="companion-tab-btn"
          onClick={editDraft}
          disabled={isLocked}
        >
          <Pencil size={15} className="inline mr-1.5" aria-hidden="true" />
          <span>Soạn nội dung</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          data-active={tab === "preview"}
          className="companion-tab-btn"
          onClick={() => { void handlePreview(); }}
          disabled={previewLoading || isLocked}
        >
          {previewLoading ? (
            <LoaderCircle size={15} className="inline mr-1.5 animate-spin" aria-hidden="true" />
          ) : (
            <Eye size={15} className="inline mr-1.5" aria-hidden="true" />
          )}
          <span>Xem trước (Góc nhìn người xem)</span>
        </button>
      </div>

      {/* ─── Feedback / Alert Banners ─── */}
      {publishState === "unknown" && (
        <div className="companion-feedback-alert companion-feedback-warning mb-6" role="alert">
          <AlertCircle size={20} className="shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <div className="flex-1">
            <strong>Chưa nhận được xác nhận từ máy chủ</strong>
            <p className="m-0 mt-1 text-sm">{publishMessage}</p>
            <p className="m-0 mt-1 text-xs opacity-80">
              Nội dung và mã giao dịch được giữ nguyên vẹn. Bấm Thử lại để kiểm tra đối soát an toàn.
            </p>
          </div>
          <button
            type="button"
            className="companion-secondary-button shrink-0"
            onClick={() => { void handlePublish(); }}
            disabled={isPending}
          >
            <RefreshCw size={14} className={isPending ? "animate-spin" : ""} aria-hidden="true" />
            <span>Thử lại kiểm tra</span>
          </button>
        </div>
      )}

      {publishState === "failed" && publishMessage && (
        <div className="companion-feedback-alert companion-feedback-danger mb-6" role="alert">
          <AlertCircle size={20} className="shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div className="flex-1">
            <strong>Không thể công khai chuyến đi</strong>
            <p className="m-0 mt-1 text-sm">{publishMessage}</p>
            <p className="m-0 mt-1 text-xs opacity-80">
              Nội dung bạn đã nhập được giữ nguyên trên form để bạn có thể chỉnh sửa và thử lại.
            </p>
          </div>
        </div>
      )}

      {previewError && (
        <div className="companion-feedback-alert companion-feedback-danger mb-6" role="alert">
          <AlertCircle size={20} className="shrink-0" aria-hidden="true" />
          <div>
            <strong>Lỗi xem trước</strong>
            <p className="m-0 mt-1 text-sm">{previewError}</p>
          </div>
        </div>
      )}

      {/* ─── Tab Content: EDIT ─── */}
      {tab === "edit" && (
        <form
          className="companion-card companion-form-card"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePreview();
          }}
          noValidate
        >
          {/* Read-Only Saved Trip Baseline */}
          <div className="companion-trip-summary-box" aria-label="Thông tin hành trình đã lưu">
            <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-border/50">
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-300">
                Hành trình đã lưu (Chỉ đọc)
              </span>
              <span className="text-xs text-muted-foreground">
                Dữ liệu được trích xuất tự động từ chuyến đi gốc
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span>{context.trip.startDate} – {context.trip.endDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock3 size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span>{context.trip.durationDays} ngày</span>
              </div>
              <div className="flex items-center gap-2">
                <CarFront size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span>Phương tiện: {transportLabel}</span>
              </div>
            </div>

            {context.trip.routeSummary.length > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap pt-1">
                <MapPin size={13} className="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>Tuyến:</span>
                <span className="font-medium text-foreground">
                  {context.trip.routeSummary.map((r) => r.name).join(" → ")}
                </span>
              </div>
            )}
          </div>

          {/* Field: Title */}
          <div className="companion-field-group">
            <label htmlFor={titleId} className="companion-label">
              <span>Tiêu đề bài đăng <span className="text-red-500">*</span></span>
              <span className="companion-char-count">{draft.title.length} / 200</span>
            </label>
            <input
              id={titleId}
              type="text"
              className="companion-input"
              value={draft.title}
              maxLength={200}
              onChange={(e) => updateDraft({ title: e.target.value })}
              placeholder="VD: Cùng khám phá Hà Giang mùa hoa tam giác mạch"
              disabled={isLocked}
              required
            />
            <p className="companion-help-text">
              Tiêu đề ngắn gọn, nêu rõ điểm đến hoặc chủ đề của hành trình.
            </p>
          </div>

          {/* Field: Additional Capacity */}
          <div className="companion-field-group">
            <label htmlFor={capacityId} className="companion-label">
              <span>Số chỗ tìm thêm <span className="text-red-500">*</span></span>
            </label>
            <input
              id={capacityId}
              type="number"
              min={1}
              max={2147483647}
              step={1}
              className="companion-input max-w-[200px]"
              value={draft.additionalCapacity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                updateDraft({ additionalCapacity: Number.isNaN(val) ? 1 : val });
              }}
              disabled={isLocked}
              required
            />
            <p className="companion-help-text">
              Không tính bạn và những người đã đi cùng sẵn có. Mỗi tài khoản tham gia dùng một chỗ.
            </p>
          </div>

          {/* Field: Image selection from eligible options */}
          <div className="companion-field-group">
            <label id={imageFieldId} className="companion-label">
              <span>Ảnh đại diện bài đăng (Tùy chọn)</span>
            </label>
            <p className="companion-help-text">
              Ảnh được chọn từ những điểm đến công khai hợp lệ trong hành trình của bạn.
            </p>

            <div
              className="companion-image-options-grid"
              role="radiogroup"
              aria-labelledby={imageFieldId}
            >
              {/* Option: No image */}
              <div
                role="radio"
                aria-checked={draft.imageMediaId === null}
                aria-disabled={isLocked}
                tabIndex={isLocked ? -1 : 0}
                data-selected={draft.imageMediaId === null}
                className="companion-image-option-card companion-image-none-card"
                onClick={() => updateDraft({ imageMediaId: null })}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    updateDraft({ imageMediaId: null });
                  }
                }}
              >
                <ImageIcon size={22} aria-hidden="true" />
                <span>Không dùng ảnh</span>
              </div>

              {/* Eligible media options */}
              {context.imageOptions.map((opt) => {
                const selected = draft.imageMediaId === opt.mediaId;
                return (
                  <div
                    key={opt.mediaId}
                    role="radio"
                    aria-checked={selected}
                    aria-label={opt.alt}
                    aria-disabled={isLocked}
                    tabIndex={isLocked ? -1 : 0}
                    data-selected={selected}
                    className="companion-image-option-card"
                    onClick={() => updateDraft({ imageMediaId: opt.mediaId })}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        updateDraft({ imageMediaId: opt.mediaId });
                      }
                    }}
                  >
                    <img src={opt.url} alt={opt.alt} className="companion-image-option-thumb" loading="lazy" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Field: Introduction */}
          <div className="companion-field-group">
            <label htmlFor={introId} className="companion-label">
              <span>Lời giới thiệu chuyến đi <span className="text-red-500">*</span></span>
              <span className="companion-char-count">{draft.introduction.length} / 4000</span>
            </label>
            <textarea
              id={introId}
              className="companion-textarea"
              value={draft.introduction}
              maxLength={4000}
              onChange={(e) => updateDraft({ introduction: e.target.value })}
              placeholder="Chia sẻ về kế hoạch, phong cách du lịch của bạn và mong muốn về những người bạn đồng hành..."
              disabled={isLocked}
              required
            />
            <p className="companion-help-text">
              Nội dung văn bản thuần do bạn tự viết. Không đưa thông tin nhạy cảm riêng tư.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="companion-form-actions">
            <Link
              href={`/trips/${tripId}` as Route}
              className="companion-secondary-button mr-auto"
            >
              Hủy
            </Link>

            <button
              type="submit"
              className="companion-cta-button !w-auto"
              disabled={previewLoading || isLocked}
              aria-busy={previewLoading}
            >
              {previewLoading ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
              <span>{previewLoading ? "Đang tạo bản xem trước…" : "Xem trước để công khai"}</span>
            </button>
          </div>
        </form>
      )}

      {/* ─── Tab Content: PREVIEW ─── */}
      {tab === "preview" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/40 p-4 rounded-xl border border-border">
            <div className="text-sm">
              <span className="font-semibold text-foreground">Chế độ xem trước</span>
              <span className="text-muted-foreground ml-2">
                — Kiểm tra thông tin hiển thị trước khi chính thức đăng tải
              </span>
            </div>
            <button
              type="button"
              className="companion-secondary-button"
              onClick={editDraft}
              disabled={isLocked}
            >
              <Pencil size={14} aria-hidden="true" />
              <span>Quay lại chỉnh sửa</span>
            </button>
          </div>

          {previewData ? (
            <CompanionIntroductionView
              introduction={previewData}
              tripId={tripId}
              isHost={true}
              isPreview={true}
            />
          ) : (
            <div className="companion-card text-center py-12">
              <LoaderCircle size={28} className="animate-spin mx-auto text-emerald-700" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">Đang tải bản xem trước…</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              className="companion-secondary-button"
              onClick={editDraft}
              disabled={isLocked}
            >
              Chỉnh sửa thêm
            </button>
            <button
              type="button"
              className="companion-cta-button !w-auto"
              onClick={() => { void handlePublish(); }}
              disabled={isPending || publishState === "success" || (!isUnknown && (!previewData || previewLoading))}
              aria-busy={isPending}
            >
              {isPending ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={16} aria-hidden="true" />
              )}
              <span>{publishState === "success" ? "Đã công khai" : isUnknown ? "Thử lại xác nhận" : "Xác nhận công khai"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
