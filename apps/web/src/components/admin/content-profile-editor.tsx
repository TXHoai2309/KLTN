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
} from "lucide-react";
import { AdminSectionHead, AdminChips } from "./admin-form-shell";
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
  const uid = useId(),
    [q, setQ] = useState(""),
    [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0),
    [name, setName] = useState(""),
    [kind, setKind] = useState("LOCALITY"),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const lock = useRef(false),
    attempt = useRef<{
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
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [type, q, idsKey, reload]);
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({
        type,
        name,
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
        onChange([...new Set([...ids, result.data.id])]);
        attempt.current = null;
        setName("");
        setUncertain(false);
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
  return (
    <div className="destination-field">
      <label htmlFor={uid}>
        {label}{" "}
        <span className="af-label-optional" aria-hidden="true">
          Tùy chọn
        </span>
      </label>
      <AdminChips
        items={ids.map((id) => ({
          id,
          label: names.current.get(id) ?? "Đang tải tên mục đã chọn…",
        }))}
        onRemove={(id) => onChange(ids.filter((v) => v !== id))}
      />
      <input
        id={uid}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={200}
        placeholder="Tìm trong danh sách"
      />
      {loading && <p role="status">Đang tải…</p>}
      {error && (
        <p role="alert" className="destination-error">
          {error}
        </p>
      )}
      <div className="content-profile-options" aria-label={label}>
        {[
          ...items,
          ...ids
            .filter((id) => !items.some((i) => i.id === id))
            .map((id) => ({
              id,
              name: names.current.get(id) ?? "Đang tải tên mục đã chọn…",
            })),
        ].map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              disabled={!ids.includes(item.id) && ids.length >= 30}
              checked={ids.includes(item.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...ids, item.id]
                    : ids.filter((id) => id !== item.id),
                )
              }
            />
            {item.name}
            {"kind" in item && item.kind === "REGION" ? " (Vùng văn hóa)" : ""}
          </label>
        ))}
      </div>
      <p className="destination-helper">
        Đã chọn {ids.length}/30. Có thể bỏ tất cả liên kết.
        {items.length === 60 ? " Thu hẹp tìm kiếm để xem thêm." : ""}
      </p>
      {!loading && !error && items.length === 0 && (
        <p className="destination-helper">
          Chưa có kết quả. Thử tên khác hoặc tạo mục mới nếu đã kiểm tra danh
          sách.
        </p>
      )}
      {error && (
        <button
          type="button"
          className="af-btn"
          onClick={() => setReload((v) => v + 1)}
        >
          Thử tải danh sách lại
        </button>
      )}
      {type !== "CULTURE" && (
        <details>
          <summary>Tạo mục mới nếu chưa có trong danh sách</summary>
          <div>
            <label htmlFor={uid + "-new"}>Tên mới</label>
            <input
              id={uid + "-new"}
              maxLength={200}
              value={name}
              disabled={busy || uncertain}
              onChange={(e) => setName(e.target.value)}
            />
            {type === "AREA" && (
              <>
                <label htmlFor={uid + "-kind"}>Loại địa bàn</label>
                <select
                  id={uid + "-kind"}
                  value={kind}
                  disabled={busy || uncertain}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="LOCALITY">Địa phương</option>
                  <option value="REGION">Vùng văn hóa</option>
                </select>
              </>
            )}
            <button
              type="button"
              className="destination-button"
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
        </details>
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
    <div className="destination-field">
      <label htmlFor={id}>
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
          className="content-profile-textarea resize-none"
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
    <div className="destination-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
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
function SourceCard({
  title,
  initiallyOpen,
  children,
}: {
  title: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className="af-source-card"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{title}</summary>
      {children}
    </details>
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
  const change = (index: number, patch: Partial<ContentSourceInput>) =>
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  return (
    <section id={sectionId} className="af-section">
      <AdminSectionHead
        icon={ShieldCheck}
        title="Nguồn và kiểm duyệt"
        description="Thêm tài liệu hoặc cơ quan phát hành dùng để kiểm chứng. Các quyền cần được xác minh riêng."
        badge="optional"
      />
      <p className="destination-helper">
        Ba quyền độc lập. Chỉ chọn đã duyệt khi có quyết định và bằng chứng;
        hiển thị website không cho phép AI sử dụng.
      </p>
      {value.map((s, i) => (
        <SourceCard
          key={i}
          initiallyOpen={i === 0 || !s.title}
          title={s.title || `Nguồn ${i + 1}`}
        >
          <fieldset className="content-profile-entry">
            <legend className="destination-sr-only">Nguồn {i + 1}</legend>
            <div className="destination-grid">
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
            <div className="destination-grid">
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
            <button
              type="button"
              className="destination-button"
              onClick={() => {
                if (
                  (!s.title && !s.url) ||
                  window.confirm(
                    "Bỏ nguồn này khỏi biểu mẫu? Thay đổi chỉ có hiệu lực sau khi lưu.",
                  )
                )
                  onChange(value.filter((_, j) => j !== i));
              }}
            >
              Bỏ nguồn {i + 1}
            </button>
          </fieldset>
        </SourceCard>
      ))}
      <button
        type="button"
        className="destination-button"
        disabled={value.length >= 30}
        onClick={() =>
          onChange([
            ...value,
            { ...sourceSchema.parse({ title: "Nguồn mới" }), title: "" },
          ])
        }
      >
        Thêm nguồn
      </button>
    </section>
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
  const change = (index: number, patch: Partial<ContentMediaInput>) =>
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  return (
    <section id={sectionId} className="af-section">
      <AdminSectionHead
        icon={Images}
        title="Hình ảnh"
        description="Thêm URL ảnh, mô tả và bằng chứng quyền sử dụng; URL ảnh không chứng minh quyền sở hữu."
        badge="optional"
      />
      {value.length === 0 && (
        <p className="af-helper">
          Chưa có ảnh. Bấm Thêm ảnh để thêm ảnh đại diện hoặc thư viện.
        </p>
      )}
      <p className="destination-helper">
        Nhập URL ảnh HTTPS và nguồn. Chưa hỗ trợ upload ảnh. Thứ tự các mục là
        thứ tự thư viện; chỉ một ảnh đại diện.
      </p>
      {value.map((m, i) => (
        <fieldset key={i} className="content-profile-entry">
          <legend>Ảnh {i + 1}</legend>
          <AdminImagePreview url={m.url} alt={m.alt} />
          <div className="destination-grid">
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
            <TextField
              fieldPath={`profile.media.${i}.caption`}
              label="Chú thích"
              max={1000}
              value={m.caption}
              onChange={(v) => change(i, { caption: v })}
            />
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
          <label>
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
            />{" "}
            Ảnh đại diện
          </label>
          <div className="destination-action-buttons">
            <button
              type="button"
              className="destination-button"
              disabled={i === 0}
              onClick={() => {
                const next = [...value];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              Lên trước
            </button>
            <button
              type="button"
              className="destination-button"
              disabled={i === value.length - 1}
              onClick={() => {
                const next = [...value];
                [next[i], next[i + 1]] = [next[i + 1], next[i]];
                onChange(next);
              }}
            >
              Xuống sau
            </button>
            <button
              type="button"
              className="destination-button"
              onClick={() => {
                if (!m.url || window.confirm("Bỏ ảnh này khỏi biểu mẫu?"))
                  onChange(value.filter((_, j) => j !== i));
              }}
            >
              Bỏ ảnh {i + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="destination-button"
        disabled={value.length >= 20}
        onClick={() =>
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
          ])
        }
      >
        Thêm ảnh
      </button>
    </section>
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
        <section id={prefix + "-geo"} className="af-section">
          <AdminSectionHead
            icon={MapPinned}
            title="Phạm vi địa lý"
            description="Địa phương là đơn vị hành chính; vùng văn hóa có thể trải rộng qua nhiều địa phương. Khu vực tìm kiếm khác với địa chỉ cụ thể."
            badge="optional"
          />
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
        </section>
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
            <section id={prefix + "-visit"} className="af-section">
              <AdminSectionHead
                icon={Ticket}
                title="Thông tin tham quan"
                description="Để trống khi chưa có dữ liệu; Không áp dụng chỉ dùng khi tài liệu xác nhận trường này không phù hợp."
                badge="optional"
              />
              <TextField
                fieldPath="profile.ticketPrice"
                label="Giá vé (kèm đơn vị)"
                max={300}
                value={profile.ticketPrice}
                onChange={(v) =>
                  patch({ ticketPrice: v, ticketVerification: "UNKNOWN" })
                }
              />
              <label>
                Trạng thái xác minh giá vé
                <select
                  aria-label="Trạng thái xác minh giá vé"
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
              </label>
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
            </section>
          </>
        ) : (
          <section id={prefix + "-community"} className="af-section">
            <AdminSectionHead
              icon={Users}
              title="Cộng đồng liên quan"
              description="Chọn những cộng đồng thực hành hoặc gắn với nội dung; không mặc định áp dụng cho cả vùng."
              badge="optional"
            />
            <TaxonomyPicker
              type="COMMUNITY"
              onPendingChange={setCommunityPending}
              label="Cộng đồng dân tộc"
              ids={profile.communityIds}
              onChange={(communityIds) => patch({ communityIds })}
            />
          </section>
        )}
        {content}
        <MediaEditor
          sectionId={prefix + "-media"}
          value={profile.media}
          onChange={(media) => patch({ media })}
        />
        {destination && (
          <section id={prefix + "-culture"} className="af-section">
            <AdminSectionHead
              icon={BookOpen}
              title="Văn hóa liên quan"
              description="Liên kết hồ sơ đã có; không sao chép toàn văn vào điểm đến."
              badge="optional"
            />
            <TaxonomyPicker
              type="CULTURE"
              label="Hồ sơ văn hóa"
              ids={profile.cultureIds}
              onChange={(cultureIds) => patch({ cultureIds })}
            />
          </section>
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
