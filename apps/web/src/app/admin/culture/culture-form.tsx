"use client";
import AdminContentPreview from "@/components/admin/admin-content-preview";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import "./culture.css";
import "@/components/admin/admin-form-shell.css";
import ContentProfileEditor from "@/components/admin/content-profile-editor";

import {
  cultureProfileSchema,
  type CultureProfile,
} from "@/modules/content-profile/content-profile-contract";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  Eye,
  Link2,
  MapPin,
  ShieldCheck,
  Save,
  Plus,
  LoaderCircle,
  AlertTriangle,
  Images,
  Users,
  FilePenLine,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import {
  cultureInputSchema,
  sourceUrlSchema,
  type CultureDto,
  type CultureInput,
} from "@/modules/culture/culture-contract";
import {
  loadCulture,
  loadCultureList,
  saveCulture,
  CultureReadError,
} from "@/lib/culture-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import {
  claimSubmission,
  releaseSubmission,
} from "@/lib/auth-submission-guard";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { markCultureSaved } from "@/lib/culture-save-notice";
import {
  AdminValidationSummary,
  AdminFormProgress,
  focusFormError,
  AdminSectionHead,
  AdminField,
  AdminLabel,
  AdminHelper,
  AdminVisibilityBadge,
  AdminSectionNav,
  AdminPageHeader,
  AdminStickyActions,
  AdminLoadingState,
  AdminAlert,
  useSectionNav,
  type NavSection,
} from "@/components/admin/admin-form-shell";
import RichTextEditor, {
  RteStructureGuide,
} from "@/components/admin/rich-text-editor";
import { CultureCategorySelect } from "@/components/admin/culture-category-select";
import DestinationPicker from "./destination-picker";
import { useCultureVisibility } from "./culture-visibility-action";

/* ── Nav sections ─────────────────────────────────────────────────────────── */
const SECTION_DEFS: NavSection[] = [
  { id: "cf-basic", label: "Thông tin cơ bản", icon: BookOpen },
  { id: "cf-geo", label: "Phạm vi địa lý", icon: MapPin },
  { id: "cf-community", label: "Cộng đồng liên quan", icon: Users },
  { id: "cf-content", label: "Nội dung biên soạn", icon: FilePenLine },
  { id: "cf-media", label: "Hình ảnh", icon: Images },
  { id: "cf-destinations", label: "Điểm đến liên quan", icon: MapPin },
  { id: "cf-sources", label: "Nguồn & quyền", icon: ShieldCheck },
  { id: "cf-visibility", label: "Xuất bản", icon: Eye },
];

/* ── State helpers ────────────────────────────────────────────────────────── */
const blank = () => ({
  title: "",
  content: "",
  sourceTitle: "",
  sourceUrl: "",
});
type Fields = ReturnType<typeof blank>;
type Field = keyof Fields;
type Selected = CultureDto["destinations"];

const serializeDraft = (
  fields: Fields,
  selected: Selected,
  profile: CultureProfile,
) =>
  JSON.stringify({
    fields,
    profile,
    destinationIds: selected.map((d) => d.id).sort(),
  });

