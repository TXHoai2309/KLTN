"use client";
import "@/components/culture-content.css";
import CultureContent from "@/components/culture-content";
import { AdminImagePreview } from "./content-profile-editor";
import { resolveCategoryLabel } from "@/modules/culture/culture-categories";
import { safeContentLink } from "@/modules/culture/culture-rich-content";
import type {
  CultureProfile,
  DestinationProfile,
} from "@/modules/content-profile/content-profile-contract";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import { parseCoordinateInputs } from "@/modules/map/map-model";
const namesResponse = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});
function PreviewNames({
  type,
  ids,
  label,
}: {
  type: "AREA" | "COMMUNITY" | "CULTURE";
  ids: string[];
  label: string;
}) {
  const [names, setNames] = useState<string[]>([]),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    if (!key) {
      setNames([]);
      return;
    }
    const controller = new AbortController();
    setNames([]);
    setError(false);
    void fetchAuthWithTimeout(
      "/api/admin/content-taxonomy?" + new URLSearchParams({ type, ids: key }),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("lookup failed");
        const data = namesResponse.parse(await response.json());
        if (!controller.signal.aborted)
          setNames(
            data.data.items
              .filter((item) => key.split(",").includes(item.id))
              .map((item) => item.name),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [key, type, reload]);
  return (
    <p>
      {label}:{" "}
      {ids.length === 0 ? (
        "Chưa chọn"
      ) : error ? (
        <>
          <span>Không tải được tên các mục đã chọn.</span>{" "}
          <button
            type="button"
            className="af-btn"
            onClick={() => setReload((v) => v + 1)}
          >
            Thử lại
          </button>
        </>
      ) : names.length ? (
        names.join(", ")
      ) : (
        "Đang tải…"
      )}
    </p>
  );
}
export default function AdminContentPreview({
  title,
  content,
  profile,
  location,
  durations,
  hours,
  destinations,
  simplifiedDestination = false,
}: {
  title: string;
  content: string;
  profile: CultureProfile | DestinationProfile;
  location?: { latitude: string; longitude: string };
  durations?: { suggested: string; minimum: string };
  hours?: {
    day: string;
    status: string;
    intervals: { opensAt: string; closesAt: string }[];
  }[];
  destinations?: { id: string; name: string }[];
  simplifiedDestination?: boolean;
}) {
  const destination = "aliases" in profile;
  const coordinates = location
    ? parseCoordinateInputs(location.latitude, location.longitude)
    : null;
  return (
    <article className="af-preview" aria-label="Xem trước hồ sơ">
      <p className="af-helper">
        {simplifiedDestination ? "Xem trước dữ liệu đang nhập. Nội dung công khai theo trạng thái xuất bản của điểm đến." : "Xem trước dữ liệu đang nhập. Chưa lưu hoặc xuất bản; ảnh và nguồn chỉ được công khai khi quyền website đã được duyệt."}
      </p>
      <h2>{title || "Chưa có tiêu đề"}</h2>
      {profile.shortDescription && <p>{profile.shortDescription}</p>}
      {!simplifiedDestination && (
      <PreviewNames
        type="AREA"
        ids={profile.areaIds}
        label="Địa phương / vùng văn hóa"
      />
      )}
      {!destination && (
        <>
          <p>{resolveCategoryLabel(profile.category)}</p>
          {profile.geographicScope && <p>Phạm vi: {profile.geographicScope}</p>}
          <PreviewNames
            type="COMMUNITY"
            ids={profile.communityIds}
            label="Cộng đồng liên quan"
          />
        </>
      )}
      <CultureContent content={content} />
      {destination && (
        <>
          <p>Địa chỉ: {profile.address || "Chưa có dữ liệu"}</p>
          <p>
            Vị trí: {location?.latitude || "Chưa chọn"},{" "}
            {location?.longitude || "Chưa chọn"} ·{" "}
            {simplifiedDestination ? "Tọa độ hiển thị khi URL đã được xác định" : profile.locationVerified ? "Đã xác nhận" : "Chưa xác nhận"}
          </p>
          {safeContentLink(profile.googleMapsUrl) && (
            <a
              href={profile.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Đối chiếu vị trí trên Google Maps
            </a>
          )}
          {!profile.googleMapsUrl && coordinates && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates.latitude + "," + coordinates.longitude)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Xem vị trí đang nhập trên Google Maps
            </a>
          )}
          <p>
            Thời lượng gợi ý:{" "}
            {durations?.suggested
              ? durations.suggested + " phút"
              : "Chưa có dữ liệu"}{" "}
            · Tối thiểu:{" "}
            {durations?.minimum
              ? durations.minimum + " phút"
              : "Chưa có dữ liệu"}
          </p>
          {!simplifiedDestination && (
          <p>
            Giá vé: {profile.ticketPrice || "Chưa có dữ liệu"} ·{" "}
            {profile.ticketVerification === "VERIFIED"
              ? "Đã xác minh"
              : profile.ticketVerification === "DISPUTED"
                ? "Có mâu thuẫn"
                : "Chưa xác minh"}
          </p>
          )}
          {profile.bestVisitTime && (
            <p>Thời điểm phù hợp: {profile.bestVisitTime}</p>
          )}
          {profile.visitNotes && <p>Lưu ý: {profile.visitNotes}</p>}
          {hours && (
            <ul>
              {hours.map((d) => (
                <li key={d.day}>
                  {d.day}:{" "}
                  {d.status === "UNKNOWN"
                    ? "Chưa có dữ liệu"
                    : d.status === "CLOSED"
                      ? "Đóng cả ngày"
                      : d.intervals
                          .map((i) => `${i.opensAt}–${i.closesAt}`)
                          .join(", ")}
                </li>
              ))}
            </ul>
          )}
          {!simplifiedDestination && (
          <PreviewNames
            type="CULTURE"
            ids={profile.cultureIds}
            label="Văn hóa liên quan"
          />
          )}
        </>
      )}
      {profile.media.map((m, i) => (
        <figure key={i}>
          <AdminImagePreview url={m.url} alt={m.alt} />
          <figcaption>
            {m.isCover ? "Ảnh đại diện · " : ""}
            {m.caption || m.alt}{!simplifiedDestination && <> ·{" "}
            {m.websiteRights === "APPROVED"
              ? "Đã duyệt website"
              : "Chưa được phép hiển thị công khai"}</>}
          </figcaption>
        </figure>
      ))}
      {destinations && destinations.length > 0 && (
        <p>Điểm đến liên quan: {destinations.map((d) => d.name).join(", ")}</p>
      )}
      <h3>{simplifiedDestination ? "Nguồn tham khảo" : "Nguồn kiểm chứng"}</h3>
      {profile.sources.length === 0 && <p>Chưa thêm nguồn.</p>}
      <ul>
        {profile.sources.map((s, i) => (
          <li key={i}>
            {safeContentLink(s.url) ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title || s.url}
              </a>
            ) : (
              s.title || "Chưa đặt tên nguồn"
            )}
            {s.publisher && ` · ${s.publisher}`} ·{" "}
            {s.websiteRights === "APPROVED"
              ? "Đã duyệt website"
              : "Chưa được phép hiển thị công khai"}
          </li>
        ))}
      </ul>
    </article>
  );
}
