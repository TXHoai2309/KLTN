"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Eye, Link2, MapPin, ShieldCheck, Save, Plus, LoaderCircle, AlertTriangle } from "lucide-react";
import { cultureInputSchema, sourceUrlSchema, type CultureDto, type CultureInput } from "@/modules/culture/culture-contract";
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
type Fields = ReturnType<typeof blank>;
type Field = keyof Fields;
type Selected = CultureDto["destinations"];
const serializeDraft = (fields: Fields, selected: Selected) => JSON.stringify({ fields, destinationIds: selected.map(destination => destination.id) });

export default function CultureForm({ id }: { id: string | null }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(blank);
  const [selected, setSelected] = useState<Selected>([]);
  const [visibility, setVisibility] = useState<CultureDto["visibility"]>("HIDDEN");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const lock = useRef(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const initialDraft = useRef<string | null>(id ? null : serializeDraft(blank(), []));
  const navigationOpener = useRef<HTMLAnchorElement | null>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<{ key: string; input: CultureInput } | null>(null);
  const visibilityAction = useCultureVisibility(dto => setVisibility(dto.visibility), lock);
  const dirty = initialDraft.current !== null && serializeDraft(fields, selected) !== initialDraft.current;
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    let active = true;
    if (!id) { setLoading(false); return; }
    setLoading(true); setLoadError("");
    void loadCulture(id).then(dto => {
      if (active) {
        const loadedFields = { title: dto.title, content: dto.content, sourceTitle: dto.sourceTitle ?? "", sourceUrl: dto.sourceUrl ?? "" };
        initialDraft.current = serializeDraft(loadedFields, dto.destinations);
        dirtyRef.current = false;
        setFields(loadedFields); setSelected(dto.destinations); setVisibility(dto.visibility); setLoading(false);
      }
    }).catch(error => { if (active) { setLoadError(error instanceof CultureReadError ? authorizationFeedback(error.status) ?? error.message : "Không thể tải nội dung văn hóa."); setLoading(false); } });
    return () => { active = false; };
  }, [id, reload]);

  useEffect(() => {
    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let target: URL;
      try { target = new URL(anchor.href, window.location.href); } catch { return; }
      if (target.origin !== window.location.origin || target.href === window.location.href) return;
      if (!savingRef.current && !dirtyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (savingRef.current) { toast.info("Đang lưu nội dung. Vui lòng chờ kết quả.", { position: "bottom-right", id: "culture-save-navigation" }); return; }
      navigationOpener.current = anchor;
      setPendingNavigation(`${target.pathname}${target.search}${target.hash}`);
    };
    const guardBrowserExit = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("click", guardInternalNavigation, true);
    window.addEventListener("beforeunload", guardBrowserExit);
    return () => {
      window.removeEventListener("click", guardInternalNavigation, true);
      window.removeEventListener("beforeunload", guardBrowserExit);
    };
  }, []);

  useEffect(() => {
    if (pendingNavigation && leaveDialog.current && !leaveDialog.current.open) leaveDialog.current.showModal();
    else if (!pendingNavigation && leaveDialog.current?.open) leaveDialog.current.close();
  }, [pendingNavigation]);

  function stayOnForm() {
    leaveDialog.current?.close();
    setPendingNavigation(null);
    requestAnimationFrame(() => navigationOpener.current?.focus());
  }

  function leaveForm() {
    if (!pendingNavigation || savingRef.current) return;
    const destination = pendingNavigation;
    dirtyRef.current = false;
    initialDraft.current = serializeDraft(fields, selected);
    leaveDialog.current?.close();
    setPendingNavigation(null);
    router.push(destination as Route);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || visibilityAction.busy || !claimSubmission(lock)) return;
    let completed = false;
    try {
      let input: CultureInput;
      if (unknown && attempt.current) input = attempt.current.input;
      else {
        const parsed = cultureInputSchema.safeParse({ ...fields, destinationIds: selected.map(destination => destination.id) });
        if (!parsed.success) {
          const next: Record<string, string> = {};
          parsed.error.issues.forEach(issue => { next[issue.path.join(".")] = issue.code === "invalid_type" ? "Nhập giá trị hợp lệ." : issue.message; });
          setErrors(next);
          toast.error("Kiểm tra các trường không hợp lệ.", { position: "bottom-right" });
          document.getElementById(`culture-${String(parsed.error.issues[0]?.path[0])}`)?.focus();
          return;
        }
        input = parsed.data;
        if (!attempt.current || JSON.stringify(attempt.current.input) !== JSON.stringify(input)) attempt.current = { key: createIdempotencyKey(), input };
      }
      savingRef.current = true;
      setSaving(true); setErrors({});
      if (unknown) { if (id) await loadCulture(id); else await loadCultureList(); }
      const result = await saveCulture(id, input, attempt.current!.key);
      if (result.status === "SUCCESS") {
        completed = true;
        dirtyRef.current = false;
        initialDraft.current = serializeDraft(fields, selected);
        savingRef.current = false;
        markCultureSaved(id === null);
        router.push("/admin/culture");
        return;
      }
      if (result.status === "UNKNOWN") { setUnknown(true); toast.warning("Chưa xác định kết quả lưu. Nội dung và key được giữ nguyên.", { position: "bottom-right" }); }
      else { setUnknown(false); attempt.current = null; toast.error(authorizationFeedback(result.httpStatus) ?? "Không thể lưu. Nội dung được giữ để bạn chỉnh sửa và thử lại.", { position: "bottom-right" }); }
    } catch { toast.error("Không thể đọc lại dữ liệu. Nội dung và key vẫn được giữ nguyên.", { position: "bottom-right" }); }
    finally { if (!completed) { savingRef.current = false; releaseSubmission(lock); setSaving(false); } }
  }

  function changeField(key: Field, value: string) {
    const nextFields = { ...fields, [key]: value };
    dirtyRef.current = initialDraft.current !== null && serializeDraft(nextFields, selected) !== initialDraft.current;
    setFields(nextFields);
    setErrors(current => {
      const next = { ...current };
      if (key === "sourceUrl") {
        const parsed = sourceUrlSchema.safeParse(value);
        if (parsed.success) delete next.sourceUrl;
        else next.sourceUrl = parsed.error.issues[0]?.message ?? "Liên kết nguồn phải là URL http/https hợp lệ.";
      } else delete next[key];
      return next;
    });
  }

  function changeSelected(next: Selected) {
    dirtyRef.current = initialDraft.current !== null && serializeDraft(fields, next) !== initialDraft.current;
    setSelected(next);
  }

  const field = (key: Field, label: string, maxLength: number) => <div className="destination-field" key={key}>
    <label htmlFor={`culture-${key}`}>{label}</label>
    {key === "content" ? <textarea id={`culture-${key}`} rows={7} value={fields[key]} maxLength={maxLength} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `culture-error-${key}` : undefined} onChange={event => changeField(key, event.target.value)} /> : <input id={`culture-${key}`} value={fields[key]} maxLength={maxLength} placeholder={key === "sourceTitle" ? "Ví dụ: Cổng thông tin du lịch Hà Giang" : key === "sourceUrl" ? "https://..." : undefined} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `culture-error-${key}` : undefined} onChange={event => changeField(key, event.target.value)} />}
    {errors[key] && <p id={`culture-error-${key}`} className="destination-error" role="alert">{errors[key]}</p>}
  </div>;

  return <main className="destination-page culture-page culture-form-page"><div className="destination-container destination-form-container">
    <CulturePageHeader mode={id ? "edit" : "create"} canGoBack={!saving && !unknown && !visibilityAction.busy} />
    {loading ? <LoadingState>Đang tải biểu mẫu…</LoadingState> : loadError ? <div className="destination-card destination-state" role="alert"><p>{loadError}</p><button type="button" onClick={() => setReload(value => value + 1)}>Thử tải lại</button></div> : <>
      {unknown && <div className="destination-uncertain" role="alert"><AlertTriangle aria-hidden="true" /><p>Chưa xác định kết quả lưu. Thử lại sẽ đọc dữ liệu rồi gửi cùng nội dung/key; việc đọc lại không xác nhận thao tác đã thành công.</p></div>}
      {visibilityAction.feedback}
      <form method="post" noValidate onSubmit={event => void submit(event)}>
        <fieldset className="destination-form-fields" disabled={saving || unknown || visibilityAction.busy}>
          <section className="destination-card"><SectionHeading icon={BookOpen} title="Nội dung" description="Tiêu đề và nội dung văn hóa. Các trường có * là bắt buộc." />{field("title", "Tiêu đề *", 200)}{field("content", "Nội dung văn hóa *", 20000)}</section>
          <section className="destination-card culture-destination-section"><SectionHeading icon={MapPin} title="Điểm đến liên quan" description="Chọn một hoặc nhiều điểm đến phù hợp với nội dung. Không bắt buộc." /><DestinationPicker selected={selected} onChange={changeSelected} />{errors.destinationIds && <p className="destination-error" role="alert">{errors.destinationIds}</p>}</section>
          <section className="destination-card"><SectionHeading icon={Link2} title="Nguồn" description="Nguồn tham khảo hoặc liên kết khi có. Không bắt buộc URL nếu đã có tên nguồn." /><div className="destination-grid">{field("sourceTitle", "Tên nguồn", 300)}{field("sourceUrl", "Liên kết nguồn", 2000)}</div></section>
        </fieldset>
        {id ? <section className="destination-card destination-visibility"><SectionHeading icon={ShieldCheck} title="Trạng thái hiển thị" description="Ẩn/hiển thị là thao tác riêng, không lưu cùng nội dung." />{visibilityAction.action({ id, title: fields.title, visibility }, saving || unknown)}</section> : <section className="culture-create-status" aria-label="Trạng thái sau khi tạo">
          <div className="culture-create-status-copy"><span className="culture-create-status-icon"><Eye size={18} aria-hidden="true" /></span><div><strong>Trạng thái sau khi tạo</strong><p>Nội dung mới được tạo ở trạng thái ẩn. Bạn có thể công khai nội dung sau khi tạo.</p></div></div>
          <VisibilityBadge visibility="HIDDEN" />
        </section>}
        <div className="destination-form-actions"><p>{saving ? id ? "Đang lưu nội dung..." : "Đang tạo nội dung..." : unknown ? "Nội dung được giữ nguyên để thử lại an toàn." : dirty ? "Các thay đổi chưa được lưu." : id ? "Chưa có thay đổi chưa lưu." : "Nội dung mới sẽ được tạo ở trạng thái ẩn."}</p><div className="destination-action-buttons">{!saving && !unknown && !visibilityAction.busy && <Link className="destination-button" href="/admin/culture">Hủy</Link>}<button type="submit" className="destination-primary" disabled={saving || visibilityAction.busy} aria-busy={saving}>{saving ? <LoaderCircle size={17} className="destination-spinner" aria-hidden="true" /> : id ? <Save size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{saving ? id ? "Đang lưu..." : "Đang tạo..." : unknown ? "Đọc lại và thử lại" : id ? "Lưu thay đổi" : "Tạo nội dung văn hóa"}</button></div></div>
      </form>
    </>}
    <dialog ref={leaveDialog} className="destination-confirm culture-leave-dialog" aria-labelledby="culture-leave-title" aria-describedby="culture-leave-description" onCancel={event => { event.preventDefault(); stayOnForm(); }}>
      <h2 id="culture-leave-title">Bạn có thay đổi chưa được lưu.</h2><p id="culture-leave-description">Bạn có chắc muốn rời trang?</p>
      <div><button type="button" autoFocus onClick={stayOnForm}>Ở lại</button><button type="button" className="destination-primary" onClick={leaveForm}>Rời trang</button></div>
    </dialog>
  </div></main>;
}
