"use client";

import { useId, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelCompanionTrip,
  updateCompanionManagement,
  type CompanionManageInput,
} from "@/modules/trip-companions/companion-client";
import type { CompanionManage } from "@/modules/trip-companions/companion-management-contract";

function formatDateVi(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
}

export interface CompanionManagementViewProps {
  management: CompanionManage;
}

export function CompanionManagementView(props: CompanionManagementViewProps) {
  return <CompanionManagementForm key={props.management.publicationId} {...props} />;
}

function CompanionManagementForm({ management: initialManagement }: CompanionManagementViewProps) {
  const router = useRouter();
  const [management, setManagement] = useState<CompanionManage>(initialManagement);

  // Form states initialized from current draft
  const [title, setTitle] = useState(management.draft.title);
  const [introduction, setIntroduction] = useState(management.draft.introduction);
  const [additionalCapacity, setAdditionalCapacity] = useState<number>(management.draft.additionalCapacity);
  const [imageMediaId, setImageMediaId] = useState<string | null>(management.draft.imageMediaId);

  // Status controls
  const [recruitmentOpen, setRecruitmentOpen] = useState(management.recruitmentOpen);
  const [visibility, setVisibility] = useState<"PUBLIC" | "WITHDRAWN">(management.visibility);

  // Mutation and error states
  const [mutationStatus, setMutationStatus] = useState<"idle" | "submitting" | "unknown" | "failed" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const saveAttemptRef = useRef<{ publicationId: string; payload: CompanionManageInput; key: string } | null>(null);
  const savingRef = useRef(false);

  const isCanceled = Boolean(management.canceledAt);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelStatus, setCancelStatus] = useState<"idle" | "submitting" | "failed">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelIdempotencyKey, setCancelIdempotencyKey] = useState<string>(() => {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? `cancel-${crypto.randomUUID()}`
      : `cancel-${Date.now()}`;
  });

  const titleId = useId();
  const capacityId = useId();
  const introId = useId();

  const titleLength = title.trim().length;
  const introLength = introduction.trim().length;

  const isDepartedOrCompleted = !management.canReopen;
  const placesRemaining = Math.max(0, additionalCapacity - management.activeMemberCount);

  // Check if anything changed compared to current server state
  const isDirty =
    title !== management.draft.title ||
    introduction !== management.draft.introduction ||
    additionalCapacity !== management.draft.additionalCapacity ||
    imageMediaId !== management.draft.imageMediaId ||
    recruitmentOpen !== management.recruitmentOpen ||
    visibility !== management.visibility;

  const draftLocked = mutationStatus === "submitting" || mutationStatus === "unknown" || isCanceled;
  const changeDraft = (change: () => void) => {
    if (!savingRef.current && !saveAttemptRef.current && !isCanceled) change();
  };

  const handleSave = async (
    overrides?: Partial<{ recruitmentOpen: boolean; visibility: "PUBLIC" | "WITHDRAWN" }>,
  ) => {
    if (savingRef.current || isCanceled) return;
    let attempt = saveAttemptRef.current;
    if (!attempt) {
      const payload: CompanionManageInput = {
        title: title.trim(), introduction: introduction.trim(), additionalCapacity, imageMediaId,
        confirm: true, baseRevision: management.managementRevision,
        visibility: overrides?.visibility ?? visibility,
        recruitmentOpen: overrides?.recruitmentOpen ?? recruitmentOpen,
      };
      const invalid = !payload.title || payload.title.length > 200
        ? "Tiêu đề bài đăng phải từ 1 đến 200 ký tự."
        : !payload.introduction || payload.introduction.length > 4000
          ? "Lời giới thiệu chuyến đi phải từ 1 đến 4000 ký tự."
          : !Number.isInteger(payload.additionalCapacity) || payload.additionalCapacity < Math.max(1, management.activeMemberCount)
            ? "Số chỗ tìm thêm phải là số nguyên dương và không thấp hơn số thành viên đang tham gia."
            : !management.canReopen && (
              (payload.visibility === "PUBLIC" && management.visibility !== "PUBLIC") ||
              (payload.recruitmentOpen && !management.recruitmentOpen))
              ? "Chuyến đi đã đến ngày khởi hành hoặc đã kết thúc, không thể mở tuyển lại hoặc công khai lại."
              : null;
      if (invalid) { setMutationStatus("failed"); setErrorMessage(invalid); return; }
      attempt = { publicationId: management.publicationId, payload,
        key: typeof crypto !== "undefined" && crypto.randomUUID ? 'manage-' + crypto.randomUUID() : 'manage-' + Date.now() + '-' + Math.random() };
      saveAttemptRef.current = attempt;
    }
    savingRef.current = true;
    setMutationStatus("submitting"); setErrorMessage(null); setSuccessMessage(null);
    try {
      const outcome = await updateCompanionManagement(attempt.publicationId, attempt.payload, attempt.key);
      if (outcome.status === "SUCCESS") {
        const saved = attempt.payload;
        setManagement(prev => ({ ...prev, draft: { title: saved.title, introduction: saved.introduction,
          additionalCapacity: saved.additionalCapacity, imageMediaId: saved.imageMediaId },
          visibility: saved.visibility, recruitmentOpen: saved.recruitmentOpen,
          managementRevision: outcome.data.managementRevision }));
        setTitle(saved.title); setIntroduction(saved.introduction); setAdditionalCapacity(saved.additionalCapacity);
        setImageMediaId(saved.imageMediaId); setVisibility(saved.visibility); setRecruitmentOpen(saved.recruitmentOpen);
        saveAttemptRef.current = null;
        setMutationStatus("success"); setSuccessMessage("Cập nhật thông tin bài tuyển thành công.");
        toast.success("Đã lưu thông tin quản lý bài đăng"); router.refresh();
      } else if (outcome.status === "UNKNOWN") {
        setMutationStatus("unknown");
        setErrorMessage("Chưa xác nhận được kết quả. Nội dung đang được giữ nguyên; bấm thử lại để đối soát đúng yêu cầu đã gửi.");
      } else {
        saveAttemptRef.current = null;
        setMutationStatus("failed");
        setErrorMessage(outcome.error.code === "COMPANION_REVISION_CONFLICT"
          ? "Bài đăng đã có thay đổi mới từ một phiên khác. Vui lòng tải lại trang trước khi tiếp tục."
          : outcome.error.message || "Không thể lưu cập nhật quản lý.");
      }
    } catch {
      // A thrown transport failure may follow a committed write; retain the attempt.
      setMutationStatus("unknown");
      setErrorMessage("Chưa xác nhận được kết quả. Bấm thử lại với yêu cầu đang được giữ nguyên.");
    } finally { savingRef.current = false; }
  };

  const handleToggleRecruitment = () => handleSave({ recruitmentOpen: !recruitmentOpen });
  const handleToggleVisibility = () => handleSave({ visibility: visibility === "PUBLIC" ? "WITHDRAWN" : "PUBLIC" });

  const handleConfirmCancel = async () => {
    if (cancelStatus === "submitting") return;
    setCancelStatus("submitting");
    setCancelError(null);

    try {
      const outcome = await cancelCompanionTrip(management.publicationId, cancelIdempotencyKey);
      if (outcome.status === "SUCCESS") {
        setCancelStatus("idle");
        setIsCancelModalOpen(false);
        toast.success("Đã hủy chuyến đồng hành");
        setManagement((prev) => ({
          ...prev,
          canceledAt: new Date().toISOString(),
          recruitmentOpen: false,
          visibility: "WITHDRAWN",
        }));
        setRecruitmentOpen(false);
        setVisibility("WITHDRAWN");
        router.refresh();
      } else if (outcome.status === "UNKNOWN") {
        setCancelStatus("failed");
        setCancelError(
          "Chưa nhận được phản hồi xác nhận từ máy chủ. Vui lòng bấm thử lại mà không thay đổi thao tác.",
        );
      } else {
        setCancelStatus("failed");
        setCancelError(outcome.error?.message || "Không thể hủy chuyến đồng hành.");
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          setCancelIdempotencyKey(`cancel-${crypto.randomUUID()}`);
        }
      }
    } catch (err: unknown) {
      setCancelStatus("failed");
      setCancelError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi hủy chuyến đồng hành.");
    }
  };

  return (
    <div className="companion-container" data-testid="companion-management-view">
      {/* ─── Breadcrumbs ─── */}
      <div className="companion-breadcrumbs">
        <Link href="/">Trang chủ</Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <Link href={"/trip-companions" as Route}>Tìm bạn đồng hành</Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <Link href={`/trip-companions/${management.publicationId}` as Route}>
          {management.draft.title}
        </Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <span>Quản lý tuyển thành viên</span>
      </div>

      {/* ─── Canceled Banner ─── */}
      {isCanceled && management.canceledAt ? (
        <div
          className="companion-read-only-banner bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 mb-6"
          role="alert"
          data-testid="companion-management-canceled-banner"
        >
          <AlertTriangle size={18} className="shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div>
            <strong className="block font-semibold">Chuyến đồng hành này đã bị hủy</strong>
            <p className="text-xs sm:text-sm mt-0.5 m-0 opacity-90">
              Bài đăng đã hủy vào {formatDateVi(management.canceledAt.slice(0, 10))}. Việc tìm thêm thành viên đã chấm dứt vĩnh viễn và không gian nhóm được chuyển sang chế độ lưu trữ chỉ đọc.
            </p>
          </div>
        </div>
      ) : null}

      {/* ─── Top Header Card (Signature Highland Billboard) ─── */}
      <header className="companion-group-hero companion-manage-hero mb-6" aria-labelledby="manage-hero-title">
        <div className="companion-hero-ambient" aria-hidden="true">
          <div className="companion-hero-glow" />
          <svg className="companion-hero-topo" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <path d="M0,160 Q250,80 500,150 T1000,110 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.03)" />
            <path d="M0,200 Q280,120 580,190 T1000,150 L1000,300 L0,300 Z" fill="rgba(233,185,75,0.04)" />
            <path d="M0,230 Q340,170 680,220 T1000,180 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.02)" />
          </svg>
        </div>

        <div className="companion-hero-content">
          <div className="companion-hero-header-row">
            <div className="companion-hero-title-group">
              <div className="companion-hero-badge-row">
                <span className="companion-hero-badge">
                  <span className="companion-badge-dot" aria-hidden="true" />
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>Bảng quản lý của chủ chuyến</span>
                </span>
                <span className="companion-hero-tag">Bảng điều khiển tuyển</span>
              </div>
              <h1 id="manage-hero-title" className="companion-hero-title">
                Quản lý bài tuyển bạn đồng hành
              </h1>
              <p className="companion-hero-subtitle text-emerald-100/80 text-sm max-w-2xl m-0">
                Chỉnh sửa thông tin tuyển, số chỗ tìm thêm, và điều khiển trạng thái hiển thị của bài đăng.
              </p>
            </div>

            <div className="companion-group-actions">
              <Link
                href={`/trip-companions/${management.publicationId}` as Route}
                className="companion-hero-action companion-hero-action-outline"
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span>Xem trang giới thiệu</span>
              </Link>

              <Link
                href={`/trip-companions/${management.publicationId}/group` as Route}
                className="companion-hero-action companion-hero-action-primary"
              >
                <Users size={15} aria-hidden="true" />
                <span>Vào không gian nhóm</span>
              </Link>
            </div>
          </div>

          {/* Notice distinguishing companion publication from original trip edit */}
          <div className="companion-action-notice companion-hero-notice mt-1" role="note">
            <Info size={16} className="text-emerald-300 shrink-0" aria-hidden="true" />
            <p className="m-0 text-xs sm:text-sm text-emerald-50">
              <strong>Lưu ý:</strong> Màn hình này quản lý bài đăng tìm bạn đồng hành. Các thông tin về ngày khởi hành (
              {management.trip.startDate} – {management.trip.endDate}), phương tiện, điểm đến và lịch trình chi tiết được
              quản lý trực tiếp tại{" "}
              <Link
                href={`/trips/${management.tripId}/edit` as Route}
                className="underline font-semibold text-emerald-200 hover:text-white transition-colors"
              >
                Chỉnh sửa lịch trình gốc của chuyến đi
              </Link>
              .
            </p>
          </div>
        </div>
      </header>

      {/* ─── Status & Quick Action Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Card 1: Visibility Status */}
        <div className="companion-card companion-manage-stat-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Eye size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>Trạng thái bài đăng</span>
              </span>
              {visibility === "PUBLIC" ? (
                <span className="companion-manage-status-pill is-active">
                  <span className="companion-badge-dot" aria-hidden="true" />
                  <span>Công khai</span>
                </span>
              ) : (
                <span className="companion-manage-status-pill is-danger">
                  <EyeOff size={11} aria-hidden="true" />
                  <span>Đã gỡ bài</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4 leading-relaxed">
              {visibility === "PUBLIC"
                ? "Bài đăng đang hiển thị trên trang khám phá công khai."
                : "Bài đăng bị ẩn khỏi tìm kiếm công khai. Các thành viên hiện tại vẫn giữ quyền xem nhóm."}
            </p>
          </div>
          <div>
            <button
              type="button"
              className={visibility === "PUBLIC" ? "companion-secondary-button w-full justify-center" : "companion-primary-button w-full justify-center"}
              onClick={handleToggleVisibility}
              disabled={draftLocked || (visibility === "WITHDRAWN" && !management.canReopen)}
              data-testid="toggle-visibility-btn"
            >
              {visibility === "PUBLIC" ? (
                <>
                  <EyeOff size={14} aria-hidden="true" />
                  <span>Gỡ bài đăng</span>
                </>
              ) : (
                <>
                  <Eye size={14} aria-hidden="true" />
                  <span>Công khai lại bài</span>
                </>
              )}
            </button>
            {visibility === "WITHDRAWN" && !management.canReopen ? (
              <p className="text-xs text-red-500 mt-2 font-medium">
                Chuyến đi đã đến ngày hoặc kết thúc, không thể công khai lại.
              </p>
            ) : null}
          </div>
        </div>

        {/* Card 2: Recruitment Status */}
        <div className="companion-card companion-manage-stat-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>Tiếp nhận thành viên</span>
              </span>
              {recruitmentOpen ? (
                <span className="companion-manage-status-pill is-active">
                  <span className="companion-badge-dot" aria-hidden="true" />
                  <span>Đang mở tuyển</span>
                </span>
              ) : (
                <span className="companion-manage-status-pill is-muted">
                  <UserX size={11} aria-hidden="true" />
                  <span>Đã đóng tuyển</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4 leading-relaxed">
              {recruitmentOpen
                ? "Người dùng khác có thể tiếp tục tham gia nếu chuyến đi còn chỗ."
                : "Tạm dừng nhận thêm thành viên mới. Nhóm và lịch trình vẫn duy trì hoạt động."}
            </p>
          </div>
          <div>
            <button
              type="button"
              className={recruitmentOpen ? "companion-secondary-button w-full justify-center" : "companion-primary-button w-full justify-center"}
              onClick={handleToggleRecruitment}
              disabled={draftLocked || (!recruitmentOpen && !management.canReopen)}
              data-testid="toggle-recruitment-btn"
            >
              {recruitmentOpen ? (
                <>
                  <UserX size={14} aria-hidden="true" />
                  <span>Đóng nhận người</span>
                </>
              ) : (
                <>
                  <UserCheck size={14} aria-hidden="true" />
                  <span>Mở nhận người lại</span>
                </>
              )}
            </button>
            {!recruitmentOpen && !management.canReopen ? (
              <p className="text-xs text-red-500 mt-2 font-medium">
                Chuyến đi đã đến ngày hoặc kết thúc, không thể mở tuyển lại.
              </p>
            ) : null}
          </div>
        </div>

        {/* Card 3: Membership & Capacity Overview */}
        <div className="companion-card companion-manage-stat-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>Sức chứa &amp; Thành viên</span>
              </span>
              <span className="companion-manage-status-pill is-active font-bold">
                {placesRemaining} chỗ còn trống
              </span>
            </div>
            <div className="space-y-2 text-xs sm:text-sm text-muted-foreground mb-4">
              <div className="flex justify-between items-center py-1 border-b border-border/40">
                <span>Đã tham gia (không tính chủ chuyến):</span>
                <strong className="text-foreground font-semibold">{management.activeMemberCount} người</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40">
                <span>Tổng số chỗ tìm thêm:</span>
                <strong className="text-foreground font-semibold">{additionalCapacity} chỗ</strong>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>Phiên bản quản lý:</span>
                <span className="text-foreground font-mono font-semibold bg-muted px-2 py-0.5 rounded text-xs">rev #{management.managementRevision}</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/60 p-2.5 rounded-lg border border-border/50">
            Chủ chuyến không chiếm chỗ trong số chỗ tìm thêm.
          </div>
        </div>
      </div>

      {/* ─── Edit Form Card ─── */}
      <section className="companion-card companion-manage-form-card p-6 md:p-8" aria-labelledby="manage-form-heading">
        <h2 id="manage-form-heading" className="companion-section-title mb-6 flex items-center gap-2">
          <Edit3 size={18} aria-hidden="true" />
          <span>Chỉnh sửa nội dung bài đăng</span>
        </h2>

        {errorMessage && (
          <div className="companion-error-notice mb-6" role="alert" data-testid="manage-error-banner">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="companion-action-notice mb-6 border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-6"
        >
          {/* Field 1: Title */}
          <div className="companion-form-group">
            <div className="flex justify-between items-center mb-1">
              <label htmlFor={titleId} className="companion-label">
                Tiêu đề bài đăng <span className="text-red-500">*</span>
              </label>
              <span className={`companion-counter text-xs ${titleLength > 200 ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                {titleLength}/200
              </span>
            </div>
            <input
              id={titleId}
              type="text"
              value={title}
              onChange={(e) => changeDraft(() => setTitle(e.target.value))}
              className="companion-input w-full"
              maxLength={200}
              required
              disabled={draftLocked}
              data-testid="manage-title-input"
            />
          </div>

          {/* Field 2: Capacity */}
          <div className="companion-form-group">
            <label htmlFor={capacityId} className="companion-label mb-1 block">
              Số chỗ tìm thêm <span className="text-red-500">*</span>
            </label>
            <input
              id={capacityId}
              type="number"
              min={management.activeMemberCount > 0 ? management.activeMemberCount : 1}
              value={additionalCapacity}
              onChange={(e) => changeDraft(() => setAdditionalCapacity(parseInt(e.target.value, 10) || 0))}
              className="companion-input w-full max-w-[200px]"
              required
              disabled={draftLocked}
              data-testid="manage-capacity-input"
            />
            <p className="companion-helper-text text-xs text-muted-foreground mt-1">
              Không tính bạn và người đi cùng sẵn có. Tối thiểu là {management.activeMemberCount} chỗ (bằng số lượng thành viên đã tham gia).
            </p>
          </div>

          {/* Field 3: Introduction */}
          <div className="companion-form-group">
            <div className="flex justify-between items-center mb-1">
              <label htmlFor={introId} className="companion-label">
                Lời giới thiệu chuyến đi <span className="text-red-500">*</span>
              </label>
              <span className={`companion-counter text-xs ${introLength > 4000 ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                {introLength}/4000
              </span>
            </div>
            <textarea
              id={introId}
              value={introduction}
              onChange={(e) => changeDraft(() => setIntroduction(e.target.value))}
              rows={6}
              className="companion-textarea w-full"
              maxLength={4000}
              required
              disabled={draftLocked}
              data-testid="manage-intro-textarea"
            />
          </div>

          {/* Field 4: Image Option Grid */}
          <div className="companion-form-group">
            <label className="companion-label mb-2 block">
              Ảnh đại diện bài đăng
            </label>
            <div className="companion-image-grid grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                className={`companion-image-option p-4 border rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  imageMediaId === null
                    ? "border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-600"
                    : "border-border hover:bg-muted/30"
                }`}
                onClick={() => changeDraft(() => setImageMediaId(null))}
                disabled={draftLocked}
              >
                <ImageIcon size={24} className="text-muted-foreground mb-2" aria-hidden="true" />
                <span className="text-xs font-medium">Không dùng ảnh</span>
              </button>

              {management.imageOptions.map((opt) => (
                <button
                  key={opt.mediaId}
                  type="button"
                  className={`companion-image-option relative overflow-hidden rounded-xl border p-0 cursor-pointer transition-all aspect-video ${
                    imageMediaId === opt.mediaId
                      ? "border-emerald-700 ring-2 ring-emerald-600"
                      : "border-border hover:opacity-90"
                  }`}
                  onClick={() => changeDraft(() => setImageMediaId(opt.mediaId))}
                  disabled={draftLocked}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={opt.url} alt={opt.alt} className="w-full h-full object-cover" />
                  {imageMediaId === opt.mediaId && (
                    <div className="absolute top-1 right-1 bg-emerald-700 text-white rounded-full p-0.5">
                      <CheckCircle2 size={14} aria-hidden="true" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Save Action Bar */}
          <div className="companion-modal-actions pt-6 border-t border-border flex justify-between items-center">
            <Link
              href={`/trip-companions/${management.publicationId}` as Route}
              className="companion-secondary-button"
            >
              Hủy bỏ
            </Link>

            <button
              type="submit"
              className="companion-primary-button companion-manage-submit-btn"
              disabled={mutationStatus === "submitting" || (!isDirty && mutationStatus !== "unknown") || isCanceled}
              data-testid="manage-save-btn"
            >
              {mutationStatus === "submitting" ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Đang lưu...</span>
                </>
              ) : mutationStatus === "unknown" ? (
                <>
                  <RefreshCw size={16} aria-hidden="true" />
                  <span>Thử lại lưu thay đổi</span>
                </>
              ) : (
                <>
                  <Save size={16} aria-hidden="true" />
                  <span>Lưu thay đổi bài đăng</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* ─── Danger Zone: Terminal Cancellation ─── */}
      {!isCanceled && (
        <section
          className="companion-danger-zone mt-8"
          aria-labelledby="danger-zone-heading"
          data-testid="companion-danger-zone"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 id="danger-zone-heading" className="text-base font-bold text-red-700 dark:text-red-400 flex items-center gap-2 m-0">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>Hủy chuyến đồng hành</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl m-0">
                Hủy chuyến đồng hành sẽ đóng việc tuyển thành viên, chuyển toàn bộ trò chuyện nhóm và lịch trình sang chế độ chỉ đọc. Hành động này là vĩnh viễn và không thể hoàn tác.
              </p>
            </div>
            <button
              type="button"
              className="companion-danger-button shrink-0"
              onClick={() => {
                setCancelError(null);
                setIsCancelModalOpen(true);
              }}
              disabled={draftLocked || cancelStatus === "submitting"}
              data-testid="companion-open-cancel-modal-btn"
            >
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Hủy chuyến đồng hành</span>
            </button>
          </div>
        </section>
      )}

      {/* ─── Cancellation Confirmation Modal ─── */}
      {isCancelModalOpen && (
        <div className="companion-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title">
          <div className="companion-modal-content max-w-md">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-3">
              <AlertTriangle size={24} aria-hidden="true" />
              <h3 id="cancel-modal-title" className="text-lg font-bold text-foreground m-0">
                Xác nhận hủy chuyến đồng hành?
              </h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Bạn sắp hủy chuyến đồng hành <strong>{management.draft.title}</strong>. Vui lòng lưu ý các điều sau:
            </p>

            <ul className="text-xs text-muted-foreground space-y-2 mb-6 list-disc pl-5">
              <li>Bài đăng sẽ ngay lập tức bị gỡ khỏi danh sách tìm kiếm công khai.</li>
              <li>Không thể nhận thêm thành viên mới tham gia chuyến đi.</li>
              <li>Nhóm trò chuyện sẽ chuyển sang <strong>chế độ chỉ đọc</strong>; mọi thành viên (kể cả chủ chuyến) không thể gửi thêm tin nhắn mới.</li>
              <li>Lịch sử trò chuyện và lịch trình đã lưu vẫn được giữ lại để các thành viên xem lại.</li>
              <li><strong>Hành động này không thể hoàn tác</strong> và không thể chuyển trạng thái sang chuyến đi khác.</li>
            </ul>

            {cancelError && (
              <div className="companion-error-notice mb-4" role="alert" data-testid="companion-cancel-error-banner">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="companion-modal-actions flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                className="companion-secondary-button"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={cancelStatus === "submitting"}
                data-testid="companion-close-cancel-modal-btn"
              >
                Quay lại
              </button>

              <button
                type="button"
                className="companion-danger-button"
                onClick={handleConfirmCancel}
                disabled={cancelStatus === "submitting"}
                data-testid="companion-confirm-cancel-btn"
              >
                {cancelStatus === "submitting" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    <span>Đang hủy chuyến...</span>
                  </>
                ) : cancelStatus === "failed" && cancelError?.includes("thử lại") ? (
                  <>
                    <RefreshCw size={16} aria-hidden="true" />
                    <span>Thử lại xác nhận hủy</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>Xác nhận hủy chuyến</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
