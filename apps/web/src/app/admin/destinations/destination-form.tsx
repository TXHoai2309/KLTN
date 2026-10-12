"use client";
import DestinationLocationPicker from "./destination-location-picker";
import ContentProfileEditor from "@/components/admin/content-profile-editor";
import { destinationProfileSchema, type DestinationProfile } from "@/modules/content-profile/content-profile-contract";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { destinationInputSchema, unknownSchedule, type DestinationDto, type DestinationInput } from "@/modules/destination/destination-contract";
import { loadDestination, loadDestinations, saveDestination, DestinationReadError } from "@/lib/destination-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { markDestinationSaved } from "@/lib/destination-save-notice";

import { toast } from "sonner";
import { FileText, MapPin, Clock3, CalendarDays, ShieldCheck, Save, Plus, LoaderCircle, AlertTriangle } from "lucide-react";
import OpeningHoursEditor from "./opening-hours-editor";
import { SectionHeading, VisibilityBadge, LoadingState } from "./destination-ui";

import DestinationPageHeader from "./destination-page-header";
import { useDestinationVisibility } from "./destination-visibility-action";
import { parseCoordinateInputs } from "@/modules/map/map-model";

const blank = () => ({ name: "", description: "", area: "", category: "", latitude: "", longitude: "", suggestedDurationMinutes: "", minimumDurationMinutes: "" });
const fieldsFromDto = (dto: DestinationDto) => ({ name: dto.name, description: dto.description, area: dto.area, category: dto.category, latitude: String(dto.latitude), longitude: String(dto.longitude), suggestedDurationMinutes: dto.suggestedDurationMinutes === null ? "" : String(dto.suggestedDurationMinutes), minimumDurationMinutes: dto.minimumDurationMinutes === null ? "" : String(dto.minimumDurationMinutes) });
type Field = keyof ReturnType<typeof blank>;
export default function DestinationForm({ id }: { id: string | null }) {
  const router = useRouter();
  const [showMap, setShowMap] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [profile, setProfile] = useState<DestinationProfile>(() => destinationProfileSchema.parse({}));
  const [fields, setFields] = useState(blank);
  const mapCoordinates = parseCoordinateInputs(fields.latitude, fields.longitude);
  const [days, setDays] = useState(unknownSchedule);
  const [visibility, setVisibility] = useState<"HIDDEN" | "VISIBLE">("HIDDEN");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>( {} );
  const lock = useRef(false);
  const attempt = useRef<{ key: string; input: DestinationInput } | null>(null);
  const visibilityAction = useDestinationVisibility(dto => setVisibility(dto.visibility), lock);
  useEffect(() => {
    let active = true;
    if (!id) { setLoading(false); return; }
    setLoading(true); setLoadError("");
    void loadDestination(id).then(dto => { if (active) { setProfile(dto.profile ?? destinationProfileSchema.parse({})); setFields(fieldsFromDto(dto)); setDays(dto.openingDays); setVisibility(dto.visibility); setLoading(false); } }).catch(error => { if (active) { setLoadError(error instanceof DestinationReadError ? authorizationFeedback(error.status) ?? error.message : "Không thể tải điểm đến."); setLoading(false); } });
    return () => { active = false; };
  }, [id, reload]);
  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (profilePending || visibilityAction.busy || !claimSubmission(lock)) return;
    let completed = false;
    try {
      let input: DestinationInput;
      if (unknown && attempt.current) input = attempt.current.input;
      else {
        const parsed = destinationInputSchema.safeParse({ ...fields, profile, latitude: fields.latitude.trim() ? Number(fields.latitude) : NaN, longitude: fields.longitude.trim() ? Number(fields.longitude) : NaN, suggestedDurationMinutes: fields.suggestedDurationMinutes.trim() ? Number(fields.suggestedDurationMinutes) : null, minimumDurationMinutes: fields.minimumDurationMinutes.trim() ? Number(fields.minimumDurationMinutes) : null, openingDays: days });
        if (!parsed.success) {
          const nextErrors: Record<string, string> = {}; parsed.error.issues.forEach(issue => { nextErrors[issue.path.join(".")] = issue.code === "invalid_type" ? "Nhập giá trị hợp lệ." : issue.message; }); setErrors(nextErrors); toast.error("Kiểm tra các trường không hợp lệ.", { position: "bottom-right", id: "destination-validation" });
          const first = parsed.error.issues[0]?.path[0]; if (typeof first === "string") document.getElementById(`destination-${first}`)?.focus();
          return;
        }
        input = parsed.data;
        if (!attempt.current || JSON.stringify(attempt.current.input) !== JSON.stringify(input)) attempt.current = { key: createIdempotencyKey(), input };
      }
      setSaving(true); setErrors({}); setMessage("");
      if (unknown) { if (id) await loadDestination(id); else await loadDestinations(); }
      const result = await saveDestination(id, input, attempt.current!.key);
      if (result.status === "SUCCESS") { completed = true; markDestinationSaved(); router.push("/admin/destinations"); return; }
      if (result.status === "UNKNOWN") { setUnknown(true); setMessage("Chưa thể xác nhận đã lưu. Nội dung được giữ nguyên; thử lại sẽ đọc dữ liệu và gửi cùng request/key."); toast.warning("Chưa xác định kết quả lưu", { position: "bottom-right", description: "Giữ nguyên nội dung và thử lại để xác nhận.", id: "destination-write" }); }
      else { setUnknown(false); attempt.current = null; toast.error(authorizationFeedback(result.httpStatus) ?? "Lưu thất bại. Nội dung vẫn được giữ để bạn chỉnh sửa và thử lại.", { position: "bottom-right", id: "destination-write" }); }
    } catch { toast.error("Không thể đọc lại dữ liệu để thử tiếp.", { position: "bottom-right", description: "Nội dung và key được giữ nguyên; vui lòng thử lại.", id: "destination-write" }); }
    finally { if (!completed) { releaseSubmission(lock); setSaving(false); } }
  }
  function changeField(key: Field, value: string) {
    if ((key === "latitude" || key === "longitude") && fields[key] !== value) setProfile(p => ({ ...p, locationVerified: false, locationEvidence: null }));
    setFields(current => ({ ...current, [key]: value }));
    setErrors(current => { const next = { ...current }; delete next[key]; return next; });
  }
  function changeMapCoordinates(coordinates: { latitude: number; longitude: number }) {
    changeField("latitude", String(Number(coordinates.latitude.toFixed(6))));
    changeField("longitude", String(Number(coordinates.longitude.toFixed(6))));
  }
  const inputField = (key: Field, label: string, helper?: string) => <div className="destination-field" key={key}>
    <label htmlFor={`destination-${key}`}>{label}</label>
    {key === "description" ? <textarea id={`destination-${key}`} value={fields[key]} maxLength={10000} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `error-${key}` : undefined} onChange={event => changeField(key, event.target.value)} /> : <input id={`destination-${key}`} value={fields[key]} inputMode={["latitude", "longitude"].includes(key) ? "decimal" : ["suggestedDurationMinutes", "minimumDurationMinutes"].includes(key) ? "numeric" : "text"} aria-invalid={Boolean(errors[key])} aria-describedby={[helper ? `help-${key}` : "", errors[key] ? `error-${key}` : ""].filter(Boolean).join(" ") || undefined} onChange={event => changeField(key, event.target.value)} />}
    {helper && <p id={`help-${key}`} className="destination-helper">{helper}</p>}
    {errors[key] && <p id={`error-${key}`} className="destination-error" role="alert">{errors[key]}</p>}
  </div>;
  return <main className="destination-page"><div className="destination-container destination-form-container">
    <DestinationPageHeader mode={id ? "edit" : "create"} canGoBack={!saving && !unknown && !visibilityAction.busy} />
    {loading ? <LoadingState>Đang tải biểu mẫu…</LoadingState> : loadError ? <div className="destination-card destination-state" role="alert"><AlertTriangle size={28} aria-hidden="true" /><p>{loadError}</p><button type="button" onClick={() => setReload(value => value + 1)}>Thử tải lại</button></div> : <>
      {unknown && <div className="destination-uncertain" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div><strong>Chưa xác định kết quả lưu</strong><p>{message}</p></div></div>}
      {visibilityAction.feedback}
      <form method="post" noValidate onSubmit={event => void submit(event)}>
        <fieldset disabled={saving || unknown || visibilityAction.busy} className="destination-form-fields">




        <ContentProfileEditor basicFields={<div className="destination-grid"><div>{inputField("name", "Tên điểm đến *")}{inputField("description", "Mô tả *")}</div><div>{inputField("area", "Khu vực *")}{inputField("category", "Danh mục *")}<p className="destination-helper">Nhập khu vực và danh mục phù hợp với dữ liệu điểm đến.</p></div></div>} locationFields={<><div className="destination-grid">{inputField("latitude", "Vĩ độ *", "Từ -90 đến 90.")}{inputField("longitude", "Kinh độ *", "Từ -180 đến 180.")}</div><button type="button" className="destination-button" aria-expanded={showMap} onClick={() => setShowMap(value => !value)}>{showMap ? "Ẩn bản đồ chọn pin" : "Mở bản đồ chọn pin"}</button>{showMap && <DestinationLocationPicker coordinates={mapCoordinates} locationVerified={profile.locationVerified} onChange={changeMapCoordinates} />}{mapCoordinates ? <a className="destination-button" target="_blank" rel="noopener noreferrer" href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(fields.latitude + "," + fields.longitude)}>Đối chiếu pin trên Google Maps</a> : <p className="destination-helper">Nhập hoặc chọn tọa độ để mở vị trí trong Google Maps.</p>}<p className="destination-helper">Bản đồ tương tác dùng Stadia/MapLibre; Google Maps mở riêng để đối chiếu. Ghi bằng chứng và xác nhận tọa độ trong hồ sơ.</p></>} durationSection={<section className="destination-card"><SectionHeading icon={Clock3} title="Thời lượng tham quan" description="Đơn vị phút. Để trống nếu chưa có dữ liệu; hai thời lượng được lưu độc lập." /><div className="destination-grid">{inputField("suggestedDurationMinutes", "Thời lượng gợi ý", "Khoảng thời gian tham khảo cho người dùng khi khám phá hoặc lập kế hoạch.")}{inputField("minimumDurationMinutes", "Thời lượng tối thiểu", "Thời lượng tối thiểu dùng để kiểm tra tính hợp lệ của hành trình.")}</div></section>} openingHoursSection={<section className="destination-card"><div id="destination-openingDays" tabIndex={-1}><SectionHeading icon={CalendarDays} title="Giờ hoạt động" description="Giờ địa phương Hà Giang (Asia/Ho_Chi_Minh). Không hỗ trợ qua đêm." /></div><OpeningHoursEditor days={days} errors={errors} onChange={setDays} /></section>} onPendingChange={setProfilePending} profile={profile} errors={errors} onChange={p => setProfile(p as DestinationProfile)} />
        </fieldset>
        <section className="destination-card destination-visibility"><div><SectionHeading icon={ShieldCheck} title="Trạng thái hiển thị" description={id ? "Ẩn/hiển thị là thao tác riêng, không lưu cùng nội dung biểu mẫu." : "Điểm đến mới được tạo ở trạng thái ẩn."} /></div><div className="destination-status-actions">{id ? <div className="destination-edit-visibility">{visibilityAction.action({ id, name: fields.name, visibility }, profilePending || saving || unknown)}</div> : <VisibilityBadge visibility={visibility} />}</div></section>
        <div className="destination-form-actions"><p>{saving ? "Đang xác nhận kết quả lưu…" : unknown ? "Nội dung được giữ nguyên để retry an toàn." : "Kiểm tra thông tin trước khi lưu."}</p><div className="destination-action-buttons">{!saving && !unknown && !visibilityAction.busy && <Link className="destination-button" href="/admin/destinations">Hủy</Link>}<button className="destination-primary" type="submit" disabled={profilePending || saving || visibilityAction.busy} aria-busy={saving}>{saving ? <LoaderCircle size={17} className="destination-spinner" aria-hidden="true" /> : id ? <Save size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{saving ? "Đang lưu..." : unknown ? "Đọc lại và thử lại" : id ? "Lưu thay đổi" : "Tạo điểm đến"}</button></div></div>
      </form>
    </>}
  </div></main>;
}
