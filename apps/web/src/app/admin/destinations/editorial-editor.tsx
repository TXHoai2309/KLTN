"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronRight, Ellipsis, History, RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@KLTN/ui/components/dropdown-menu";
import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import { AdminAlert, AdminLoadingState } from "@/components/admin/admin-form-shell";
import EditorialRenderer from "@/components/editorial/editorial-renderer";
import { autoLayoutV2, getAllLayoutNodes, resolveEditorial, resolveEditorialDisplay } from "@/modules/destination-editorial/editorial-engine";
import { isDestinationMediaUsable } from "@/modules/destination/destination-media-eligibility";
import {
  editorialActionSchema,
  editorialBlockSchema,
  editorialLayoutSchema,
  editorialStateSchema,
  variants,
  blockTypes,
  isV1Layout,
  isV2Layout,
  v2Typography,
  v2Palettes,
  v2Rhythms,
  containerWidths,
  type EditorialBlock,
  type EditorialLayout,
  type EditorialLayoutV1,
  type EditorialLayoutV2,
  type EditorialNodeV2,
  type EditorialState,
  defaultEditorialDesign,
  type EditorialDesign,
  type EditorialDesignTokens,
} from "@/modules/destination-editorial/editorial-contract";
import { acceptedEditorialProposal } from "@/modules/destination-editorial/editorial-proposal-result";
import { AI_LAYOUT_PRESERVED } from "@/modules/destination-editorial/editorial-display-policy";
import { editorialHeroPlan, heroCompositionLabels, heroFocalLocked } from "@/modules/destination-editorial/editorial-hero";
import { editorialRetryAfter, editorial429Message } from "@/modules/destination-editorial/editorial-retry-after";
import "./destination-v3.css";
import "./editorial-editor.css";
import "./editorial-actions.css";
import "@/components/editorial/editorial.css";

type Action = "SAVE" | "PUBLISH" | "RESTORE_DRAFT" | "ROLLBACK";

const labels: Record<typeof blockTypes[number], string> = {
  HERO: "Ảnh mở đầu",
  INTRO: "Lời dẫn",
  TEXT_SECTION: "Đoạn thuyết minh",
  IMAGE_TEXT_SPLIT: "Ảnh / chữ song song",
  FULL_WIDTH_IMAGE: "Ảnh toàn chiều rộng",
  IMAGE_GRID: "Lưới ảnh",
  IMAGE_GALLERY: "Thư viện ảnh",
  HIGHLIGHT_FACTS: "Thông tin nổi bật",
  TIMELINE: "Dấu mốc có nguồn",
  QUOTE: "Trích dẫn có nguồn",
  VISIT_INFORMATION: "Thông tin tham quan chuẩn",
  MAP: "Bản đồ",
  SOURCES: "Nguồn tham khảo",
};

const v2Labels: Record<string, string> = {
  PAGE: "Trang",
  SECTION: "Phần nội dung",
  GRID: "Lưới bố cục",
  STACK: "Khối xếp tầng",
  COLUMNS: "Cột song song",
  CONTAINER: "Hộp chứa",
  HEADING: "Tiêu đề",
  PARAGRAPH: "Đoạn văn",
  LEAD: "Lời mở đầu",
  QUOTE: "Trích dẫn",
  FACTS: "Điểm nhấn",
  TIMELINE: "Dấu mốc thời gian",
  IMAGE: "Hình ảnh",
  PANORAMA: "Toàn cảnh",
  IMAGE_TEXT: "Ảnh và chữ",
  GALLERY: "Thư viện ảnh",
  IMAGE_MOSAIC: "Ảnh mosaic",
  HERO: "Ảnh mở đầu",
  MAP: "Bản đồ",
  SOURCES: "Nguồn tham khảo",
  VISIT_INFORMATION: "Thông tin tham quan",
};

const v2TypeStyleLabels: Record<string, string> = {
  LITERARY: "Văn chương cổ điển (Lora / Serif)",
  MODERN: "Hiện đại sắc nét (Geist / Sans)",
  HUMANIST: "Nhân văn ấm áp (Be Vietnam Pro)",
  EDITORIAL_SERIF: "Tạp chí cao cấp (Editorial Serif)",
  GEOMETRIC_SANS: "Hình học tối giản (Geometric Sans)",
};

const v2PaletteLabels: Record<string, string> = {
  FOREST: "Rừng xanh (Forest Green)",
  SLATE: "Đá phiến xám (Slate Grey)",
  EARTH: "Đất trầm ấm (Muted Earth)",
  MONOCHROME: "Đơn sắc tinh giản (Monochrome)",
  TERRACOTTA: "Đất nung (Terracotta)",
  INDIGO: "Chàm sâu thẳm (Deep Indigo)",
};

const v2RhythmLabels: Record<string, string> = {
  IMMERSIVE: "Đắm chìm thoáng đãng (Immersive)",
  COMPACT: "Gọn gàng súc tích (Compact)",
  RELAXED: "Thư thái nhịp nhàng (Relaxed)",
  STACCATO: "Dồn dập ấn tượng (Staccato)",
};