/* ── Component ────────────────────────────────────────────────────────────── */
export default function CultureForm({ id }: { id: string | null }) {
  const router = useRouter();
  const [profilePending, setProfilePending] = useState(false);
  const [profile, setProfile] = useState<CultureProfile>(() =>
    cultureProfileSchema.parse({}),
  );
  const [fields, setFields] = useState<Fields>(blank);
  const [selected, setSelected] = useState<Selected>([]);
  const [visibility, setVisibility] =
    useState<CultureDto["visibility"]>("HIDDEN");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);

  const lock = useRef(false);
  const savingRef = useRef(false);
  const initialDraft = useRef<string | null>(
    id ? null : serializeDraft(blank(), [], cultureProfileSchema.parse({})),
  );
  const attempt = useRef<{ key: string; input: CultureInput } | null>(null);

  const visibilityAction = useCultureVisibility(
    (dto) => setVisibility(dto.visibility),
    lock,
  );
  const dirty =
    initialDraft.current !== null &&
    serializeDraft(fields, selected, profile) !== initialDraft.current;

  /* ── Section nav ─────────────────────────────────────────────────────────── */
  const sectionIds = SECTION_DEFS.map((s) => s.id);
  const { activeId, scrollTo } = useSectionNav(sectionIds);

  const sections: NavSection[] = SECTION_DEFS.map((sec) => {
    const hasError = Object.keys(errors).some((k) => {
      if (sec.id === "cf-basic")
        return (
          k === "title" ||
          k === "profile.category" ||
          k === "profile.shortDescription"
        );
      if (sec.id === "cf-geo")
        return (
          k.startsWith("profile.areaIds") || k === "profile.geographicScope"
        );
      if (sec.id === "cf-community")
        return k.startsWith("profile.communityIds");
      if (sec.id === "cf-destinations") return k.startsWith("destinationIds");
      if (sec.id === "cf-content") return k === "content";
      if (sec.id === "cf-sources")
        return k === "sourceUrl" || k.startsWith("profile.sources");
      if (sec.id === "cf-media") return k.startsWith("profile.media");
      return false;
    });
    const done =
      sec.id === "cf-basic"
        ? cultureInputSchema.shape.title.safeParse(fields.title).success &&
          !errors["profile.category"] &&
          !errors["profile.shortDescription"]
        : sec.id === "cf-content"
          ? cultureInputSchema.shape.content.safeParse(fields.content).success
          : false;
    return {
      ...sec,
      status: hasError ? "error" : done ? "done" : undefined,
      statusLabel:
        !hasError && !done && ["cf-basic", "cf-content"].includes(sec.id)
          ? "Cần nhập"
          : undefined,
    } as NavSection;
  });

  /* ── Load ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    void loadCulture(id)
      .then((dto) => {
        if (!active) return;
        const f: Fields = {
          title: dto.title,
          content: dto.content,
          sourceTitle: dto.sourceTitle ?? "",
          sourceUrl: dto.sourceUrl ?? "",
        };
        const p = dto.profile ?? cultureProfileSchema.parse({});
        initialDraft.current = serializeDraft(f, dto.destinations, p);
        setFields(f);
        setProfile(p);
        setSelected(dto.destinations);
        setVisibility(dto.visibility);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof CultureReadError
            ? (authorizationFeedback(err.status) ?? err.message)
            : "Không thể tải nội dung văn hóa.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const markSafeToLeave = useUnsavedChanges(
    dirty,
    saving || unknown || profilePending || visibilityAction.busy,
  );

  /* ── Field change helpers ────────────────────────────────────────────────── */
  function changeField(key: Field, value: string) {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });
    setErrors((cur) => {
      const next = { ...cur };
      if (key === "sourceUrl") {
        const parsed = sourceUrlSchema.safeParse(value);
        if (parsed.success) delete next.sourceUrl;
        else
          next.sourceUrl =
            parsed.error.issues[0]?.message ?? "URL http/https hợp lệ.";
      } else delete next[key];
      return next;
    });
  }

  function changeProfile(p: CultureProfile) {
    setProfile(p);
    const parsed = cultureProfileSchema.safeParse(p);
    const paths = parsed.success
      ? []
      : parsed.error.issues.map((issue) => "profile." + issue.path.join("."));
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([path]) => !path.startsWith("profile.") || paths.includes(path),
        ),
      ),
    );
  }

  function changeSelected(next: Selected) {
    setSelected(next);
  }

  /* ── Submit ──────────────────────────────────────────────────────────────── */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      profilePending ||
      savingRef.current ||
      visibilityAction.busy ||
      !claimSubmission(lock)
    )
      return;
    let completed = false;
    try {
      let input: CultureInput;
      if (unknown && attempt.current) {
        input = attempt.current.input;
      } else {
        const parsed = cultureInputSchema.safeParse({
          ...fields,
          profile,
          destinationIds: selected.map((d) => d.id),
        });
        if (!parsed.success) {
          const next: Record<string, string> = {};
          parsed.error.issues.forEach((issue) => {
            next[issue.path.join(".")] =
              issue.code === "invalid_type"
                ? "Nhập giá trị hợp lệ."
                : issue.message;
          });
          setErrors(next);
          toast.error("Kiểm tra các trường không hợp lệ.", {
            position: "bottom-right",
          });
          requestAnimationFrame(() =>
            focusFormError(
              parsed.error.issues[0]?.path.join(".") ?? "title",
              "cf",
            ),
          );
          return;
        }
        input = parsed.data;
        if (
          !attempt.current ||
          JSON.stringify(attempt.current.input) !== JSON.stringify(input)
        ) {
          attempt.current = { key: createIdempotencyKey(), input };
        }
      }
      savingRef.current = true;
      setSaving(true);
      setErrors({});
      if (unknown) {
        if (id) await loadCulture(id);
        else await loadCultureList();
      }
      const result = await saveCulture(id, input, attempt.current!.key);
      if (result.status === "SUCCESS") {
        completed = true;
        markSafeToLeave();
        initialDraft.current = serializeDraft(fields, selected, profile);
        savingRef.current = false;
        markCultureSaved(id === null);
        router.push("/admin/culture");
        return;
      }
      if (result.status === "UNKNOWN") {
        setUnknown(true);
        toast.warning(
          "Chưa xác định kết quả lưu. Nội dung và key giữ nguyên.",
          { position: "bottom-right" },
        );
      } else {
        setUnknown(false);
        attempt.current = null;
        toast.error(
          authorizationFeedback(result.httpStatus) ?? "Không thể lưu.",
          { position: "bottom-right" },
        );
      }
    } catch {
      toast.error("Lỗi mạng. Nội dung và key vẫn được giữ nguyên.", {
        position: "bottom-right",
      });
    } finally {
      if (!completed) {
        savingRef.current = false;
        releaseSubmission(lock);
        setSaving(false);
      }
    }
  }

  const disabled = saving || unknown || visibilityAction.busy;
  const isEdit = Boolean(id);

  /* ── Action message ──────────────────────────────────────────────────────── */
  const actionMessage = saving
    ? isEdit
      ? "Đang lưu thay đổi…"
      : "Đang tạo nội dung văn hóa…"
    : unknown
      ? "Chưa xác định kết quả. Thử lại sẽ dùng cùng key."
      : dirty
        ? "Có thay đổi chưa được lưu."
        : isEdit
          ? "Chưa có thay đổi."
          : "Nội dung mới sẽ được tạo ở trạng thái ẩn.";

  /* ── Render: loading / error ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="af-root" style={{ padding: 48 }}>
        <AdminLoadingState>Đang tải biểu mẫu…</AdminLoadingState>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="af-root" style={{ padding: 48 }}>
        <div
          className="af-section"
          style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}
          role="alert"
        >
          <AlertTriangle
            size={32}
            style={{ color: "var(--af-error)", marginBottom: 12 }}
          />
          <p style={{ marginBottom: 16, color: "var(--af-muted)" }}>
            {loadError}
          </p>
          <button
            className="af-btn"
            type="button"
            onClick={() => setReload((v) => v + 1)}
          >
            Thử tải lại
          </button>
        </div>
      </div>
    );
  }

  /* ── Main render ──────────────────────────────────────────────────────────── */
  return (
    <div className="af-root af-page">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <AdminPageHeader
        breadcrumb={
          <>
            <Link href="/admin/culture">Nội dung văn hóa</Link>
            <span className="af-breadcrumb-sep" aria-hidden="true">
              <ChevronRight size={12} />
            </span>
            <span>{isEdit ? "Chỉnh sửa" : "Tạo mới"}</span>
          </>
        }
        title={
          isEdit ? "Chỉnh sửa nội dung văn hóa" : "Tạo nội dung văn hóa mới"
        }
        subtitle={
          isEdit
            ? "Cập nhật thông tin, nội dung biên soạn và quyền sử dụng."
            : "Nhập thông tin hồ sơ văn hóa mới. Dữ liệu có thể chỉnh sửa sau khi tạo."
        }
        meta={<AdminVisibilityBadge visibility={visibility} />}
      />

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <AdminFormProgress
        complete={
          Number(
            fields.title.trim().length > 0 && fields.title.trim().length <= 200,
          ) +
          Number(
            cultureInputSchema.shape.content.safeParse(fields.content).success,
          )
        }
        total={2}
      />
      <AdminSectionNav
        sections={sections}
        activeId={activeId}
        onNavigate={scrollTo}
      />

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="af-main">
        <Link
          className="af-btn"
          style={{ marginBottom: 18, display: "inline-flex", gap: 6 }}
          href="/admin/culture"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Quay lại danh sách
        </Link>

        {/* Alerts */}
        {unknown && (
          <AdminAlert
            variant="warning"
            icon={<AlertTriangle size={18} aria-hidden="true" />}
          >
            <strong>Chưa xác định kết quả lưu.</strong> Thử lại sẽ đọc lại dữ
            liệu rồi gửi cùng nội dung và key.
          </AdminAlert>
        )}
        {visibilityAction.feedback}

        <form method="post" noValidate onSubmit={(e) => void submit(e)}>
          <AdminValidationSummary errors={errors} prefix="cf" />
          <fieldset
            disabled={disabled}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {/* ── 1. Thông tin cơ bản ──────────────────────────────────── */}
            <section id="cf-basic" className="af-section">
              <AdminSectionHead
                icon={BookOpen}
                title="Thông tin cơ bản"
                description="Tiêu đề, mô tả ngắn và danh mục của hồ sơ văn hóa."
                badge="required"
              />

              <AdminField error={errors.title} errorId="err-title">
                <AdminLabel htmlFor="cf-title" required>
                  Tiêu đề nội dung văn hóa
                </AdminLabel>
                <input
                  id="cf-title"
                  className="af-input"
                  value={fields.title}
                  maxLength={200}
                  placeholder="Ví dụ: Chợ phiên Đồng Văn, Lễ Gầu Tào của người Mông, Kèn Môi…"
                  aria-required="true"
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? "err-title" : undefined}
                  onChange={(e) => changeField("title", e.target.value)}
                />
                <AdminHelper>
                  Tên chính thức hoặc phổ biến nhất. Tối đa 200 ký tự.
                </AdminHelper>
              </AdminField>

              {/* shortDescription & category from profile */}
              <AdminField>
                <AdminLabel htmlFor="cf-shortDescription" optional>
                  Mô tả ngắn
                </AdminLabel>
                <textarea
                  id="cf-shortDescription"
                  className="af-textarea"
                  style={{ minHeight: 80, resize: "vertical" }}
                  value={profile.shortDescription ?? ""}
                  maxLength={1000}
                  placeholder="2–3 câu giới thiệu ngắn gọn, nêu điểm đặc trưng nổi bật nhất."
                  onChange={(e) =>
                    changeProfile({
                      ...profile,
                      shortDescription: e.target.value || null,
                    })
                  }
                />
                <AdminHelper>
                  Hiển thị trên danh sách và kết quả tìm kiếm. Tối đa 1.000 ký
                  tự.
                </AdminHelper>
              </AdminField>

              <AdminField>
                <AdminLabel
                  htmlFor="cf-category"
                  optional
                  tooltip="Chọn loại hình văn hóa phù hợp nhất. Giúp lọc và phân loại nội dung."
                >
                  Danh mục văn hóa
                </AdminLabel>
                <CultureCategorySelect
                  id="cf-category"
                  value={profile.category}
                  onChange={(v: string | null) =>
                    changeProfile({ ...profile, category: v })
                  }
                  disabled={disabled}
                  error={errors["profile.category"]}
                />
                <AdminHelper>
                  Chọn loại hình phù hợp nhất. Để trống nếu không rõ phân loại.
                </AdminHelper>
              </AdminField>
            </section>

            {/* ── 3–7. Profile sections: ContentProfileEditor renders its own cards */}
            {/* Anchor divs let sidebar nav scroll to geo/media/sources sections */}
            <ContentProfileEditor
              profile={profile}
              onChange={(p) => changeProfile(p as CultureProfile)}
              errors={errors}
              onPendingChange={setProfilePending}
              hideBasic
              sectionPrefix="cf"
              content={
                <>
                  {/* ── 2. Nội dung biên soạn ────────────────────────────────── */}
                  <section id="cf-content" className="af-section">
                    <AdminSectionHead
                      icon={FilePenLine}
                      title="Nội dung biên soạn"
                      description="Toàn văn hồ sơ văn hóa. Được hiển thị khi nội dung được xuất bản. Sử dụng cho AI cần quy trình và quyền duyệt riêng."
                      badge="required"
                    />
                    <AdminField error={errors.content} errorId="err-content">
                      <AdminLabel htmlFor="cf-content-editor" required>
                        Nội dung
                      </AdminLabel>
                      <RichTextEditor
                        id="cf-content-editor"
                        value={fields.content}
                        onChange={(md: string) => changeField("content", md)}
                        placeholder="Nhập nội dung hồ sơ văn hóa. Dùng toolbar để định dạng H2/H3, in đậm, danh sách, trích dẫn…"
                        maxLength={20000}
                        hasError={Boolean(errors.content)}
                        disabled={disabled}
                      />
                      <RteStructureGuide />
                      <AdminHelper>
                        Tối đa 20.000 ký tự. Không sao chép nội dung này sang ô
                        khác.
                      </AdminHelper>
                    </AdminField>
                  </section>
                </>
              }
              relatedDestinations={
                <section
                  id="cf-destinations"
                  className="destination-card"
                  style={{ scrollMarginTop: 90 }}
                >
                  <div className="destination-section-heading">
                    <span
                      className="destination-section-icon"
                      aria-hidden="true"
                    >
                      <MapPin size={21} />
                    </span>
                    <div>
                      <h2>Điểm đến liên quan</h2>
                      <p>
                        Không bắt buộc. Chọn điểm đến phù hợp với nội dung văn
                        hóa này. Văn hóa vùng có thể không gắn với điểm đến cụ
                        thể.
                      </p>
                    </div>
                  </div>
                  <DestinationPicker
                    selected={selected}
                    onChange={changeSelected}
                  />
                  {errors.destinationIds && (
                    <p className="destination-error" role="alert">
                      {errors.destinationIds}
                    </p>
                  )}
                  <p className="destination-helper">Tối đa 100 điểm đến.</p>
                </section>
              }
            />

            {/* Legacy source fields (edit mode + only if data exists) */}
            {isEdit && (fields.sourceTitle || fields.sourceUrl) && (
              <section className="destination-card">
                <div className="destination-section-heading">
                  <span className="destination-section-icon" aria-hidden="true">
                    <Link2 size={21} />
                  </span>
                  <div>
                    <h2>Nguồn kế thừa (bản ghi cũ)</h2>
                    <p>
                      Giữ thông tin nguồn từ phiên bản trước. Nguồn mới nên thêm
                      vào mục Nguồn và quyền bên dưới.
                    </p>
                  </div>
                </div>
                <div className="destination-grid">
                  <div className="destination-field">
                    <label htmlFor="cf-sourceTitle">
                      Tên nguồn{" "}
                      <span
                        style={{
                          fontWeight: 400,
                          fontSize: 11,
                          color: "var(--destination-muted)",
                        }}
                      >
                        (tùy chọn)
                      </span>
                    </label>
                    <input
                      id="cf-sourceTitle"
                      value={fields.sourceTitle}
                      maxLength={300}
                      placeholder="Ví dụ: Cổng thông tin du lịch Hà Giang"
                      onChange={(e) =>
                        changeField("sourceTitle", e.target.value)
                      }
                    />
                    {errors.sourceTitle && (
                      <p className="destination-error" role="alert">
                        {errors.sourceTitle}
                      </p>
                    )}
                  </div>
                  <div className="destination-field">
                    <label htmlFor="cf-sourceUrl">
                      Liên kết nguồn{" "}
                      <span
                        style={{
                          fontWeight: 400,
                          fontSize: 11,
                          color: "var(--destination-muted)",
                        }}
                      >
                        (tùy chọn)
                      </span>
                    </label>
                    <input
                      id="cf-sourceUrl"
                      value={fields.sourceUrl}
                      maxLength={2000}
                      placeholder="https://..."
                      aria-invalid={Boolean(errors.sourceUrl)}
                      aria-describedby={
                        errors.sourceUrl ? "err-sourceUrl" : undefined
                      }
                      onChange={(e) => changeField("sourceUrl", e.target.value)}
                    />
                    {errors.sourceUrl && (
                      <p
                        id="err-sourceUrl"
                        className="destination-error"
                        role="alert"
                      >
                        {errors.sourceUrl}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── 8. Xuất bản ──────────────────────────────────────────── */}
            <section id="cf-visibility" className="af-section">
              <AdminSectionHead
                icon={Eye}
                title={
                  isEdit ? "Trạng thái hiển thị" : "Trạng thái sau khi tạo"
                }
                description={
                  isEdit
                    ? "Ẩn/hiển thị là thao tác riêng biệt với nút Lưu. Không ảnh hưởng đến nội dung đã nhập."
                    : "Nội dung mới tạo sẽ ở trạng thái ẩn. Kiểm tra nội dung trước khi công khai."
                }
              />
              <button
                type="button"
                className="af-btn"
                onClick={() => setPreview((v) => !v)}
              >
                {preview ? "Đóng xem trước" : "Xem trước hồ sơ"}
              </button>
              {preview && (
                <AdminContentPreview
                  title={fields.title}
                  content={fields.content}
                  profile={profile}
                  destinations={selected}
                />
              )}
              <div className="af-visibility-row">
                <div className="af-visibility-info">
                  {isEdit ? (
                    <>
                      <strong>Trạng thái hiện tại</strong>
                      <p>
                        Nhấn nút bên phải để đổi trạng thái. Thao tác này độc
                        lập với nút lưu bên dưới.
                      </p>
                    </>
                  ) : (
                    <>
                      <strong>Ẩn sau khi tạo</strong>
                      <p>
                        Nội dung mới tạo sẽ ở trạng thái ẩn. Kiểm tra lại trước
                        khi công khai.
                      </p>
                    </>
                  )}
                </div>
                {isEdit && id ? (
                  visibilityAction.action(
                    { id, title: fields.title, visibility },
                    profilePending || saving || unknown,
                  )
                ) : (
                  <AdminVisibilityBadge visibility="HIDDEN" />
                )}
              </div>
            </section>
          </fieldset>

          {/* ── Sticky actions ──────────────────────────────────────────── */}
          <AdminStickyActions message={actionMessage}>
            {!saving && !unknown && !visibilityAction.busy && (
              <Link className="af-btn" href="/admin/culture">
                Hủy
              </Link>
            )}
            <button
              type="submit"
              className="af-btn af-btn-primary"
              disabled={profilePending || saving || visibilityAction.busy}
              aria-busy={saving}
            >
              {saving && (
                <LoaderCircle
                  size={16}
                  className="af-spinner"
                  aria-hidden="true"
                />
              )}
              {!saving &&
                (isEdit ? (
                  <Save size={16} aria-hidden="true" />
                ) : (
                  <Plus size={16} aria-hidden="true" />
                ))}
              {saving
                ? isEdit
                  ? "Đang lưu…"
                  : "Đang tạo…"
                : unknown
                  ? "Đọc lại và thử lại"
                  : isEdit
                    ? "Lưu thay đổi"
                    : "Tạo nội dung văn hóa"}
            </button>
          </AdminStickyActions>
        </form>
      </main>
    </div>
  );
}
