"use client";
import "./destinations.css";
import "@/components/admin/admin-form-shell.css";

import DestinationLocationPicker from "./destination-location-picker";
import ContentProfileEditor, {
  DestinationBasicProfile,
  DestinationLocationProfile,
} from "@/components/admin/content-profile-editor";
import {
  destinationProfileSchema,
  type DestinationProfile,
} from "@/modules/content-profile/content-profile-contract";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  destinationInputSchema,
  unknownSchedule,
  weekdayLabels,
  type DestinationDto,
  type DestinationInput,
} from "@/modules/destination/destination-contract";
import {
  loadDestination,
  loadDestinations,
  saveDestination,
  DestinationReadError,
} from "@/lib/destination-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { createIdempotencyKey } from "@/lib/mutation-client";
import {
  claimSubmission,
  releaseSubmission,
} from "@/lib/auth-submission-guard";
import { markDestinationSaved } from "@/lib/destination-save-notice";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  MapPin,
  Clock3,
  CalendarDays,
  ShieldCheck,
  Eye,
  Save,
  Plus,
  LoaderCircle,
  AlertTriangle,
  Images,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import AdminContentPreview from "@/components/admin/admin-content-preview";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import OpeningHoursEditor from "./opening-hours-editor";
import { useDestinationVisibility } from "./destination-visibility-action";
import { parseCoordinateInputs } from "@/modules/map/map-model";
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

/* ── Navigation sections ─────────────────────────────────────────────────── */
const SECTION_DEFS: NavSection[] = [
  { id: "df-basic", label: "Thông tin cơ bản", icon: FileText },
  { id: "df-geo", label: "Phạm vi địa lý", icon: MapPin },
  { id: "df-location", label: "Vị trí và bản đồ", icon: MapPin },
  { id: "df-duration", label: "Thời lượng", icon: Clock3 },
  { id: "df-hours", label: "Giờ hoạt động", icon: CalendarDays },
  { id: "df-visit", label: "Thông tin tham quan", icon: Clock3 },
  { id: "df-media", label: "Hình ảnh", icon: Images },
  { id: "df-culture", label: "Văn hóa liên quan", icon: BookOpen },
  { id: "df-sources", label: "Nguồn & quyền", icon: ShieldCheck },
  { id: "df-visibility", label: "Xuất bản", icon: Eye },
];

/* ── Field helpers ────────────────────────────────────────────────────────── */
const blank = () => ({
  name: "",
  description: "",
  area: "",
  category: "",
  latitude: "",
  longitude: "",
  suggestedDurationMinutes: "",
  minimumDurationMinutes: "",
});
const fieldsFromDto = (dto: DestinationDto) => ({
  name: dto.name,
  description: dto.description,
  area: dto.area,
  category: dto.category,
  latitude: String(dto.latitude),
  longitude: String(dto.longitude),
  suggestedDurationMinutes:
    dto.suggestedDurationMinutes === null
      ? ""
      : String(dto.suggestedDurationMinutes),
  minimumDurationMinutes:
    dto.minimumDurationMinutes === null
      ? ""
      : String(dto.minimumDurationMinutes),
});
type Field = keyof ReturnType<typeof blank>;

