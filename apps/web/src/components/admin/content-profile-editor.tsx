"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { Textarea } from "@KLTN/ui/components/textarea";
import {
  createIdempotencyKey,
  sendIdempotentMutation,
} from "@/lib/mutation-client";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import {
  publicHttpsUrl,
  referenceId,
  sourceSchema,
  mediaSchema,
  type DestinationProfile,
  type CultureProfile,
  type ContentSourceInput,
  type ContentMediaInput,
} from "@/modules/content-profile/content-profile-contract";
import {
  BookOpen,
  MapPinned,
  Users,
  Images,
  ShieldCheck,
  Ticket,
  MapPin,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
} from "lucide-react";
import {
  AdminSectionHead,
  AdminChips,
  AdminCollapsibleSection,
  AdminHelper,
} from "./admin-form-shell";
const ProfileErrors = createContext<Record<string, string>>({});
type Profile = DestinationProfile | CultureProfile;
const lookupSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(
      z.object({
        id: referenceId,
        name: z.string().min(1).max(200),
        kind: z.string().optional(),
      }),
    ),
  }),
});
type Item = {
  id: string;
  name: string;
  kind?: string;
};
export function TaxonomyPicker({
  type,
  label,
  ids,
  onChange,
  onPendingChange,
}: {
  type: "AREA" | "COMMUNITY" | "CULTURE";
  label: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  onPendingChange?: (v: boolean) => void;
}) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("LOCALITY");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const attempt = useRef<{
    key: string;
    body: string;
  } | null>(null);

  const pendingRef = useRef(onPendingChange);
  pendingRef.current = onPendingChange;
  useEffect(() => {
    pendingRef.current?.(busy || uncertain);
    return () => pendingRef.current?.(false);
  }, [busy, uncertain]);

  const idsKey = ids.join(",");
  const names = useRef(new Map<string, string>());

  // Fetch items with abort controller & debounce
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void fetchAuthWithTimeout(
        "/api/admin/content-taxonomy?" +
          new URLSearchParams({ type, q, ids: idsKey }),
        { signal: controller.signal, cache: "no-store" },
      )
        .then(async (r) => {
          if (!r.ok)
            throw Error("Không thể tải danh sách. Kiểm tra phiên Admin.");
          return lookupSchema.parse(await r.json()).data.items;
        })
        .then((rows) => {
          rows.forEach((item) => names.current.set(item.id, item.name));
          setItems(rows);
          setLoading(false);
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(
              e instanceof Error ? e.message : "Không thể tải danh sách.",
            );
            setLoading(false);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [type, q, idsKey, reload]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({
        type,
        name: name.trim(),
        ...(type === "AREA" ? { kind } : {}),
      });
      if (!attempt.current || (!uncertain && attempt.current.body !== body))
        attempt.current = { key: createIdempotencyKey(), body };
      const result = await sendIdempotentMutation<Item>(
        "/api/admin/content-taxonomy",
        {
          idempotencyKey: attempt.current.key,
          init: {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json" },
            body: attempt.current.body,
          },
        },
      );
      if (
        result.status === "SUCCESS" &&
        z
          .object({ id: referenceId, name: z.string().min(1).max(200) })
          .safeParse(result.data).success
      ) {
        names.current.set(result.data.id, result.data.name);
        onChange([...new Set([...ids, result.data.id])]);
        attempt.current = null;
        setName("");
        setUncertain(false);
        setIsCreateOpen(false);
        setReload((v) => v + 1);
      } else if (result.status === "FAILED") {
        attempt.current = null;
        setUncertain(false);
        setError(result.error.message);
      } else {
        setUncertain(true);
        setError("Chưa xác định kết quả. Thử lại giữ nguyên tên và key.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  // Combined selectable rows (current query results + selected items not in current results)
  const allDisplayItems = [
    ...items,
    ...ids
      .filter((id) => !items.some((i) => i.id === id))
      .map((id) => ({
        id,
        name: names.current.get(id) ?? "Đang tải tên mục đã chọn…",
      })),
  ];

  // Contextual copy
  const entityConfig = {
    AREA: {
      desc: "Nội dung này thuộc địa phương hoặc vùng văn hóa nào?",
      placeholder: "Tìm địa phương, huyện, xã hoặc vùng văn hóa...",
      empty: "Không tìm thấy địa phương phù hợp.",
      createLabel: "+ Thêm địa phương chưa có",
      dialogTitle: "Thêm địa phương / vùng văn hóa mới",
    },
    COMMUNITY: {
      desc: "Nội dung này gắn với cộng đồng dân tộc nào?",
      placeholder: "Tìm cộng đồng dân tộc (H'Mông, Tày, Dao, Lô Lô...)...",
      empty: "Không tìm thấy cộng đồng dân tộc phù hợp.",
      createLabel: "+ Thêm cộng đồng chưa có",
      dialogTitle: "Thêm cộng đồng dân tộc mới",
    },
    CULTURE: {
      desc: "Điểm đến này liên quan đến nội dung văn hóa nào?",
      placeholder: "Tìm hồ sơ văn hóa liên quan...",
      empty: "Không tìm thấy hồ sơ văn hóa phù hợp.",
      createLabel: "",
      dialogTitle: "",
    },
  }[type];

  // Duplicate check for dialog
  const isDuplicateName =
    name.trim().length > 0 &&
    allDisplayItems.some(
      (item) => item.name.toLowerCase() === name.trim().toLowerCase(),
    );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < allDisplayItems.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : allDisplayItems.length - 1,
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const item = allDisplayItems[activeIndex];
      if (item) {
        const isSelected = ids.includes(item.id);
        if (isSelected) {
          onChange(ids.filter((id) => id !== item.id));
        } else if (ids.length < 30) {
          onChange([...ids, item.id]);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="af-field af-taxonomy-picker" ref={containerRef}>
      <div className="af-field-header" style={{ marginBottom: 6 }}>
        <label htmlFor={uid} className="af-label" style={{ marginBottom: 2 }}>
          {label}{" "}
          <span className="af-label-optional" aria-hidden="true">
            Tùy chọn
          </span>
        </label>
        <p className="af-helper" style={{ margin: 0, fontSize: 12 }}>
          {entityConfig.desc}
        </p>
      </div>

      {/* Selected Chips */}
      {ids.length > 0 && (
        <AdminChips
          items={ids.map((id) => ({
            id,
            label: names.current.get(id) ?? "Đang tải tên mục đã chọn…",
          }))}
          onRemove={(id) => onChange(ids.filter((v) => v !== id))}
        />
      )}

      {/* Combobox Search Input */}
      <div className="af-combobox" style={{ marginTop: ids.length > 0 ? 8 : 0 }}>
        <div
          className={`af-combobox-trigger${isOpen ? " is-focused" : ""}`}
          onClick={() => {
            setIsOpen(true);
            inputRef.current?.focus();
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{ color: "var(--af-muted)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id={uid}
            ref={inputRef}
            className="af-combobox-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            maxLength={200}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={`${uid}-listbox`}
            placeholder={entityConfig.placeholder}
          />
          {loading && (
            <span
              className="af-spinner"
              style={{
                width: 14,
                height: 14,
                display: "inline-block",
                border: "2px solid var(--af-muted)",
                borderTopColor: "transparent",
                borderRadius: "50%",
              }}
              aria-label="Đang tìm kiếm..."
            />
          )}
        </div>

        {/* Dropdown Results Panel */}
        {isOpen && (
          <div
            id={`${uid}-listbox`}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            className="af-combobox-panel"
          >
            {loading && items.length === 0 && (
              <div className="af-combobox-loading" role="status">
                Đang tải danh sách…
              </div>
            )}

            {error && (
              <div className="af-combobox-error" role="alert">
                <p style={{ margin: "0 0 6px" }}>{error}</p>
                <button
                  type="button"
                  className="af-btn"
                  style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setReload((v) => v + 1)}
                >
                  Thử tải lại
                </button>
              </div>
            )}

            {!loading && !error && allDisplayItems.length === 0 && (
              <div className="af-combobox-empty">
                <p style={{ margin: "0 0 6px" }}>{entityConfig.empty}</p>
                {type !== "CULTURE" && (
                  <button
                    type="button"
                    className="af-btn af-btn-dashed"
                    style={{ minHeight: 32, fontSize: 12, padding: "4px 10px" }}
                    onClick={() => {
                      setIsCreateOpen(true);
                      setName(q);
                    }}
                  >
                    + Tạo mục &quot;{q || "mới"}&quot; vào danh mục
                  </button>
                )}
              </div>
            )}

            {allDisplayItems.map((item, idx) => {
              const isSelected = ids.includes(item.id);
              const isOverLimit = !isSelected && ids.length >= 30;
              const isRegion = "kind" in item && item.kind === "REGION";

              return (
                <label
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`af-combobox-option${idx === activeIndex ? " is-active" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: isOverLimit ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={isOverLimit}
                    checked={isSelected}
                    aria-label={`${item.name}${isRegion ? " (Vùng văn hóa)" : ""}`}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...ids, item.id]
                          : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                    {item.name}
                    {isRegion && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 11,
                          color: "var(--af-muted)",
                          background: "var(--af-tint)",
                          padding: "1px 6px",
                          borderRadius: 4,
                        }}
                      >
                        Vùng văn hóa
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Helper text & Create action bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 6,
        }}
      >
        <p className="af-helper" style={{ margin: 0 }}>
          Đã chọn {ids.length}/30 mục. Có thể bỏ chọn bất kỳ lúc nào.
        </p>

        {type !== "CULTURE" && (
          <button
            type="button"
            className="af-btn af-btn-dashed"
            style={{ minHeight: 32, fontSize: 12, padding: "4px 10px" }}
            onClick={() => setIsCreateOpen(true)}
          >
            Tạo mục mới nếu chưa có trong danh sách
          </button>
        )}
      </div>

      {/* ── Safe Create Modal Dialog ───────────────────────────────────────── */}
      {type !== "CULTURE" && (
        <div
          className="af-create-taxonomy-wrap"
          style={{ display: isCreateOpen ? "block" : "none" }}
        >
          <div
            className="af-modal-backdrop"
            role="presentation"
            onClick={() => {
              if (!busy) setIsCreateOpen(false);
            }}
          >
            <div
              className="af-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${uid}-dialog-title`}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 480 }}
            >
              <div className="af-modal-header">
                <div>
                  <h2 id={`${uid}-dialog-title`} style={{ fontSize: 17 }}>
                    {entityConfig.dialogTitle}
                  </h2>
                  <p className="af-modal-desc" style={{ fontSize: 12.5, margin: 0 }}>
                    Thêm vào danh mục dùng chung của hệ thống.
                  </p>
                </div>
                <button
                  type="button"
                  className="af-modal-close"
                  disabled={busy}
                  onClick={() => setIsCreateOpen(false)}
                  aria-label="Đóng hộp thoại"
                >
                  ×
                </button>
              </div>

              <div className="af-modal-content">
                {/* Independent mutation warning */}
                <div
                  className="af-alert af-alert-warning"
                  style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}
                >
                  <div>
                    <strong>Lưu ý quan trọng:</strong> Mục mới sẽ được lưu trực
                    tiếp vào danh mục chung của hệ thống ngay khi xác nhận (độc
                    lập với việc lưu hồ sơ này). Nếu sau đó bạn bấm Hủy hồ sơ,
                    mục danh mục này vẫn tồn tại.
                  </div>
                </div>

                <div className="af-field">
                  <label htmlFor={`${uid}-new`} className="af-label">
                    Tên mới <span className="af-label-required">*</span>
                  </label>
                  <input
                    id={`${uid}-new`}
                    className="af-input"
                    maxLength={200}
                    value={name}
                    disabled={busy || uncertain}
                    placeholder={
                      type === "AREA"
                        ? "Ví dụ: Huyện Mèo Vạc, Xã Sủng Là..."
                        : "Ví dụ: Người Lô Lô Chải, Người Cờ Lao..."
                    }
                    onChange={(e) => setName(e.target.value)}
                  />
                  {isDuplicateName && (
                    <p className="af-error" style={{ fontSize: 12, marginTop: 4 }}>
                      ⚠️ Đã có mục mang tên này trong danh mục. Hãy kiểm tra lại
                      để tránh tạo trùng lặp.
                    </p>
                  )}
                </div>

                {type === "AREA" && (
                  <div className="af-field">
                    <label htmlFor={`${uid}-kind`} className="af-label">
                      Loại địa bàn
                    </label>
                    <select
                      id={`${uid}-kind`}
                      className="af-select"
                      value={kind}
                      disabled={busy || uncertain}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="LOCALITY">
                        Địa phương hành chính (Huyện / Thị xã / Xã / Thôn)
                      </option>
                      <option value="REGION">
                        Vùng văn hóa (Vùng Cao nguyên đá, Vùng Đồng Văn...)
                      </option>
                    </select>
                  </div>
                )}

                {error && (
                  <p className="af-error" role="alert" style={{ fontSize: 12.5 }}>
                    {error}
                  </p>
                )}
              </div>

              <div className="af-modal-footer">
                <button
                  type="button"
                  className="af-btn"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setIsCreateOpen(false);
                  }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="af-btn af-btn-primary"
                  disabled={
                    busy || (!name.trim() && !uncertain) || ids.length >= 30
                  }
                  onClick={() => void create()}
                >
                  {busy
                    ? "Đang tạo…"
                    : uncertain
                      ? "Thử lại cùng key"
                      : "Tạo và chọn"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function TextField({
  label,
  value,
  onChange,
  max = 2000,
  multiline = false,
  fieldPath,
}: {
  fieldPath?: string;
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  max?: number;
  multiline?: boolean;
}) {
  const id = useId();
  const errors = useContext(ProfileErrors);
  const error = fieldPath ? errors[fieldPath] : undefined;
  const attrs = {
    "data-field-path": fieldPath,
    "aria-invalid": !!error,
    "aria-describedby": error ? id + "-error" : undefined,
  };
  return (
    <div className="af-field" style={{ marginBottom: 14 }}>
      <label htmlFor={id} className="af-label" style={{ marginBottom: 6 }}>
        {label}
        {!label.includes("*") && (
          <span className="af-label-optional" aria-hidden="true">
            Tùy chọn
          </span>
        )}
      </label>
      {multiline ? (
        <Textarea
          {...attrs}
          className="af-textarea"
          style={{ minHeight: 90, resize: "vertical" }}
          id={id}
          rows={3}
          value={value ?? ""}
          maxLength={max}
          placeholder={
            multiline
              ? "Nhập theo tài liệu đã kiểm chứng; để trống nếu chưa có dữ liệu."
              : "Để trống nếu chưa có dữ liệu"
          }
          onChange={(e) => onChange(e.target.value || null)}
        />
      ) : (
        <input
          {...attrs}
          className="af-input"
          id={id}
          value={value ?? ""}
          maxLength={max}
          placeholder={
            multiline
              ? "Nhập theo tài liệu đã kiểm chứng; để trống nếu chưa có dữ liệu."
              : "Để trống nếu chưa có dữ liệu"
          }
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
      {error && (
        <p id={id + "-error"} className="af-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Rights({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "UNKNOWN" | "APPROVED" | "REJECTED";
  onChange: (v: "UNKNOWN" | "APPROVED" | "REJECTED") => void;
}) {
  const id = useId();
  return (
    <div className="af-field" style={{ marginBottom: 14 }}>
      <label htmlFor={id} className="af-label" style={{ marginBottom: 6 }}>
        {label}
      </label>
      <select
        id={id}
        className="af-select"
        value={value}
        onChange={(e) => onChange(e.target.value as typeof value)}
      >
        <option value="UNKNOWN">Chưa xác minh</option>
        <option value="APPROVED">Đã duyệt có bằng chứng</option>
        <option value="REJECTED">Không được phép</option>
      </select>
    </div>
  );
}

function SourceEditor({
  value,
  onChange,
  sectionId,
}: {
  sectionId?: string;
  value: ContentSourceInput[];
  onChange: (v: ContentSourceInput[]) => void;
}) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(
    () => new Set(value.length > 0 ? [0] : []),
  );
  const toggleItem = (idx: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const change = (index: number, patch: Partial<ContentSourceInput>) =>
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addSource = () => {
    const newIdx = value.length;
    onChange([
      ...value,
      { ...sourceSchema.parse({ title: "Nguồn mới" }), title: "" },
    ]);
    setOpenIndices((prev) => new Set([...prev, newIdx]));
  };

  return (
    <AdminCollapsibleSection
      id={sectionId || "sources"}
      icon={ShieldCheck}
      title="Nguồn và kiểm duyệt"
      description="Thêm tài liệu hoặc cơ quan phát hành dùng để kiểm chứng. Các quyền cần được xác minh riêng."
      badge="optional"
      summary={`${value.length} nguồn tham khảo`}
    >
      <AdminHelper>
        Ba quyền kiểm duyệt hoạt động hoàn toàn độc lập. Chỉ chọn &quot;Đã duyệt&quot; khi có quyết định và bằng chứng văn bản; quyền hiển thị trên website không tự động cấp phép cho AI lập chỉ mục hay sinh nội dung.
      </AdminHelper>
      {value.length === 0 ? (
        <div className="af-empty-card">
          <ShieldCheck
            size={36}
            style={{ color: "var(--af-muted)", marginBottom: 8 }}
            aria-hidden="true"
          />
          <p style={{ margin: "0 0 4px", fontWeight: 650, fontSize: 14 }}>
            Chưa có nguồn kiểm chứng
          </p>
          <p
            style={{
              margin: "0 0 14px",
              color: "var(--af-muted)",
              fontSize: 12.5,
            }}
          >
            Thêm tài liệu, cổng thông tin hoặc ấn phẩm chính thức dùng để đối chiếu thông tin.
          </p>
          <button
            type="button"
            className="af-btn af-btn-primary"
            onClick={addSource}
          >
            <Plus size={15} aria-hidden="true" /> Thêm nguồn
          </button>
        </div>
      ) : (
        <div className="af-source-list">
          {value.map((s, i) => {
            const isOpen = openIndices.has(i);
            return (
              <div key={i} className="af-source-item-card">
                <div
                  className="af-source-item-header"
                  onClick={() => toggleItem(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleItem(i);
                    }
                  }}
                  aria-expanded={isOpen}
                >
                  <div className="af-source-item-header-info">
                    <div className="af-source-item-meta">
                      <strong>{s.title || `Nguồn ${i + 1}`}</strong>
                      <span>
                        {s.publisher ||
                          s.author ||
                          (s.url ? s.url : "Chưa có đơn vị/tác giả")}
                      </span>
                      <div className="af-source-item-badges">
                        <span
                          className={`af-badge af-badge-${s.websiteRights === "APPROVED" ? "approved" : s.websiteRights === "REJECTED" ? "rejected" : "unknown"}`}
                          style={{ fontSize: 11 }}
                        >
                          Web:{" "}
                          {s.websiteRights === "APPROVED"
                            ? "Duyệt"
                            : s.websiteRights === "REJECTED"
                              ? "Từ chối"
                              : "Chưa rõ"}
                        </span>
                        <span
                          className={`af-badge af-badge-${s.indexingRights === "APPROVED" ? "approved" : s.indexingRights === "REJECTED" ? "rejected" : "unknown"}`}
                          style={{ fontSize: 11 }}
                        >
                          RAG:{" "}
                          {s.indexingRights === "APPROVED"
                            ? "Duyệt"
                            : s.indexingRights === "REJECTED"
                              ? "Từ chối"
                              : "Chưa rõ"}
                        </span>
                        <span
                          className={`af-badge af-badge-${s.openAiRights === "APPROVED" ? "approved" : s.openAiRights === "REJECTED" ? "rejected" : "unknown"}`}
                          style={{ fontSize: 11 }}
                        >
                          AI:{" "}
                          {s.openAiRights === "APPROVED"
                            ? "Duyệt"
                            : s.openAiRights === "REJECTED"
                              ? "Từ chối"
                              : "Chưa rõ"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="af-source-item-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="af-btn"
                      style={{ padding: "4px 10px", minHeight: 30, fontSize: 12 }}
                      onClick={() => toggleItem(i)}
                    >
                      {isOpen ? "Thu gọn" : "Chỉnh sửa"}
                    </button>
                    <button
                      type="button"
                      className="af-btn"
                      style={{
                        padding: "4px 10px",
                        minHeight: 30,
                        fontSize: 12,
                        color: "var(--af-error)",
                      }}
                      onClick={() => {
                        if (
                          (!s.title && !s.url) ||
                          window.confirm(
                            "Bỏ nguồn này khỏi biểu mẫu? Thay đổi chỉ có hiệu lực sau khi lưu.",
                          )
                        ) {
                          onChange(value.filter((_, j) => j !== i));
                        }
                      }}
                    >
                      Bỏ nguồn
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="af-source-item-body">
                    <div className="af-grid-2">
                      <TextField
                        fieldPath={`profile.sources.${i}.title`}
                        label="Tên nguồn *"
                        max={300}
                        value={s.title}
                        onChange={(v) => change(i, { title: v ?? "" })}
                      />
                      <TextField
                        fieldPath={`profile.sources.${i}.url`}
                        label="URL nguồn HTTPS"
                        value={s.url}
                        onChange={(v) => change(i, { url: v })}
                      />
                    </div>
                    <div className="af-grid-3">
                      <TextField
                        fieldPath={`profile.sources.${i}.author`}
                        label="Tác giả"
                        max={200}
                        value={s.author}
                        onChange={(v) => change(i, { author: v })}
                      />
                      <TextField
                        fieldPath={`profile.sources.${i}.publisher`}
                        label="Đơn vị công bố"
                        max={200}
                        value={s.publisher}
                        onChange={(v) => change(i, { publisher: v })}
                      />
                      <TextField
                        fieldPath={`profile.sources.${i}.publishedOn`}
                        label="Ngày công bố (YYYY-MM-DD)"
                        max={10}
                        value={s.publishedOn}
                        onChange={(v) => change(i, { publishedOn: v })}
                      />
                    </div>
                    <TextField
                      fieldPath={`profile.sources.${i}.claim`}
                      label="Thông tin được nguồn này xác minh"
                      value={s.claim}
                      multiline
                      onChange={(v) => change(i, { claim: v })}
                    />
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: "1px dashed var(--af-line)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12.5,
                          fontWeight: 650,
                          color: "var(--af-ink)",
                          marginBottom: 4,
                        }}
                      >
                        Phân quyền khai thác dữ liệu
                      </p>
                      <AdminHelper>
                        Ba quyền độc lập. Hiển thị trên website KHÔNG đồng nghĩa được đưa vào cơ sở hỏi đáp RAG hay chia sẻ với OpenAI.
                      </AdminHelper>
                      <div className="af-grid-3" style={{ marginTop: 12 }}>
                        <Rights
                          label="Quyền dùng website"
                          value={s.websiteRights}
                          onChange={(v) => change(i, { websiteRights: v })}
                        />
                        <Rights
                          label="Quyền lập chỉ mục cho hỏi đáp (RAG)"
                          value={s.indexingRights}
                          onChange={(v) => change(i, { indexingRights: v })}
                        />
                        <Rights
                          label="Quyền chia sẻ nội dung với AI (OpenAI)"
                          value={s.openAiRights}
                          onChange={(v) => change(i, { openAiRights: v })}
                        />
                      </div>
                      <TextField
                        fieldPath={`profile.sources.${i}.rightsEvidence`}
                        label="Bằng chứng / quyết định quyền"
                        value={s.rightsEvidence}
                        multiline
                        onChange={(v) => change(i, { rightsEvidence: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="af-btn"
            disabled={value.length >= 30}
            onClick={addSource}
            style={{ display: "inline-flex", gap: 6, marginTop: 8 }}
          >
            <Plus size={16} aria-hidden="true" /> Thêm nguồn
          </button>
        </div>
      )}
    </AdminCollapsibleSection>
  );
}

function MediaEditor({
  value,
  onChange,
  sectionId,
}: {
  sectionId?: string;
  value: ContentMediaInput[];
  onChange: (v: ContentMediaInput[]) => void;
}) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(
    () => new Set(value.length > 0 ? [0] : []),
  );
  const toggleItem = (idx: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const change = (index: number, patch: Partial<ContentMediaInput>) =>
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addMedia = () => {
    const newIdx = value.length;
    onChange([
      ...value,
      {
        ...mediaSchema.parse({
          url: "https://example.org/image",
          alt: "Ảnh mới",
        }),
        url: "",
        alt: "",
      },
    ]);
    setOpenIndices((prev) => new Set([...prev, newIdx]));
  };

  return (
    <AdminCollapsibleSection
      id={sectionId || "media"}
      icon={Images}
      title="Hình ảnh"
      description="Thêm URL ảnh, mô tả và bằng chứng quyền sử dụng; URL ảnh không chứng minh quyền sở hữu."
      badge="optional"
      summary={`${value.length} ảnh${value.some((m) => m.isCover) ? " • Đã có ảnh đại diện" : ""}`}
    >
      <AdminHelper>
        Nhập URL ảnh HTTPS và nguồn. Chưa hỗ trợ upload file nhị phân. Thứ tự các mục là thứ tự hiển thị thư viện; tối đa một ảnh đại diện.
      </AdminHelper>
      {value.length === 0 ? (
        <div className="af-empty-card">
          <Images
            size={36}
            style={{ color: "var(--af-muted)", marginBottom: 8 }}
            aria-hidden="true"
          />
          <p style={{ margin: "0 0 4px", fontWeight: 650, fontSize: 14 }}>
            Chưa có hình ảnh
          </p>
          <p
            style={{
              margin: "0 0 14px",
              color: "var(--af-muted)",
              fontSize: 12.5,
            }}
          >
            Thêm ảnh chất lượng cao kèm mô tả để hiển thị trên website.
          </p>
          <button
            type="button"
            className="af-btn af-btn-primary"
            onClick={addMedia}
          >
            <Plus size={15} aria-hidden="true" /> Thêm ảnh
          </button>
        </div>
      ) : (
        <div className="af-media-list">
          {value.map((m, i) => {
            const isOpen = openIndices.has(i);
            return (
              <div key={i} className="af-media-item-card">
                <div
                  className="af-media-item-header"
                  onClick={() => toggleItem(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleItem(i);
                    }
                  }}
                  aria-expanded={isOpen}
                >
                  <div className="af-media-item-header-info">
                    {m.url && publicHttpsUrl.safeParse(m.url).success ? (
                      <img
                        src={m.url}
                        alt=""
                        className="af-media-thumb-mini"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="af-media-thumb-placeholder">
                        <Images size={20} aria-hidden="true" />
                      </div>
                    )}
                    <div className="af-media-item-meta">
                      <strong>
                        Ảnh {i + 1}
                        {m.caption ? `: ${m.caption}` : m.alt ? `: ${m.alt}` : ""}
                      </strong>
                      <div className="af-media-item-badges">
                        {m.isCover && (
                          <span
                            className="af-badge af-badge-visible"
                            style={{ fontSize: 11 }}
                          >
                            Ảnh đại diện
                          </span>
                        )}
                        <span
                          className={`af-badge af-badge-${m.websiteRights === "APPROVED" ? "approved" : m.websiteRights === "REJECTED" ? "rejected" : "unknown"}`}
                          style={{ fontSize: 11 }}
                        >
                          {m.websiteRights === "APPROVED"
                            ? "Quyền: Đã duyệt"
                            : m.websiteRights === "REJECTED"
                              ? "Quyền: Từ chối"
                              : "Quyền: Chưa xác minh"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="af-media-item-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="af-btn"
                      style={{ padding: "4px 8px", minHeight: 30 }}
                      disabled={i === 0}
                      title="Chuyển lên trước"
                      onClick={() => {
                        const next = [...value];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        onChange(next);
                      }}
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="af-btn"
                      style={{ padding: "4px 8px", minHeight: 30 }}
                      disabled={i === value.length - 1}
                      title="Chuyển xuống sau"
                      onClick={() => {
                        const next = [...value];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        onChange(next);
                      }}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="af-btn"
                      style={{ padding: "4px 10px", minHeight: 30, fontSize: 12 }}
                      onClick={() => toggleItem(i)}
                    >
                      {isOpen ? "Thu gọn" : "Chỉnh sửa"}
                    </button>
                    <button
                      type="button"
                      className="af-btn"
                      style={{
                        padding: "4px 10px",
                        minHeight: 30,
                        fontSize: 12,
                        color: "var(--af-error)",
                      }}
                      onClick={() => {
                        if (
                          !m.url ||
                          window.confirm("Bỏ ảnh này khỏi biểu mẫu?")
                        ) {
                          onChange(value.filter((_, j) => j !== i));
                        }
                      }}
                    >
                      Bỏ ảnh
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="af-media-item-body">
                    <AdminImagePreview url={m.url} alt={m.alt} />
                    <div className="af-grid-2">
                      <TextField
                        fieldPath={`profile.media.${i}.url`}
                        label="URL ảnh *"
                        value={m.url}
                        onChange={(v) => change(i, { url: v ?? "" })}
                      />
                      <TextField
                        fieldPath={`profile.media.${i}.alt`}
                        label="Mô tả ảnh cho trình đọc màn hình *"
                        max={300}
                        value={m.alt}
                        onChange={(v) => change(i, { alt: v ?? "" })}
                      />
                    </div>
                    <div className="af-grid-2">
                      <TextField
                        fieldPath={`profile.media.${i}.caption`}
                        label="Chú thích"
                        max={1000}
                        value={m.caption}
                        onChange={(v) => change(i, { caption: v })}
                      />
                      <div
                        className="af-field"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          minHeight: 44,
                          marginTop: 22,
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={m.isCover}
                            onChange={(e) =>
                              onChange(
                                value.map((item, j) => ({
                                  ...item,
                                  isCover: j === i && e.target.checked,
                                })),
                              )
                            }
                          />
                          Đặt làm ảnh đại diện (Cover)
                        </label>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: "1px dashed var(--af-line)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12.5,
                          fontWeight: 650,
                          color: "var(--af-muted)",
                          marginBottom: 12,
                        }}
                      >
                        Bản quyền &amp; Nguồn gốc ảnh
                      </p>
                      <div className="af-grid-2">
                        <TextField
                          fieldPath={`profile.media.${i}.author`}
                          label="Tác giả ảnh"
                          max={200}
                          value={m.author}
                          onChange={(v) => change(i, { author: v })}
                        />
                        <TextField
                          fieldPath={`profile.media.${i}.sourceUrl`}
                          label="URL nguồn ảnh"
                          value={m.sourceUrl}
                          onChange={(v) => change(i, { sourceUrl: v })}
                        />
                      </div>
                      <Rights
                        label="Quyền sử dụng ảnh trên website"
                        value={m.websiteRights}
                        onChange={(v) => change(i, { websiteRights: v })}
                      />
                      <TextField
                        fieldPath={`profile.media.${i}.rightsEvidence`}
                        label="Bằng chứng quyền ảnh"
                        value={m.rightsEvidence}
                        multiline
                        onChange={(v) => change(i, { rightsEvidence: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="af-btn"
            disabled={value.length >= 20}
            onClick={addMedia}
            style={{ display: "inline-flex", gap: 6, marginTop: 8 }}
          >
            <Plus size={16} aria-hidden="true" /> Thêm ảnh
          </button>
        </div>
      )}
    </AdminCollapsibleSection>
  );
}
export default function ContentProfileEditor({
  profile,
  onChange,
  errors = {},
  content,
  relatedDestinations,
  legacySources,
  onPendingChange,
  basicFields,
  locationFields,
  durationSection,
  openingHoursSection,
  sectionPrefix,
  hideBasic = false,
  hideLocation = false,
  leadingSections,
  locationSection,
}: {
  leadingSections?: ReactNode;
  locationSection?: ReactNode;
  sectionPrefix?: string;
  hideBasic?: boolean;
  hideLocation?: boolean;
  profile: Profile;
  onChange: (v: Profile) => void;
  errors?: Record<string, string>;
  content?: ReactNode;
  relatedDestinations?: ReactNode;
  legacySources?: ReactNode;
  onPendingChange?: (v: boolean) => void;
  basicFields?: ReactNode;
  locationFields?: ReactNode;
  durationSection?: ReactNode;
  openingHoursSection?: ReactNode;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const setAreaPending = useCallback(
    (value: boolean) =>
      setPending((p) => (p.area === value ? p : { ...p, area: value })),
    [],
  );
  const setCommunityPending = useCallback(
    (value: boolean) =>
      setPending((p) =>
        p.community === value ? p : { ...p, community: value },
      ),
    [],
  );
  const notifyRef = useRef(onPendingChange);
  notifyRef.current = onPendingChange;
  const anyPending = Object.values(pending).some(Boolean);
  useEffect(() => {
    notifyRef.current?.(anyPending);
    return () => notifyRef.current?.(false);
  }, [anyPending]);
  const patch = (v: Partial<Profile>) =>
    onChange({ ...profile, ...v } as Profile);
  const text = (
    key: keyof Profile,
    label: string,
    max = 2000,
    multiline = false,
  ) => (
    <TextField
      fieldPath={"profile." + key}
      key={key}
      label={label}
      value={profile[key] as string | null}
      max={max}
      multiline={multiline}
      onChange={(v) => patch({ [key]: v })}
    />
  );
  const destination = "aliases" in profile;
  const prefix = sectionPrefix ?? (destination ? "df" : "cf");
  return (
    <ProfileErrors.Provider value={errors}>
      <div
        id={destination ? "destination-profile" : "culture-profile"}
        tabIndex={-1}
      >
        {leadingSections}
        {Object.entries(errors)
          .filter(([k]) => k.startsWith("profile."))
          .map(([k, v]) => (
            <p key={k} className="destination-error" role="alert">
              {v}
            </p>
          ))}
        {!hideBasic && (
          <section className="af-section">
            <AdminSectionHead
              icon={BookOpen}
              title="Thông tin cơ bản"
              description="Mô tả và thông tin bổ sung của hồ sơ."
            />
            {basicFields}
            {text("shortDescription", "Mô tả ngắn", 1000, true)}
            {destination ? (
              <>
                <TextField
                  fieldPath="profile.aliases"
                  label="Tên gọi khác (mỗi dòng một tên)"
                  value={profile.aliases.join("\n")}
                  max={4000}
                  multiline
                  onChange={(v) =>
                    patch({ aliases: (v ?? "").split("\n").filter(Boolean) })
                  }
                />
                <TextField
                  fieldPath="profile.address"
                  label="Địa chỉ"
                  value={profile.address}
                  max={1000}
                  onChange={(v) => patch({ address: v })}
                />
              </>
            ) : (
              <>
                <TextField
                  fieldPath="profile.category"
                  label="Danh mục văn hóa"
                  value={profile.category}
                  max={200}
                  onChange={(v) => patch({ category: v })}
                />
              </>
            )}
          </section>
        )}
        <AdminCollapsibleSection
          id={prefix + "-geo"}
          icon={MapPinned}
          title="Phạm vi địa lý"
          description="Địa phương là đơn vị hành chính; vùng văn hóa có thể trải rộng qua nhiều địa phương. Khu vực tìm kiếm khác với địa chỉ cụ thể."
          badge="optional"
          summary={`${profile.areaIds.length} địa phương / vùng văn hóa`}
          hasError={Object.keys(errors).some((k) =>
            k.startsWith("profile.areaIds") || k === "profile.geographicScope",
          )}
        >
          {!destination && (
            <TextField
              fieldPath="profile.geographicScope"
              label="Mô tả phạm vi địa lý"
              value={profile.geographicScope}
              multiline
              onChange={(v) => patch({ geographicScope: v })}
            />
          )}
          <TaxonomyPicker
            type="AREA"
            onPendingChange={setAreaPending}
            label="Địa phương / vùng văn hóa"
            ids={profile.areaIds}
            onChange={(areaIds) => patch({ areaIds })}
          />
        </AdminCollapsibleSection>
        {destination ? (
          <>
            {locationSection}
            {!hideLocation && (
              <section className="af-section">
                <AdminSectionHead
                  icon={MapPin}
                  title="Xác minh vị trí"
                  description="Phân biệt điểm mốc và cổng vào; chỉ xác nhận vị trí sau khi đối chiếu."
                />
                {locationFields}
                <TextField
                  fieldPath="profile.googleMapsUrl"
                  label="URL Google Maps"
                  value={profile.googleMapsUrl}
                  onChange={(v) =>
                    patch({ googleMapsUrl: v, locationVerified: false })
                  }
                />
                <TextField
                  fieldPath="profile.locationEvidence"
                  label="Bằng chứng xác nhận vị trí pin"
                  value={profile.locationEvidence}
                  multiline
                  onChange={(v) => patch({ locationEvidence: v })}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={profile.locationVerified}
                    onChange={(e) =>
                      patch({ locationVerified: e.target.checked })
                    }
                  />{" "}
                  Tôi đã đối chiếu tọa độ/pin với bản đồ và ghi bằng chứng
                </label>
              </section>
            )}
            {durationSection}
            {openingHoursSection}
            <AdminCollapsibleSection
              id={prefix + "-visit"}
              icon={Ticket}
              title="Thông tin tham quan"
              description="Để trống khi chưa có dữ liệu; Không áp dụng chỉ dùng khi tài liệu xác nhận trường này không phù hợp."
              badge="optional"
              summary={
                profile.ticketPrice
                  ? `Vé: ${profile.ticketPrice}`
                  : "Chưa có thông tin giá vé"
              }
              hasError={Object.keys(errors).some(
                (k) =>
                  k.startsWith("profile.ticket") ||
                  k === "profile.bestVisitTime" ||
                  k === "profile.visitNotes",
              )}
            >
              <TextField
                fieldPath="profile.ticketPrice"
                label="Giá vé (kèm đơn vị)"
                max={300}
                value={profile.ticketPrice}
                onChange={(v) =>
                  patch({ ticketPrice: v, ticketVerification: "UNKNOWN" })
                }
              />
              <div className="af-field" style={{ marginBottom: 14 }}>
                <label className="af-label" style={{ marginBottom: 6 }}>
                  Trạng thái xác minh giá vé
                </label>
                <select
                  aria-label="Trạng thái xác minh giá vé"
                  className="af-select"
                  value={profile.ticketVerification}
                  onChange={(e) =>
                    patch({
                      ticketVerification: e.target
                        .value as DestinationProfile["ticketVerification"],
                    })
                  }
                >
                  <option value="UNKNOWN">Chưa xác minh</option>
                  <option value="VERIFIED">Đã xác minh</option>
                  <option value="DISPUTED">Có mâu thuẫn</option>
                </select>
              </div>
              <TextField
                fieldPath="profile.ticketEvidence"
                label="Nguồn / bằng chứng giá vé"
                value={profile.ticketEvidence}
                multiline
                onChange={(v) => patch({ ticketEvidence: v })}
              />
              <TextField
                fieldPath="profile.bestVisitTime"
                label="Thời điểm tham quan phù hợp"
                value={profile.bestVisitTime}
                multiline
                onChange={(v) => patch({ bestVisitTime: v })}
              />
              <TextField
                fieldPath="profile.visitNotes"
                label="Lưu ý tham quan"
                max={4000}
                value={profile.visitNotes}
                multiline
                onChange={(v) => patch({ visitNotes: v })}
              />
            </AdminCollapsibleSection>
          </>
        ) : (
          <AdminCollapsibleSection
            id={prefix + "-community"}
            icon={Users}
            title="Cộng đồng liên quan"
            description="Chọn những cộng đồng thực hành hoặc gắn với nội dung; không mặc định áp dụng cho cả vùng."
            badge="optional"
            summary={`${profile.communityIds.length} cộng đồng dân tộc`}
            hasError={Object.keys(errors).some((k) =>
              k.startsWith("profile.communityIds"),
            )}
          >
            <TaxonomyPicker
              type="COMMUNITY"
              onPendingChange={setCommunityPending}
              label="Cộng đồng dân tộc"
              ids={profile.communityIds}
              onChange={(communityIds) => patch({ communityIds })}
            />
          </AdminCollapsibleSection>
        )}
        {content}
        <MediaEditor
          sectionId={prefix + "-media"}
          value={profile.media}
          onChange={(media) => patch({ media })}
        />
        {destination && (
          <AdminCollapsibleSection
            id={prefix + "-culture"}
            icon={BookOpen}
            title="Văn hóa liên quan"
            description="Liên kết hồ sơ đã có; không sao chép toàn văn vào điểm đến."
            badge="optional"
            summary={`${profile.cultureIds.length} hồ sơ văn hóa liên kết`}
            hasError={Object.keys(errors).some((k) =>
              k.startsWith("profile.cultureIds"),
            )}
          >
            <TaxonomyPicker
              type="CULTURE"
              label="Hồ sơ văn hóa"
              ids={profile.cultureIds}
              onChange={(cultureIds) => patch({ cultureIds })}
            />
          </AdminCollapsibleSection>
        )}
        {relatedDestinations}
        {legacySources}
        <SourceEditor
          sectionId={prefix + "-sources"}
          value={profile.sources}
          onChange={(sources) => patch({ sources })}
        />
      </div>
    </ProfileErrors.Provider>
  );
}

export function AdminImagePreview({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || !publicHttpsUrl.safeParse(url).success || failed)
    return (
      <div className="af-media-preview-error">
        {url
          ? "Không tải được ảnh. Kiểm tra URL HTTPS hoặc quyền truy cập."
          : "Nhập URL HTTPS để xem trước ảnh."}
      </div>
    );
  return (
    <img
      className="af-media-preview"
      src={url}
      alt={alt || "Ảnh xem trước"}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
export function DestinationBasicProfile({
  profile,
  onChange,
}: {
  profile: DestinationProfile;
  onChange: (v: DestinationProfile) => void;
}) {
  return (
    <>
      <TextField
        fieldPath="profile.shortDescription"
        label="Mô tả ngắn"
        value={profile.shortDescription}
        max={1000}
        multiline
        onChange={(v) => onChange({ ...profile, shortDescription: v })}
      />
      <TextField
        fieldPath="profile.aliases"
        label="Tên gọi khác (mỗi dòng một tên)"
        value={profile.aliases.join("\n")}
        max={4000}
        multiline
        onChange={(v) =>
          onChange({
            ...profile,
            aliases: (v ?? "").split("\n").filter(Boolean),
          })
        }
      />
      <TextField
        fieldPath="profile.address"
        label="Địa chỉ"
        value={profile.address}
        max={1000}
        onChange={(v) => onChange({ ...profile, address: v })}
      />
    </>
  );
}
export function DestinationLocationProfile({
  profile,
  onChange,
}: {
  profile: DestinationProfile;
  onChange: (v: DestinationProfile) => void;
}) {
  return (
    <>
      <TextField
        fieldPath="profile.googleMapsUrl"
        label="URL Google Maps"
        value={profile.googleMapsUrl}
        onChange={(v) =>
          onChange({
            ...profile,
            googleMapsUrl: v,
            locationVerified: false,
            locationEvidence: null,
          })
        }
      />
      <TextField
        fieldPath="profile.locationEvidence"
        label="Bằng chứng xác nhận vị trí pin"
        value={profile.locationEvidence}
        multiline
        onChange={(v) => onChange({ ...profile, locationEvidence: v })}
      />
      <label>
        <input
          type="checkbox"
          checked={profile.locationVerified}
          onChange={(e) =>
            onChange({ ...profile, locationVerified: e.target.checked })
          }
        />{" "}
        Tôi đã đối chiếu tọa độ/pin với bản đồ và ghi bằng chứng
      </label>
      <p className="af-helper">
        Xác định pin đang chỉ điểm mốc hay cổng vào. Khi đổi tọa độ, phải kiểm
        tra và xác nhận lại.
      </p>
    </>
  );
}
