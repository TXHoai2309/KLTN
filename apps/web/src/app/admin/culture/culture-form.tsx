"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, MapPin, Link2, ShieldCheck, Save, Plus, LoaderCircle, AlertTriangle } from "lucide-react";
import { cultureInputSchema, type CultureDto, type CultureInput } from "@/modules/culture/culture-contract";
import { loadCulture, loadCultureList, saveCulture, CultureReadError } from "@/lib/culture-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { markCultureSaved } from "@/lib/culture-save-notice";
import { SectionHeading, VisibilityBadge, LoadingState } from "../destinations/destination-ui";
import CulturePageHeader from "./culture-page-header";
import { useCultureVisibility } from "./culture-visibility-action";
import DestinationPicker from "./destination-picker";
const blank = () => ({ title: "", content: "", sourceTitle: "", sourceUrl: "" });
type Field = keyof ReturnType<typeof blank>;
export default function CultureForm({ id }: { id: string | null }) {
  const router = useRouter();
  const [fields, setFields] = useState(blank);
  const [selected, setSelected] = useState<CultureDto["destinations"]>([]);
  const [visibility, setVisibility] = useState<CultureDto["visibility"]>("HIDDEN");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const attempt = useRef<{ key: string; input: CultureInput } | null>(null);
  const visibilityAction = useCultureVisibility(dto => setVisibility(dto.visibility), lock);
  useEffect(() => {
    let active = true;
    if (!id) { setLoading(false); return; }
    setLoading(true); setLoadError("");
    void loadCulture(id).then(dto => { if (active) { setFields({ title: dto.title, content: dto.content, sourceTitle: dto.sourceTitle ?? "", sourceUrl: dto.sourceUrl ?? "" }); setSelected(dto.destinations); setVisibility(dto.visibility); setLoading(false); } }).catch(error => { if (active) { setLoadError(error instanceof CultureReadError ? authorizationFeedback(error.status) ?? error.message : "Không thể tải nội dung văn hóa."); setLoading(false); } });
    return () => { active = false; };
  }, [id, reload]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visibilityAction.busy || !claimSubmission(lock)) return;
    let completed = false;
    try {
      let input: CultureInput;
      if (unknown && attempt.current) input = attempt.current.input;
      else {
        const parsed = cultureInputSchema.safeParse({ ...fields, destinationIds: selected.map(d => d.id) });
        if (!parsed.success) {
          const next: Record<string, string> = {}; parsed.error.issues.forEach(issue => { next[issue.path.join(".")] = issue.message; }); setErrors(next);
          toast.error("Kiểm tra các trường không hợp lệ.", { position: "bottom-right" });
          document.getElementById(`culture-${String(parsed.error.issues[0]?.path[0])}`)?.focus(); return;
        }
        input = parsed.data;
        if (!attempt.current || JSON.stringify(attempt.current.input) !== JSON.stringify(input)) attempt.current = { key: createIdempotencyKey(), input };
      }
      setSaving(true); setErrors({});
      if (unknown) { if (id) await loadCulture(id); else await loadCultureList(); }
      const result = await saveCulture(id, input, attempt.current!.key);
      if (result.status === "SUCCESS") { completed = true; markCultureSaved(id === null); router.push("/admin/culture"); return; }
      if (result.status === "UNKNOWN") { setUnknown(true); toast.warning("Chưa xác định kết quả lưu. Nội dung và key được giữ nguyên.", { position: "bottom-right" }); }
      else { setUnknown(false); attempt.current = null; toast.error(authorizationFeedback(result.httpStatus) ?? "Không thể lưu. Nội dung được giữ để chỉnh sửa và thử lại.", { position: "bottom-right" }); }
    } catch { toast.error("Không thể đọc lại dữ liệu. Nội dung và key vẫn được giữ nguyên.", { position: "bottom-right" }); }
    finally { if (!completed) { releaseSubmission(lock); setSaving(false); } }
  }
  function changeField(key: Field, value: string) {
    setFields(current => ({ ...current, [key]: value }));
    setErrors(current => { const next = { ...current }; delete next[key]; return next; });
  }
  const field = (key: Field, label: string, maxLength: number) => <div className="destination-field">
    <label htmlFor={`culture-${key}`}>{label}</label>
    {key === "content" ? <textarea id={`culture-${key}`} rows={8} value={fields[key]} maxLength={maxLength} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `culture-error-${key}` : undefined} onChange={event => changeField(key, event.target.value)} /> : <input id={`culture-${key}`} value={fields[key]} maxLength={maxLength} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `culture-error-${key}` : undefined} onChange={event => changeField(key, event.target.value)} />}
    {errors[key] && <p id={`culture-error-${key}`} className="destination-error" role="alert">{errors[key]}</p>}
  </div>;
  return <main className="destination-page culture-page"><div className="destination-container destination-form-container">
    <CulturePageHeader mode={id ? "edit" : "create"} canGoBack={!saving && !unknown && !visibilityAction.busy} />
    {loading ? <LoadingState>Đang tải biểu mẫu…</LoadingState> : loadError ? <div className="destination-card destination-state" role="alert"><p>{loadError}</p><button type="button" onClick={() => setReload(value => value + 1)}>Thử tải lại</button></div> : <>
      {unknown && <div className="destination-uncertain" role="alert"><AlertTriangle aria-hidden="true" /><p>Chưa xác định kết quả lưu. Thử lại sẽ đọc dữ liệu rồi gửi cùng nội dung/key; việc đọc lại không xác nhận thao tác đã thành công.</p></div>}
      {visibilityAction.feedback}
      <form method="post" noValidate onSubmit={event => void submit(event)}>
        <fieldset className="destination-form-fields" disabled={saving || unknown || visibilityAction.busy}>
          <section className="destination-card"><SectionHeading icon={BookOpen} title="Nội dung" description="Tiêu đề và nội dung văn hóa. Các trường có * là bắt buộc." />{field("title", "Tiêu đề *", 200)}{field("content", "Nội dung văn hóa *", 20000)}</section>
          <section className="destination-card"><SectionHeading icon={MapPin} title="Điểm đến liên quan" description="Chọn các điểm đến phù hợp với nội dung." /><DestinationPicker selected={selected} onChange={setSelected} />{errors.destinationIds && <p className="destination-error" role="alert">{errors.destinationIds}</p>}</section>
          <section className="destination-card"><SectionHeading icon={Link2} title="Nguồn" description="Thông tin nguồn hoặc liên kết khi có. Không bắt buộc URL nếu đã có tên nguồn." /><div className="destination-grid">{field("sourceTitle", "Tên nguồn", 300)}{field("sourceUrl", "Liên kết nguồn", 2000)}</div><p className="destination-helper">Chỉ dùng liên kết http/https. Để trống nếu chưa có thông tin nguồn; không tự tạo nguồn thay thế.</p></section>
        </fieldset>
        <section className="destination-card destination-visibility"><SectionHeading icon={ShieldCheck} title="Trạng thái hiển thị" description={id ? "Ẩn/hiển thị là thao tác riêng, không lưu cùng nội dung." : "Nội dung mới luôn được tạo ở trạng thái ẩn."} />{id ? visibilityAction.action({ id, title: fields.title, visibility }, saving || unknown) : <VisibilityBadge visibility={visibility} />}</section>
        <div className="destination-form-actions"><p>{saving ? "Đang xác nhận kết quả lưu…" : unknown ? "Nội dung được giữ nguyên để thử lại an toàn." : "Kiểm tra thông tin trước khi lưu."}</p><div className="destination-action-buttons">{!saving && !unknown && !visibilityAction.busy && <Link className="destination-button" href="/admin/culture">Hủy</Link>}<button type="submit" className="destination-primary" disabled={saving || visibilityAction.busy} aria-busy={saving}>{saving ? <LoaderCircle size={17} className="destination-spinner" aria-hidden="true" /> : id ? <Save size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{saving ? "Đang lưu..." : unknown ? "Đọc lại và thử lại" : id ? "Lưu thay đổi" : "Tạo nội dung văn hóa"}</button></div></div>
      </form>
    </>}
  </div></main>;
}