const containerWidthLabels: Record<string, string> = {
  NARROW: "Hẹp thanh lịch (Narrow · 780px)",
  STANDARD: "Chuẩn tạp chí (Standard · 1080px)",
  WIDE: "Rộng toàn cảnh (Wide · 1360px)",
  FULL: "Toàn màn hình (Full Bleed)",
};
export default function EditorialEditor({ id }: { id: string }) {
  const [state, setState] = useState<EditorialState>();
  const [layout, setLayout] = useState<EditorialLayout>();
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiCooldownUntil, setAiCooldownUntil] = useState(0);
  const [aiClock, setAiClock] = useState(Date.now);
  const aiWaitSeconds = Math.max(0, Math.ceil((aiCooldownUntil - aiClock) / 1000));
  useEffect(() => {
    if (!aiCooldownUntil) return;
    const timer = setInterval(() => { const now = Date.now(); setAiClock(now); if (now >= aiCooldownUntil) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [aiCooldownUntil]);
  const [unknown, setUnknown] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState("");
  const [mobile, setMobile] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<"PUBLISH" | "ROLLBACK" | null>(null);
  const [newType, setNewType] = useState<typeof blockTypes[number]>("TEXT_SECTION");
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const history = useRef<EditorialLayout[]>([]);
  const lock = useRef(false);
  const attempt = useRef<{ key: string; body: unknown } | null>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const dirty = Boolean(layout && JSON.stringify(layout) !== baseline);
  useUnsavedChanges(dirty, busy || unknown);
  function accept(value: EditorialState) {
    const next = value.draft ?? autoLayoutV2(value.context);
    setState(value); setLayout(next); setBaseline(JSON.stringify(next));
    const firstId = isV2Layout(next) ? next.sections[0]?.id : next.blocks[0]?.id;
    setSelected(firstId ?? ""); history.current = [];
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setMessage("");
    void fetch(`/api/admin/destinations/${encodeURIComponent(id)}/editorial`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async r => { const b = await r.json(); if (!r.ok || !b.success) throw Error(); return editorialStateSchema.parse(b.data); })
      .then(value => { if (!controller.signal.aborted) accept(value); })
      .catch(() => { if (!controller.signal.aborted) setMessage("Không thể tải bản biên tập. Kiểm tra phiên Admin và thử lại."); });
    return () => { mounted.current = false; controller.abort(); request.current?.abort(); };
  }, [id, reload]);
  function edit(next: EditorialLayout) {
    if (busy || unknown || !layout) return;
    history.current = [...history.current.slice(-19), layout];
    setLayout(next); setMessage("");
  }
  function changeBlock(change: Partial<EditorialBlock> & Record<string, any>) {
    if (!layout) return;
    if (isV2Layout(layout)) {
      const updateNodes = (nodes: EditorialNodeV2[]): EditorialNodeV2[] => {
        return nodes.map(n => {
          if (n.id === selected) {
            return { ...n, ...change,
              ...(change.title !== undefined || change.text !== undefined ? { locked: true, contentRef: null, headingProvenance: undefined } : {}),
            } as EditorialNodeV2;
          }
          if (n.children?.length) {
            return { ...n, children: updateNodes(n.children) };
          }
          return n;
        });
      };
      edit({
        ...layout,
        sections: updateNodes(layout.sections),
      });
      return;
    }
    const focalEdit = layout.blocks.find(b => b.id === selected)?.type === "HERO" && (change.focalX !== undefined || change.focalY !== undefined || change.crop !== undefined);
    edit({ ...layout, ...(focalEdit ? { hero: { composition: layout.hero?.composition ?? layout.variant, locked: layout.hero?.locked ?? false, focalLocked: true } } : {}), blocks: layout.blocks.map(b => b.id === selected ? { ...b, ...change, ...(change.title !== undefined || change.text !== undefined ? { headingProvenance: undefined } : {}) } : b) });
  }
  function changeDesign(change: Partial<EditorialDesignTokens>) {
    if (!layout) return;
    if (isV2Layout(layout)) {
      edit({
        ...layout,
        design: {
          typography: (change.typography ?? layout.design?.typography ?? "LITERARY") as EditorialDesignTokens["typography"],
          palette: (change.palette ?? layout.design?.palette ?? "FOREST") as EditorialDesignTokens["palette"],
          rhythm: (change.rhythm ?? layout.design?.rhythm ?? "IMMERSIVE") as EditorialDesignTokens["rhythm"],
          containerWidth: (change.containerWidth ?? layout.design?.containerWidth ?? "STANDARD") as EditorialDesignTokens["containerWidth"],
        },
      });
      return;
    }
    const v1Layout = layout as EditorialLayoutV1;
    edit({
      ...v1Layout,
      design: {
        ...(v1Layout.design ?? defaultEditorialDesign),
        ...(change.typography && ["LITERARY", "MODERN", "HUMANIST"].includes(change.typography) ? { typography: change.typography as EditorialDesign["typography"] } : {}),
        ...(change.palette && ["FOREST", "SLATE", "EARTH"].includes(change.palette) ? { palette: change.palette as EditorialDesign["palette"] } : {}),
        ...(change.rhythm && ["IMMERSIVE", "COMPACT"].includes(change.rhythm) ? { rhythm: change.rhythm as EditorialDesign["rhythm"] } : {}),
      },
    });
  }
  function move(index: number, direction: number) {
    if (!layout) return;
    if (isV2Layout(layout)) {
      const next = [...layout.sections];
      const other = index + direction;
      if (other < 0 || other >= next.length) return;
      [next[index], next[other]] = [next[other]!, next[index]!];
      edit({ ...layout, sections: next });
      return;
    }
    const next = [...layout.blocks];
    const other = index + direction;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other]!, next[index]!];
    edit({ ...layout, blocks: next });
  }
  async function mutate(action: Action, confirmed = false) {
    if (lock.current || !state || !layout) return;
    const body = unknown && attempt.current ? attempt.current.body : { action, expectedRevision: state.draftRevision, ...(action === "SAVE" ? { layout } : {}), ...(["PUBLISH", "ROLLBACK"].includes(action) ? { reviewed: confirmed } : {}) };
    const parsed = editorialActionSchema.safeParse(body);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Bố cục không hợp lệ."); return; }
    const current = unknown && attempt.current ? attempt.current : { key: createIdempotencyKey(), body: parsed.data };
    attempt.current = current; lock.current = true; setBusy(true); setMessage("");
    request.current = new AbortController();
    try {
      const result = await sendIdempotentMutation<unknown>(`/api/admin/destinations/${encodeURIComponent(id)}/editorial`, { idempotencyKey: current.key, init: { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current.body), signal: AbortSignal.any([request.current.signal, AbortSignal.timeout(30_000)]) } });
      if (!mounted.current) return;
      if (result.status === "SUCCESS") {
        const confirmed = editorialStateSchema.safeParse(result.data);
        if (!confirmed.success) { setUnknown(true); setMessage("Phản hồi chưa xác định. Thử lại cùng key."); return; }
        accept(confirmed.data); attempt.current = null; setUnknown(false);
        const feedback = action === "SAVE" ? "Đã lưu bản nháp." : action === "PUBLISH" ? "Đã xuất bản bố cục; trạng thái Destination giữ nguyên." : "Đã khôi phục phiên bản.";
        setMessage(feedback); toast.success(feedback, { id: "editorial-write" });
      } else if (result.status === "UNKNOWN") { setUnknown(true); setMessage("Kết quả chưa xác định. Giữ nguyên nội dung và key; bấm Đọc lại và thử lại."); }
      else { setUnknown(false); attempt.current = null; setMessage(result.error.message); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function aiProposal(mode: "PROPOSE" | "ALTERNATIVE" = "PROPOSE") {
    if (!state || !layout || lock.current || unknown || Date.now() < aiCooldownUntil) return;
    lock.current = true; setBusy(true); setGenerating(true); request.current = new AbortController(); setMessage("");
    try {
      const r = await fetch(`/api/admin/destinations/${encodeURIComponent(id)}/editorial/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout,
          direction: "AUTO",
          mode,
          expectedRevision: state.draftRevision,
          version: 2,
          timeoutMs: 240_000,
        }),
        signal: AbortSignal.any([request.current.signal, AbortSignal.timeout(285_000)])
      });
      const body = await r.json().catch(() => null);
      if (r.status === 429) {
        if (mounted.current) {
          const now = Date.now(), seconds = editorialRetryAfter(r.headers.get("Retry-After"), now);
          setAiClock(now); setAiCooldownUntil(seconds !== undefined ? now + seconds * 1000 : 0);
          setMessage(editorial429Message(body?.error?.code, body?.error?.details?.providerCode));
        }
        return;
      }
      if (!r.ok || !body?.success) {
        if (mounted.current) setMessage(["EDITORIAL_AI_IN_PROGRESS", "EDITORIAL_AI_BUSY"].includes(body?.error?.code) ? body.error.message : AI_LAYOUT_PRESERVED);
        return;
      }
      const data = body.data;
      if (data.outcome === "PROPOSED_SAME" || data.outcome === "FALLBACK_UNCHANGED") {
        if (mounted.current) setMessage(data.reason || "Bố cục hiện tại đã tối ưu; giữ nguyên phương án.");
        return;
      }
      if (data.status === "FALLBACK" || ["VALIDATION_FAILED", "PROVIDER_FAILED", "LOCAL_INVALID_SCHEMA", "OPENAI_SCHEMA_REJECTED", "LLM_PROVIDER_ERROR", "INVALID_MODEL_OUTPUT", "TITLE_PROVENANCE", "MEDIA_PROVENANCE", "SCHEMA_VALIDATION", "STALE_LAYOUT"].includes(data.outcome)) {
        if (mounted.current) setMessage(data.reason || AI_LAYOUT_PRESERVED);
        return;
      }
      const next = acceptedEditorialProposal(data, layout, state.context, "AUTO", mode);
      if (!next) { if (mounted.current) setMessage(AI_LAYOUT_PRESERVED); return; }
      if (mounted.current) { if (layout) history.current = [...history.current.slice(-19), layout]; setLayout(next); setMessage(data.reason); }
    } catch { if (mounted.current) setMessage(AI_LAYOUT_PRESERVED); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setGenerating(false); } }
  }
  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (confirmationAction && dialog && !dialog.open) dialog.showModal();
    if (!confirmationAction && dialog?.open) dialog.close();
  }, [confirmationAction]);
  const active = layout ? (isV2Layout(layout) ? getAllLayoutNodes(layout).find(b => b.id === selected) : layout.blocks.find(b => b.id === selected)) : null;
  const disabled = busy || unknown;
  const previewLayout = layout;
  const preview = state && previewLayout ? resolveEditorial(previewLayout, state.context) : null;
  const heroImage = preview?.media.find(m => {
    const heroNode = getAllLayoutNodes(preview.layout).find(b => b.type === "HERO");
    return heroNode && m.id === heroNode.mediaIds?.[0];
  });
  const heroPlan = layout ? editorialHeroPlan(layout, heroImage) : null;
  const displayIssues = state && layout && isV1Layout(layout) ? resolveEditorialDisplay(layout, state.context).issues : [];
  const displayReason = { ADMIN_HIDDEN: "Admin chủ động ẩn", EMPTY_CONTENT: "Tự ẩn · Chưa có nội dung hoặc tham chiếu đủ điều kiện", DUPLICATE_BLOCK: "Tự ẩn · Thông tin đã xuất hiện trong block khác" };
  if (!state || !layout) return <div className="af-root dv3-page"><main className="dv3-main">{message ? <AdminAlert variant="error">{message}<button className="af-btn" onClick={() => setReload(n => n + 1)}>Thử lại</button></AdminAlert> : <AdminLoadingState>Đang tải bản biên tập…</AdminLoadingState>}</main></div>;
  return <div className="af-root dv3-page ed-page">
    <header className="ed-topbar"><Link href={`/admin/destinations/${id}/edit`}>← Chỉnh sửa điểm đến</Link><h1 className="ed-sr-only">Thiết kế trang giới thiệu</h1>
      <nav className="ed-action-flow" aria-label="Quy trình xuất bản">
          <span aria-current={dirty || !state.draft ? "step" : undefined} className={!dirty && state.draft ? "is-complete" : ""}><span>{!dirty && state.draft ? <Check size={12} aria-hidden="true" /> : "1"}</span>Lưu nháp</span>
          <ChevronRight size={14} aria-hidden="true" />
          <button type="button" aria-current={!dirty && state.draft && !confirmationAction ? "step" : undefined} disabled={disabled || dirty || !state.available || !state.draft} onClick={() => setConfirmationAction("PUBLISH")}><span>{confirmationAction ? <Check size={12} aria-hidden="true" /> : "2"}</span>Kiểm duyệt</button>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current={Boolean(confirmationAction) && !dirty ? "step" : undefined}><span>3</span>Xuất bản</span>
        </nav></header>
    {(!state.available || state.contentChanged || message) && <div className="ed-alert-banner">
      {!state.available && <AdminAlert variant="warning">{state.reason} Preview và dàn trang vẫn dùng được; chưa thể lưu/xuất bản.</AdminAlert>}
      {state.contentChanged && <AdminAlert variant="warning">Hồ sơ hoặc quyền ảnh đã thay đổi từ lần lưu. Kiểm tra preview và tham chiếu trước khi xuất bản.</AdminAlert>}
      {message && <div role="status" className="ed-feedback">{message}</div>}
    </div>}
    <main className="ed-main">
      <div className="ed-workspace">
        {/* CỘT 1: NHỊP TRANG & BLOCK FORM (Bên trái) */}
        <section className="ed-column ed-col-blocks ed-controls" aria-label="Điều chỉnh bố cục">
          <div className="ed-col-nav">
            <div className="ed-col-nav-meta">
              <span className="ed-col-nav-badge">1</span>
              <div>
                <h3 className="ed-col-title">Nhịp trang</h3>
                <p className="ed-col-sub">Cấu trúc & nội dung {isV2Layout(layout) ? "node" : "block"}</p>
              </div>
            </div>
            <span className="ed-badge-count">{isV2Layout(layout) ? `${layout.sections.length} section` : `${layout.blocks.length} block`}</span>
          </div>

          <div className="ed-col-body">
            <div className="ed-col-intro">
              <h2>Nhịp trang</h2>
              <p className="af-helper">Chọn {isV2Layout(layout) ? "section" : "block"} để sửa. Thay đổi chưa lưu không xuất hiện công khai.</p>
            </div>
            {isV2Layout(layout) ? (
              <ol className="ed-block-list">
                {layout.sections.map((sec, i) => (
                  <li key={sec.id} className={selected === sec.id ? "is-selected" : ""}>
                    <button
                      type="button"
                      disabled={disabled}
                      className="ed-block-select"
                      aria-pressed={selected === sec.id}
                      onClick={() => setSelected(sec.id)}
                    >
                      {v2Labels[sec.type] || sec.type}
                      {sec.title ? ` · ${sec.title.slice(0, 20)}` : ""}
                      {sec.hidden ? " · Admin ẩn" : ""}
                    </button>
                    <div>
                      <button type="button" className="af-btn" disabled={disabled || !i} aria-label={`Đưa section ${i + 1} lên`} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="af-btn" disabled={disabled || i === layout.sections.length - 1} aria-label={`Đưa section ${i + 1} xuống`} onClick={() => move(i, 1)}>↓</button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="ed-block-list">{layout.blocks.map((b, i) => <li key={b.id} className={selected === b.id ? "is-selected" : ""}>
                <button type="button" disabled={disabled} className="ed-block-select" aria-pressed={selected === b.id} onClick={() => setSelected(b.id)}>{labels[b.type]}{b.hidden ? " · Admin ẩn" : displayIssues.some(issue => issue.blockId === b.id) ? " · Tự ẩn" : ""}</button>
                <div><button type="button" className="af-btn" disabled={disabled || !i} aria-label={`Đưa block ${i + 1} lên`} onClick={() => move(i, -1)}>↑</button><button type="button" className="af-btn" disabled={disabled || i === layout.blocks.length - 1} aria-label={`Đưa block ${i + 1} xuống`} onClick={() => move(i, 1)}>↓</button></div>
              </li>)}</ol>
            )}
            {!isV2Layout(layout) && (
              <div className="ed-add"><label htmlFor="editorial-new-block">Thêm block</label><select id="editorial-new-block" className="af-select" value={newType} disabled={disabled} onChange={e => setNewType(e.target.value as typeof newType)}>{blockTypes.filter(t => t !== "VISIT_INFORMATION").map(t => <option value={t} key={t}>{labels[t]}</option>)}</select><button type="button" className="af-btn" disabled={disabled || layout.blocks.length >= 30} onClick={() => { const b = editorialBlockSchema.parse({ id: crypto.randomUUID(), type: newType }); edit({ ...layout, blocks: [...layout.blocks, b] }); setSelected(b.id); }}>Thêm</button></div>
            )}
            {active && <fieldset disabled={disabled} className="ed-fields"><legend>{isV2Layout(layout) ? (v2Labels[active.type] || active.type) : labels[active.type as typeof blockTypes[number]]}</legend>
              {displayIssues.filter(issue => issue.blockId === active.id).map(issue => <p className="af-helper" key={issue.reason}>{displayReason[issue.reason]}. Block vẫn được giữ để chỉnh sửa; bổ sung dữ liệu hợp lệ để hiện trong Preview/Public.</p>)}
              <label><input type="checkbox" checked={!active.hidden} onChange={e => changeBlock({ hidden: !e.target.checked })} /> Hiển thị {isV2Layout(layout) ? "node" : "block"}</label>
              <label htmlFor="editorial-title">Tiêu đề phụ</label><input id="editorial-title" className="af-input" maxLength={200} value={active.title ?? ""} onChange={e => changeBlock({ title: e.target.value })} />
              {active.type === "HERO" && <>
                <label htmlFor="editorial-hero-composition">Bố cục mở đầu</label>
                <select id="editorial-hero-composition" className="af-select" value={layout.hero?.composition ?? (isV1Layout(layout) ? layout.variant : "PANORAMA")} onChange={e => edit({ ...layout, hero: { composition: e.target.value as "PANORAMA" | "SPLIT" | "EDITORIAL", locked: true } })}>{variants.map(v => <option key={v} value={v}>{heroCompositionLabels[v]}</option>)}</select>
                <label><input type="checkbox" checked={layout.hero?.locked ?? false} onChange={e => edit({ ...layout, hero: { composition: layout.hero?.composition ?? (isV1Layout(layout) ? layout.variant : "PANORAMA"), locked: e.target.checked } })} /> Giữ bố cục mở đầu khi dùng AI</label>
                <label><input type="checkbox" checked={heroFocalLocked(layout)} onChange={e => edit({ ...layout, hero: { composition: layout.hero?.composition ?? (isV1Layout(layout) ? layout.variant : "PANORAMA"), locked: layout.hero?.locked ?? false, focalLocked: e.target.checked } })} /> Giữ ảnh và điểm lấy nét khi dùng AI</label>
                {heroPlan?.reason && <p className="af-helper" role="note">{heroPlan.reason === "LOW_RESOLUTION" ? `Ảnh gốc ${heroImage?.width} × ${heroImage?.height}px: giới hạn kích thước để giữ nét${heroPlan.composition !== heroPlan.requested ? ", trình bày theo trang bìa" : ""}. Chọn ảnh lớn hơn để mở rộng khung hình.` : heroPlan.reason === "UNKNOWN_RESOLUTION" ? "Chưa có kích thước ảnh gốc; ảnh được giới hạn độ rộng an toàn. Chọn ảnh có thông tin kích thước để tối ưu phần mở đầu." : "Ảnh dọc được trình bày cạnh lời dẫn để giữ chủ thể. Bố cục đã lưu không bị thay đổi."}</p>}
                <label htmlFor="editorial-deck">Dòng dẫn ngắn dưới tiêu đề</label><textarea id="editorial-deck" className="af-textarea resize-none" rows={3} maxLength={130} value={active.deck ?? ""} onChange={e => changeBlock({ deck: e.target.value })} />
              </>}
              {["INTRO", "TEXT_SECTION", "IMAGE_TEXT_SPLIT", "IMAGE_TEXT", "PARAGRAPH", "LEAD"].includes(active.type) && <label>Nhấn mạnh đoạn<select className="af-select" aria-label="Nhấn mạnh đoạn" value={active.emphasis ?? "STANDARD"} onChange={e => changeBlock({ emphasis: e.target.value as "STANDARD" | "FEATURED" })}><option value="STANDARD">Thông thường</option><option value="FEATURED">Nhấn nhẹ</option></select></label>}
              {!["MAP", "VISIT_INFORMATION", "SOURCES", "HIGHLIGHT_FACTS", "FACTS", "IMAGE_GRID", "IMAGE_GALLERY", "GALLERY", "IMAGE_MOSAIC", "FULL_WIDTH_IMAGE", "PANORAMA", "TIMELINE"].includes(active.type) && <><label htmlFor="editorial-text">Nội dung editorial</label><textarea id="editorial-text" className="af-textarea resize-none" maxLength={12000} rows={7} value={active.text ?? ""} onChange={e => changeBlock({ text: e.target.value })} /></>}
              {["HERO", "IMAGE_TEXT_SPLIT", "IMAGE_TEXT", "FULL_WIDTH_IMAGE", "PANORAMA", "IMAGE_GRID", "IMAGE_GALLERY", "GALLERY", "IMAGE_MOSAIC", "IMAGE"].includes(active.type) && <>
                <p className="af-helper">Chọn ảnh trong thư viện điểm đến. Mỗi ảnh xuất hiện một lần.</p>
                <div className="ed-media-picker">{state.context.media.map(m => {
                  const mediaArr = active.mediaIds ?? [];
                  const allOtherMedia = getAllLayoutNodes(layout).filter(b => b.id !== active.id).flatMap(b => b.mediaIds ?? []);
                  const isUsedElsewhere = allOtherMedia.includes(m.id);
                  return <label key={m.id}><input type="checkbox" checked={mediaArr.includes(m.id)} disabled={!isDestinationMediaUsable(m, state.context.id) || (isUsedElsewhere && !mediaArr.includes(m.id))} onChange={e => changeBlock({ mediaIds: e.target.checked ? active.type === "HERO" ? [m.id] : [...mediaArr, m.id] : mediaArr.filter(v => v !== m.id) })} /><span>{m.alt}{!isDestinationMediaUsable(m, state.context.id) ? " · Không dùng trên website" : ""}</span></label>;
                })}</div>
                <label htmlFor="editorial-caption">Chú thích hiển thị</label><input id="editorial-caption" className="af-input" maxLength={1000} value={active.caption ?? ""} onChange={e => changeBlock({ caption: e.target.value })} />
                <label>Vị trí ảnh<select className="af-select" aria-label="Vị trí ảnh" value={active.placement ?? "left"} onChange={e => changeBlock({ placement: e.target.value as any })}><option value="left">Trái</option><option value="right">Phải</option><option value="full">Toàn chiều rộng</option></select></label>
                <label>Crop<select className="af-select" aria-label="Crop" value={active.crop ?? "wide"} onChange={e => changeBlock({ crop: e.target.value as any })}><option value="wide">Ngang</option><option value="portrait">Dọc</option><option value="square">Vuông</option><option value="original">Giữ trọn ảnh</option></select></label>
                {(["focalX", "focalY"] as const).map(field => <label key={field} htmlFor={`editorial-${field}`}>Điểm lấy nét {field === "focalX" ? "ngang" : "dọc"}: {active[field] ?? 50}%<input id={`editorial-${field}`} type="range" min={0} max={100} value={active[field] ?? 50} onChange={e => changeBlock({ [field]: Number(e.target.value) })} /></label>)}
                {["IMAGE_GRID", "IMAGE_GALLERY", "GALLERY", "IMAGE_MOSAIC"].includes(active.type) && <label>Kiểu gallery<select className="af-select" aria-label="Kiểu gallery" value={active.gallery ?? "mosaic"} onChange={e => changeBlock({ gallery: e.target.value as any })}><option value="mosaic">Mosaic</option><option value="grid">Lưới cân đối</option><option value="strip">Dải ảnh</option></select></label>}
              </>}
              {["SOURCES", "QUOTE", "TIMELINE", "TEXT_SECTION", "PARAGRAPH"].includes(active.type) && <div className="ed-source-picker"><p>Nguồn liên quan đã duyệt</p>{state.context.sources.filter(s => s.websiteRights === "APPROVED").map(s => <label key={s.id}><input type="checkbox" checked={(active.sourceIds ?? []).includes(s.id)} onChange={e => changeBlock({ sourceIds: e.target.checked ? [...(active.sourceIds ?? []), s.id] : (active.sourceIds ?? []).filter(v => v !== s.id) })} />{s.title}</label>)}</div>}
              {active.type === "TIMELINE" && <div>{(active.entries ?? []).map((entry, i) => <div className="ed-timeline-entry" key={i}><label>Mốc thời gian<input className="af-input" value={entry.label} onChange={e => changeBlock({ entries: (active.entries ?? []).map((v, n) => n === i ? { ...v, label: e.target.value } : v) })} /></label><label>Thuyết minh<textarea className="af-textarea resize-none" value={entry.text} onChange={e => changeBlock({ entries: (active.entries ?? []).map((v, n) => n === i ? { ...v, text: e.target.value } : v) })} /></label><button className="af-btn" type="button" onClick={() => changeBlock({ entries: (active.entries ?? []).filter((_, n) => n !== i) })}>Gỡ mốc</button></div>)}<button type="button" className="af-btn" disabled={!(active.sourceIds ?? []).length || (active.entries ?? []).length >= 20} onClick={() => changeBlock({ entries: [...(active.entries ?? []), { label: "", text: "", sourceIds: active.sourceIds ?? [] }] })}>Thêm mốc từ nguồn đã chọn</button></div>}
              {!isV2Layout(layout) ? (
                <button type="button" className="af-btn" onClick={() => { edit({ ...layout, blocks: layout.blocks.filter(b => b.id !== active.id) }); setSelected(layout.blocks.find(b => b.id !== active.id)?.id ?? ""); }}>Gỡ block</button>
              ) : (
                <button type="button" className="af-btn" onClick={() => { edit({ ...layout, sections: layout.sections.filter(b => b.id !== active.id) }); setSelected(layout.sections.find(b => b.id !== active.id)?.id ?? ""); }}>Gỡ section</button>
              )}
            </fieldset>}
          </div>
        </section>

        {/* CỘT 2: LIVE PREVIEW (Ở giữa) */}
        <section className="ed-column ed-col-preview ed-preview-area" aria-label="Xem trước trang giới thiệu">
          <div className="ed-col-nav ed-col-nav-preview">
            <div className="ed-col-nav-meta">
              <span className="ed-col-nav-badge">2</span>
              <div>
                <h3 className="ed-col-title">Bản xem trước</h3>
                <p className="ed-col-sub">Trực tiếp e-magazine</p>
              </div>
            </div>
            <div className="ed-preview-tools">
              <div className="ed-device-buttons">
                <button className="af-btn" type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
                <button className="af-btn" type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
              </div>

            </div>
          </div>

          <div className="ed-col-body ed-preview-body">
            <div className={mobile ? "ed-preview is-mobile" : "ed-preview"}>
              {preview ? <EditorialRenderer data={state.context} editorial={preview} /> : <p className="ed-empty-preview">Chưa có block hợp lệ để xem trước.</p>}
            </div>
          </div>
        </section>

        {/* CỘT 3: XƯỞNG BIÊN TẬP (Bên phải) */}
        <section className="ed-column ed-col-workshop" aria-label="Xưởng biên tập">
          <div className="ed-col-nav">
            <div className="ed-col-nav-meta">
              <span className="ed-col-nav-badge">3</span>
              <div>
                <h3 className="ed-col-title">Xưởng biên tập</h3>
                <p className="ed-col-sub">AI dàn trang V4.0</p>
              </div>
            </div>
            <span className="ed-badge-count ed-badge-v4">V4.0</span>
          </div>

          <div className="ed-col-body">
            <div className="ed-toolbar" aria-busy={generating}>
              <div className="ed-direction-heading">
                <span className="ed-eyebrow">Xưởng biên tập</span>
                <h2>AI dàn trang</h2>
                <p>Phối nội dung và hình ảnh của điểm đến thành bài viết. Bạn có thể chỉnh lại trước khi lưu.</p>
              </div>
              {isV2Layout(layout) ? (
                <div className="ed-direction-fields">
                  <label>Kiểu chữ V4
                    <select className="af-select" disabled={disabled} value={layout.design?.typography ?? "LITERARY"} onChange={e => changeDesign({ typography: e.target.value as EditorialDesignTokens["typography"] })}>
                      {v2Typography.map(t => <option key={t} value={t}>{v2TypeStyleLabels[t] || t}</option>)}
                    </select>
                  </label>
                  <label>Bảng màu V4
                    <select className="af-select" disabled={disabled} value={layout.design?.palette ?? "FOREST"} onChange={e => changeDesign({ palette: e.target.value as EditorialDesignTokens["palette"] })}>
                      {v2Palettes.map(p => <option key={p} value={p}>{v2PaletteLabels[p] || p}</option>)}
                    </select>
                  </label>
                  <label>Nhịp trình bày
                    <select className="af-select" disabled={disabled} value={layout.design?.rhythm ?? "IMMERSIVE"} onChange={e => changeDesign({ rhythm: e.target.value as EditorialDesignTokens["rhythm"] })}>
                      {v2Rhythms.map(r => <option key={r} value={r}>{v2RhythmLabels[r] || r}</option>)}
                    </select>
                  </label>
                  <label>Độ rộng trang
                    <select className="af-select" disabled={disabled} value={layout.design?.containerWidth ?? "STANDARD"} onChange={e => changeDesign({ containerWidth: e.target.value as EditorialDesignTokens["containerWidth"] })}>
                      {containerWidths.map(w => <option key={w} value={w}>{containerWidthLabels[w] || w}</option>)}
                    </select>
                  </label>
                </div>
              ) : <p className="af-helper">Bố cục đã lưu vẫn được giữ nguyên. AI dàn trang sẽ tạo bản V4.0 để bạn xem trước khi lưu.</p>}
              {aiWaitSeconds > 0 && <p id="editorial-ai-cooldown" className="af-helper" aria-live="off">Có thể thử lại sau {Math.floor(aiWaitSeconds / 3600) > 0 ? `${Math.floor(aiWaitSeconds / 3600)} giờ ` : ""}{Math.floor(aiWaitSeconds % 3600 / 60) > 0 ? `${Math.floor(aiWaitSeconds % 3600 / 60)} phút ` : ""}{aiWaitSeconds % 60} giây. Bạn vẫn có thể chỉnh sửa bài viết.</p>}
              <div className="ed-compose-actions">
                <button
                  type="button"
                  className="af-btn af-btn-primary ed-ai-button"
                  disabled={disabled || aiWaitSeconds > 0}
                  aria-describedby={aiWaitSeconds > 0 ? "editorial-ai-cooldown" : undefined}
                  onClick={() => void aiProposal()}
                >
                  {generating ? "AI đang dàn trang…" : "AI dàn trang"}
                </button>
                <button type="button" className="af-btn" disabled={disabled || aiWaitSeconds > 0} aria-describedby={aiWaitSeconds > 0 ? "editorial-ai-cooldown" : undefined} onClick={() => void aiProposal("ALTERNATIVE")}>
                  Sinh phương án khác
                </button>
                <button type="button" className="af-btn" disabled={disabled || !history.current.length} onClick={() => { const old = history.current.pop(); if (old) { setLayout(old); setMessage("Đã hoàn tác thay đổi bố cục."); } }}>
                  Hoàn tác
                </button>
                <button type="button" className="af-btn" disabled={disabled || !dirty} onClick={() => { setLayout(JSON.parse(baseline)); history.current = []; }}>
                  Hủy thay đổi chưa lưu
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="ed-actions" aria-label="Lưu và xuất bản">
        <div className="ed-action-state" role="status">
          <span className={`ed-state-dot ${unknown ? "is-unknown" : dirty || !state.draft ? "is-dirty" : "is-saved"}`} aria-hidden="true" />
          <div><strong>{unknown ? "Chưa xác định kết quả" : dirty ? "Có thay đổi chưa lưu" : !state.draft ? "Bố cục chưa lưu" : "Bản nháp đã được lưu"}</strong><span>Nháp r{state.draftRevision} · Xuất bản r{state.publishedRevision}</span></div>

        </div>

        <div className="ed-action-buttons">
          <button type="button" className={`af-btn ${dirty || !state.draft || unknown ? "af-btn-primary" : ""}`} disabled={busy || !state.available} onClick={() => void mutate("SAVE")}><Save size={15} aria-hidden="true" />{unknown ? "Đọc lại và thử lại" : busy && !generating ? "Đang xử lý…" : "Lưu bản nháp"}</button>
          <button type="button" className={`af-btn ${!dirty && state.draft && !unknown ? "af-btn-primary" : ""}`} disabled={disabled || dirty || !state.available || !state.draft} onClick={() => setConfirmationAction("PUBLISH")}><Send size={15} aria-hidden="true" />Xuất bản bố cục</button>
          <DropdownMenu>
            <DropdownMenuTrigger className="af-btn ed-more-trigger" aria-label="Thao tác khác" disabled={busy || unknown}><Ellipsis size={20} aria-hidden="true" /></DropdownMenuTrigger>
            <DropdownMenuContent className="af-root ed-overflow-menu" side="top" align="end" sideOffset={12}>
              <DropdownMenuItem disabled={dirty} onClick={() => setReload(n => n + 1)}><RefreshCw size={16} aria-hidden="true" /><span>Đọc lại<small>Tải lại bản nháp đã lưu</small></span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={dirty || !state.available || !state.published} onClick={() => void mutate("RESTORE_DRAFT")}><RotateCcw size={16} aria-hidden="true" /><span>Khôi phục nháp từ bản xuất bản<small>Đưa bản đang công khai về bản nháp</small></span></DropdownMenuItem>
              <DropdownMenuItem disabled={dirty || !state.available || !state.previousPublished} onClick={() => setConfirmationAction("ROLLBACK")}><History size={16} aria-hidden="true" /><span>Khôi phục bản xuất bản trước<small>Xác nhận trước khi khôi phục</small></span></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <dialog ref={confirmationDialog} className="af-root ed-confirm-dialog" aria-labelledby="ed-confirm-title" aria-describedby="ed-confirm-description" onCancel={() => setConfirmationAction(null)} onClose={() => setConfirmationAction(null)}>
        <div className="ed-confirm-content">
          <span className="ed-confirm-icon" aria-hidden="true"><Send size={22} /></span>
          <h2 id="ed-confirm-title">{confirmationAction === "ROLLBACK" ? "Khôi phục bản xuất bản trước?" : "Xuất bản bố cục?"}</h2>
          <p id="ed-confirm-description">{confirmationAction === "ROLLBACK" ? "Bạn xác nhận đã kiểm tra nội dung, nguồn và quyền ảnh của phiên bản trước. Phiên bản này sẽ thay thế bố cục đang xuất bản." : "Bạn xác nhận đã xem trước và kiểm tra nội dung, nguồn và quyền ảnh. Bố cục đã lưu sẽ được xuất bản cho điểm đến này."}</p>
          <p className="ed-confirm-note">Trạng thái hiển thị của điểm đến được giữ nguyên.</p>
          <div className="ed-confirm-buttons"><button type="button" className="af-btn" onClick={() => setConfirmationAction(null)}>Hủy</button><button type="button" className="af-btn af-btn-primary" onClick={() => { const action = confirmationAction; setConfirmationAction(null); if (action) void mutate(action, true); }}>Xác nhận</button></div>
        </div>
      </dialog>
    </main>
  </div>;
}