export default function DestinationForm({ id }: { id: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [pinChanged, setPinChanged] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [profile, setProfile] = useState<DestinationProfile>(() =>
    destinationProfileSchema.parse({}),
  );
  const [fields, setFields] = useState(blank);
  const mapCoordinates = parseCoordinateInputs(
    fields.latitude,
    fields.longitude,
  );
  const [days, setDays] = useState(unknownSchedule);
  const [visibility, setVisibility] = useState<"HIDDEN" | "VISIBLE">("HIDDEN");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const baseline = useRef<string | null>(
    id
      ? null
      : JSON.stringify({
          fields: blank(),
          days: unknownSchedule(),
          profile: destinationProfileSchema.parse({}),
        }),
  );
  const draft = JSON.stringify({ fields, days, profile });
  const dirty = baseline.current !== null && draft !== baseline.current;
  const lock = useRef(false);
  const attempt = useRef<{ key: string; input: DestinationInput } | null>(null);
  const visibilityAction = useDestinationVisibility(
    (dto) => setVisibility(dto.visibility),
    lock,
  );

  const markSafeToLeave = useUnsavedChanges(
    dirty,
    saving || unknown || profilePending || visibilityAction.busy,
  );

  /* ── Section nav ──────────────────────────────────────────────────────── */
  const sectionIds = SECTION_DEFS.map((s) => s.id);
  const { activeId, scrollTo } = useSectionNav(sectionIds);

  const sections: NavSection[] = SECTION_DEFS.map((sec) => {
    const hasError = Object.keys(errors).some((k) => {
      if (sec.id === "df-basic")
        return [
          "name",
          "description",
          "area",
          "category",
          "profile.shortDescription",
          "profile.aliases",
          "profile.address",
        ].includes(k);
      if (sec.id === "df-geo") return k.startsWith("profile.areaIds");
      if (sec.id === "df-culture") return k.startsWith("profile.cultureIds");
      if (sec.id === "df-visit")
        return (
          k.startsWith("profile.ticket") ||
          k === "profile.bestVisitTime" ||
          k === "profile.visitNotes"
        );
      if (sec.id === "df-location")
        return (
          ["latitude", "longitude"].includes(k) ||
          k.startsWith("profile.location") ||
          k.startsWith("profile.googleMaps")
        );
      if (sec.id === "df-duration") return k.includes("Duration");
      if (sec.id === "df-hours") return k.startsWith("openingDays");
      if (sec.id === "df-sources") return k.startsWith("profile.sources");
      if (sec.id === "df-media") return k.startsWith("profile.media");
      return false;
    });
    const done =
      sec.id === "df-basic"
        ? [
            destinationInputSchema.shape.name.safeParse(fields.name),
            destinationInputSchema.shape.description.safeParse(
              fields.description,
            ),
            destinationInputSchema.shape.area.safeParse(fields.area),
            destinationInputSchema.shape.category.safeParse(fields.category),
          ].every((r) => r.success)
        : sec.id === "df-location"
          ? !!mapCoordinates &&
            profile.locationVerified &&
            !!profile.locationEvidence
          : false;
    return {
      ...sec,
      status: hasError ? "error" : done ? "done" : undefined,
      statusLabel:
        !hasError && !done && ["df-basic", "df-location"].includes(sec.id)
          ? "Cần nhập"
          : undefined,
    } as NavSection;
  });

  /* ── Load ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    void loadDestination(id)
      .then((dto) => {
        if (active) {
          baseline.current = JSON.stringify({
            fields: fieldsFromDto(dto),
            days: dto.openingDays,
            profile: dto.profile ?? destinationProfileSchema.parse({}),
          });
          setProfile(dto.profile ?? destinationProfileSchema.parse({}));
          setFields(fieldsFromDto(dto));
          setDays(dto.openingDays);
          setVisibility(dto.visibility);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error instanceof DestinationReadError
              ? (authorizationFeedback(error.status) ?? error.message)
              : "Không thể tải điểm đến.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  /* ── Field change ─────────────────────────────────────────────────────── */
  function changeField(key: Field, value: string) {
    if ((key === "latitude" || key === "longitude") && fields[key] !== value) {
      if (profile.locationVerified || profile.locationEvidence)
        setPinChanged(true);
      if (profile.locationVerified || profile.locationEvidence) setPinChanged(true);
      setProfile((p) => ({
        ...p,
        locationVerified: false,
        locationEvidence: null,
      }));
    }
    setFields((cur) => ({ ...cur, [key]: value }));
    setErrors((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }

  function changeProfile(p: DestinationProfile) {
    setProfile(p);
    const parsed = destinationProfileSchema.safeParse(p);
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

  function changeMapCoordinates(coords: {
    latitude: number;
    longitude: number;
  }) {
    changeField("latitude", String(Number(coords.latitude.toFixed(6))));
    changeField("longitude", String(Number(coords.longitude.toFixed(6))));
  }

  /* ── Submit ────────────────────────────────────────────────────────────── */
  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (profilePending || visibilityAction.busy || !claimSubmission(lock))
      return;
    let completed = false;
    try {
      let input: DestinationInput;
      if (unknown && attempt.current) {
        input = attempt.current.input;
      } else {
        const parsed = destinationInputSchema.safeParse({
          ...fields,
          profile,
          latitude: fields.latitude.trim() ? Number(fields.latitude) : NaN,
          longitude: fields.longitude.trim() ? Number(fields.longitude) : NaN,
          suggestedDurationMinutes: fields.suggestedDurationMinutes.trim()
            ? Number(fields.suggestedDurationMinutes)
            : null,
          minimumDurationMinutes: fields.minimumDurationMinutes.trim()
            ? Number(fields.minimumDurationMinutes)
            : null,
          openingDays: days,
        });
        if (!parsed.success) {
          const nextErrors: Record<string, string> = {};
          parsed.error.issues.forEach((issue) => {
            nextErrors[issue.path.join(".")] =
              issue.code === "invalid_type"
                ? "Nhập giá trị hợp lệ."
                : issue.message;
          });
          setErrors(nextErrors);
          toast.error("Kiểm tra các trường không hợp lệ.", {
            position: "bottom-right",
            id: "destination-validation",
          });
          requestAnimationFrame(() =>
            focusFormError(
              parsed.error.issues[0]?.path.join(".") ?? "name",
              "df",
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
      setSaving(true);
      setErrors({});
      if (unknown) {
        if (id) await loadDestination(id);
        else await loadDestinations();
      }
      const result = await saveDestination(id, input, attempt.current!.key);
      if (result.status === "SUCCESS") {
        completed = true;
        baseline.current = draft;
        markSafeToLeave();
        markDestinationSaved();
        router.push("/admin/destinations");
        return;
      }
      if (result.status === "UNKNOWN") {
        setUnknown(true);
        toast.warning(
          "Chưa xác định kết quả lưu. Nội dung và key giữ nguyên.",
          { position: "bottom-right", id: "destination-write" },
        );
      } else {
        setUnknown(false);
        attempt.current = null;
        toast.error(
          authorizationFeedback(result.httpStatus) ??
            "Lưu thất bại. Nội dung vẫn được giữ để thử lại.",
          { position: "bottom-right", id: "destination-write" },
        );
      }
    } catch {
      toast.error("Không thể đọc lại dữ liệu. Nội dung và key giữ nguyên.", {
        position: "bottom-right",
        id: "destination-write",
      });
    } finally {
      if (!completed) {
        releaseSubmission(lock);
        setSaving(false);
      }
    }
  }

  const disabled = saving || unknown || visibilityAction.busy;
  const isEdit = Boolean(id);

  const actionMessage = saving
    ? isEdit
      ? "Đang lưu thay đổi…"
      : "Đang tạo điểm đến…"
    : unknown
      ? "Chưa xác định kết quả. Thử lại sẽ dùng cùng key."
      : dirty
        ? "Có thay đổi chưa được lưu."
        : isEdit
          ? "Chưa có thay đổi."
          : "Điểm đến mới sẽ được tạo ở trạng thái ẩn.";

  /* ── Render: loading / error ──────────────────────────────────────────── */
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

  /* ── Main render ──────────────────────────────────────────────────────── */
  return (
    <div className="af-root af-page">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <AdminPageHeader
        breadcrumb={
          <>
            <Link href="/admin/destinations">Quản lý điểm đến</Link>
            <span className="af-breadcrumb-sep" aria-hidden="true">
              <ChevronRight size={12} />
            </span>
            <span>{isEdit ? "Chỉnh sửa" : "Tạo mới"}</span>
          </>
        }
        title={isEdit ? "Chỉnh sửa điểm đến" : "Tạo điểm đến mới"}
        subtitle={
          isEdit
            ? "Cập nhật thông tin, vị trí, thời lượng và giờ hoạt động."
            : "Nhập thông tin điểm đến mới. Tất cả dữ liệu có thể chỉnh sửa sau khi tạo."
        }
        meta={<AdminVisibilityBadge visibility={visibility} />}
      />

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <AdminFormProgress
        complete={
          ["name", "description", "area", "category"].filter(
            (k) =>
              fields[k as Field].trim().length > 0 &&
              fields[k as Field].trim().length <=
                (k === "description" ? 10000 : k === "name" ? 200 : 100),
          ).length +
          Number(
            destinationInputSchema.shape.latitude.safeParse(
              fields.latitude.trim() ? Number(fields.latitude) : NaN,
            ).success,
          ) +
          Number(
            destinationInputSchema.shape.longitude.safeParse(
              fields.longitude.trim() ? Number(fields.longitude) : NaN,
            ).success,
          )
        }
        total={6}
      />
      <AdminSectionNav
        sections={sections}
        activeId={activeId}
        onNavigate={scrollTo}
      />

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="af-main">
        <Link
          className="af-btn"
          style={{ marginBottom: 18, display: "inline-flex", gap: 6 }}
          href="/admin/destinations"
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
          <AdminValidationSummary errors={errors} prefix="df" />
          <fieldset
            disabled={disabled}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {/* ── 5–7. Địa lý, media, sources (via ContentProfileEditor) */}
            <div>
              <ContentProfileEditor
                profile={profile}
                onChange={(p) => changeProfile(p as DestinationProfile)}
                errors={errors}
                onPendingChange={setProfilePending}
                hideBasic
                hideLocation
                sectionPrefix="df"
                leadingSections={
                  <>
                    <section id="df-basic" className="af-section">
                      <AdminSectionHead
                        icon={FileText}
                        title="Thông tin cơ bản"
                        description="Tên, mô tả chính thức, khu vực và danh mục của điểm đến."
                        badge="required"
                      />
                      <div className="af-grid-2">
                        <AdminField error={errors.name} errorId="err-name">
                          <AdminLabel htmlFor="destination-name" required>
                            Tên điểm đến
                          </AdminLabel>
                          <input
                            id="destination-name"
                            className="af-input"
                            value={fields.name}
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={
                              errors.name ? "err-name" : undefined
                            }
                            placeholder="Ví dụ: Cột cờ Lũng Cú"
                            onChange={(e) =>
                              changeField("name", e.target.value)
                            }
                          />
                        </AdminField>
                        <AdminField error={errors.area} errorId="err-area">
                          <AdminLabel htmlFor="destination-area" required>
                            Khu vực
                          </AdminLabel>
                          <input
                            id="destination-area"
                            className="af-input"
                            value={fields.area}
                            aria-invalid={Boolean(errors.area)}
                            aria-describedby={
                              errors.area ? "err-area" : undefined
                            }
                            placeholder="Ví dụ: Hà Giang, Đồng Văn"
                            onChange={(e) =>
                              changeField("area", e.target.value)
                            }
                          />
                        </AdminField>
                      </div>
                      <AdminField
                        error={errors.category}
                        errorId="err-category"
                      >
                        <AdminLabel htmlFor="destination-category" required>
                          Danh mục
                        </AdminLabel>
                        <input
                          id="destination-category"
                          className="af-input"
                          value={fields.category}
                          aria-invalid={Boolean(errors.category)}
                          aria-describedby={
                            errors.category ? "err-category" : undefined
                          }
                          placeholder="Ví dụ: Di tích lịch sử, Thiên nhiên, Làng nghề…"
                          onChange={(e) =>
                            changeField("category", e.target.value)
                          }
                        />
                      </AdminField>
                      <AdminField
                        error={errors.description}
                        errorId="err-description"
                      >
                        <AdminLabel htmlFor="destination-description" required>
                          Mô tả điểm đến
                        </AdminLabel>
                        <textarea
                          id="destination-description"
                          className="af-textarea"
                          style={{ minHeight: 160, resize: "vertical" }}
                          value={fields.description}
                          maxLength={10000}
                          aria-invalid={Boolean(errors.description)}
                          aria-describedby={
                            errors.description ? "err-description" : undefined
                          }
                          placeholder="Mô tả chi tiết về điểm đến: đặc điểm nổi bật, lịch sử, ý nghĩa, trải nghiệm tham quan…"
                          onChange={(e) =>
                            changeField("description", e.target.value)
                          }
                        />
                        <AdminHelper>
                          Mô tả chính thức sẽ hiển thị trên website. Tối đa
                          10.000 ký tự.
                        </AdminHelper>
                      </AdminField>
                      <DestinationBasicProfile
                        profile={profile}
                        onChange={changeProfile}
                      />
                    </section>
                  </>
                }
                locationSection={
                  <>
                    <section id="df-location" className="af-section">
                      <AdminSectionHead
                        icon={MapPin}
                        title="Vị trí và bản đồ"
                        description="Nhập tọa độ GPS và xác nhận pin trên bản đồ. Cần đối chiếu với Google Maps trước khi đánh dấu đã xác minh."
                        badge="required"
                      />
                      <div className="af-grid-2">
                        <AdminField
                          error={errors.latitude}
                          errorId="err-latitude"
                        >
                          <AdminLabel
                            htmlFor="destination-latitude"
                            required
                            tooltip="Vĩ độ từ -90 đến 90. Hà Giang khoảng 22.8 — 23.4 N."
                          >
                            Vĩ độ (Latitude)
                          </AdminLabel>
                          <input
                            id="destination-latitude"
                            className="af-input"
                            value={fields.latitude}
                            inputMode="decimal"
                            placeholder="22.831456"
                            aria-invalid={Boolean(errors.latitude)}
                            aria-describedby={
                              errors.latitude ? "err-latitude" : undefined
                            }
                            onChange={(e) =>
                              changeField("latitude", e.target.value)
                            }
                          />
                        </AdminField>
                        <AdminField
                          error={errors.longitude}
                          errorId="err-longitude"
                        >
                          <AdminLabel
                            htmlFor="destination-longitude"
                            required
                            tooltip="Kinh độ từ -180 đến 180. Hà Giang khoảng 104.6 — 105.5 E."
                          >
                            Kinh độ (Longitude)
                          </AdminLabel>
                          <input
                            id="destination-longitude"
                            className="af-input"
                            value={fields.longitude}
                            inputMode="decimal"
                            placeholder="105.325678"
                            aria-invalid={Boolean(errors.longitude)}
                            aria-describedby={
                              errors.longitude ? "err-longitude" : undefined
                            }
                            onChange={(e) =>
                              changeField("longitude", e.target.value)
                            }
                          />
                        </AdminField>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          marginBottom: 14,
                        }}
                      >
                        <button
                          type="button"
                          className="af-btn"
                          aria-expanded={showMap}
                          aria-controls="destination-map-panel"
                          onClick={() => setShowMap((v) => !v)}
                        >
                          <MapPin size={16} aria-hidden="true" />
                          {showMap
                            ? "Ẩn bản đồ chọn pin"
                            : "Mở bản đồ chọn pin"}
                        </button>
                        {mapCoordinates && (
                          <a
                            className="af-btn"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fields.latitude + "," + fields.longitude)}`}
                          >
                            Đối chiếu trên Google Maps ↗
                          </a>
                        )}
                      </div>
                      {!mapCoordinates && (
                        <AdminHelper>
                          Nhập hoặc chọn tọa độ để mở vị trí trong Google Maps
                          để đối chiếu.
                        </AdminHelper>
                      )}

                      {showMap && (
                        <div id="destination-map-panel">
                          <DestinationLocationPicker
                            coordinates={mapCoordinates}
                            locationVerified={profile.locationVerified}
                            onChange={changeMapCoordinates}
                          />
                        </div>
                      )}
                      <AdminHelper>
                        Bản đồ tương tác dùng Stadia/MapLibre; Google Maps mở
                        riêng để đối chiếu. Ghi bằng chứng và xác nhận tọa độ
                        trong hồ sơ.
                      </AdminHelper>
                      <p role="status" className="af-helper">
                        {!mapCoordinates
                          ? "Chưa chọn vị trí."
                          : profile.locationVerified
                            ? "Đã xác nhận vị trí."
                            : pinChanged
                              ? "Đã thay đổi tọa độ, cần xác nhận lại."
                              : "Đã chọn vị trí, chưa xác nhận."}
                      </p>
                      <DestinationLocationProfile
                        profile={profile}
                        onChange={changeProfile}
                      />
                    </section>
                  </>
                }
                durationSection={
                  <>
                    <section id="df-duration" className="af-section">
                      <AdminSectionHead
                        icon={Clock3}
                        title="Thời lượng tham quan"
                        description="Đơn vị phút. Để trống nếu chưa có dữ liệu. Hai thời lượng được lưu độc lập."
                        badge="optional"
                      />
                      <div className="af-grid-2">
                        <AdminField
                          error={errors.suggestedDurationMinutes}
                          errorId="err-sugDuration"
                        >
                          <AdminLabel
                            htmlFor="destination-suggestedDurationMinutes"
                            optional
                            tooltip="Khoảng thời gian tham khảo giúp khách lập kế hoạch tham quan."
                          >
                            Thời lượng gợi ý (phút)
                          </AdminLabel>
                          <input
                            id="destination-suggestedDurationMinutes"
                            className="af-input"
                            value={fields.suggestedDurationMinutes}
                            inputMode="numeric"
                            placeholder="Ví dụ: 120"
                            aria-invalid={Boolean(
                              errors.suggestedDurationMinutes,
                            )}
                            aria-describedby={
                              errors.suggestedDurationMinutes
                                ? "err-sugDuration"
                                : undefined
                            }
                            onChange={(e) =>
                              changeField(
                                "suggestedDurationMinutes",
                                e.target.value,
                              )
                            }
                          />
                          <AdminHelper>
                            Khoảng thời gian tham khảo khi khám phá hoặc lập kế
                            hoạch.
                          </AdminHelper>
                        </AdminField>
                        <AdminField
                          error={errors.minimumDurationMinutes}
                          errorId="err-minDuration"
                        >
                          <AdminLabel
                            htmlFor="destination-minimumDurationMinutes"
                            optional
                            tooltip="Thời lượng tối thiểu dùng để kiểm tra tính hợp lệ của hành trình tự động."
                          >
                            Thời lượng tối thiểu (phút)
                          </AdminLabel>
                          <input
                            id="destination-minimumDurationMinutes"
                            className="af-input"
                            value={fields.minimumDurationMinutes}
                            inputMode="numeric"
                            placeholder="Ví dụ: 45"
                            aria-invalid={Boolean(
                              errors.minimumDurationMinutes,
                            )}
                            aria-describedby={
                              errors.minimumDurationMinutes
                                ? "err-minDuration"
                                : undefined
                            }
                            onChange={(e) =>
                              changeField(
                                "minimumDurationMinutes",
                                e.target.value,
                              )
                            }
                          />
                          <AdminHelper>
                            Thời lượng tối thiểu dùng để kiểm tra tính hợp lệ
                            của hành trình.
                          </AdminHelper>
                        </AdminField>
                      </div>
                    </section>
                  </>
                }
                openingHoursSection={
                  <>
                    <section id="df-hours" className="af-section">
                      <AdminSectionHead
                        icon={CalendarDays}
                        title="Giờ hoạt động"
                        description="Giờ địa phương Hà Giang (Asia/Ho_Chi_Minh). Không hỗ trợ qua đêm (>24:00). Chưa có dữ liệu ≠ đóng cửa."
                        badge="optional"
                      />
                      <div id="destination-openingDays" tabIndex={-1}>
                        <OpeningHoursEditor
                          days={days}
                          errors={errors}
                          onChange={setDays}
                        />
                      </div>
                    </section>
                  </>
                }
              />
            </div>

            {/* ── 8. Xuất bản ──────────────────────────────────────── */}
            <section id="df-visibility" className="af-section">
              <AdminSectionHead
                icon={Eye}
                title={
                  isEdit ? "Trạng thái hiển thị" : "Trạng thái sau khi tạo"
                }
                description={
                  isEdit
                    ? "Ẩn/hiển thị là thao tác riêng, không lưu cùng nội dung biểu mẫu."
                    : "Điểm đến mới được tạo ở trạng thái ẩn."
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
                  title={fields.name}
                  content={fields.description}
                  profile={profile}
                  location={{
                    latitude: fields.latitude,
                    longitude: fields.longitude,
                  }}
                  durations={{
                    suggested: fields.suggestedDurationMinutes,
                    minimum: fields.minimumDurationMinutes,
                  }}
                  hours={days.map((d, i) => ({
                    day: weekdayLabels[i]!,
                    status: d.status,
                    intervals: d.intervals,
                  }))}
                />
              )}
              <div className="af-visibility-row">
                <div className="af-visibility-info">
                  {isEdit ? (
                    <>
                      <strong>Trạng thái hiện tại</strong>
                      <p>
                        Thay đổi trạng thái là thao tác riêng — không ảnh hưởng
                        đến nội dung đang chỉnh sửa.
                      </p>
                    </>
                  ) : (
                    <>
                      <strong>Ẩn sau khi tạo</strong>
                      <p>
                        Điểm đến mới tạo ở trạng thái ẩn. Kiểm tra thông tin
                        trước khi công khai.
                      </p>
                    </>
                  )}
                </div>
                {isEdit && id ? (
                  visibilityAction.action(
                    { id, name: fields.name, visibility },
                    profilePending || saving || unknown,
                  )
                ) : (
                  <AdminVisibilityBadge visibility="HIDDEN" />
                )}
              </div>
            </section>
          </fieldset>

          {/* ── Sticky actions ─────────────────────────────────────── */}
          <AdminStickyActions message={actionMessage}>
            {!saving && !unknown && !visibilityAction.busy && (
              <Link className="af-btn" href="/admin/destinations">
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
                    : "Tạo điểm đến"}
            </button>
          </AdminStickyActions>
        </form>
      </main>
    </div>
  );
}
