"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import {
  AdminField,
  AdminLabel,
  AdminHelper,
} from "@/components/admin/admin-form-shell";
const resultSchema = z.object({
  status: z.enum(["RESOLVED", "AMBIGUOUS", "UNRESOLVED", "UNSUPPORTED"]),
  reason: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  provider: z.string().optional(),
});
export default function DestinationMapsField({
  value,
  onChange,
  error,
  legacy,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  legacy?: { url: string; latitude: number; longitude: number };
}) {
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [checkedUrl, setCheckedUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setFeedback("");
    setPending(false);
    setCheckedUrl("");
    if (!value.trim() || (legacy && value === legacy.url)) return;
    const timer = setTimeout(() => {
      setPending(true);
      void fetchAuthWithTimeout("/api/admin/destinations/resolve-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok || !body.success)
            throw Error(
              body.error?.message ??
                "Không thể kiểm tra vị trí. Thử lại hoặc dùng URL đầy đủ.",
            );
          const parsed = resultSchema.parse(body.data);
          if (!controller.signal.aborted) {
            setResult(parsed);
            setCheckedUrl(value);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setFeedback(
              e instanceof Error ? e.message : "Không thể kiểm tra liên kết.",
            );
            setCheckedUrl(value);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, legacy?.url]);
  const existing = legacy && value === legacy.url;
  const current = checkedUrl === value ? result : null;
  return (
    <AdminField error={error} errorId="err-googleMapsUrl">
      <AdminLabel htmlFor="destination-googleMapsUrl" required>
        Google Maps URL
      </AdminLabel>
      <input
        id="destination-googleMapsUrl"
        className="af-input"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://www.google.com/maps/search/?api=1&query=23.391,105.308"
        aria-invalid={Boolean(error)}
        aria-describedby="maps-help err-googleMapsUrl"
      />
      <p id="maps-help" className="af-helper">
        Dùng tọa độ điểm chính xác trong liên kết Google Maps. Tọa độ tâm camera
        (@) và tìm theo tên chưa được hỗ trợ.
      </p>
      <div
        className="dv3-location-status"
        role="status"
        aria-live="polite"
        aria-busy={pending}
      >
        {existing ? (
          <>
            <strong>Vị trí hiện có được giữ nguyên</strong>
            <span>
              {legacy.latitude}, {legacy.longitude}
            </span>
          </>
        ) : pending ? (
          "Đang xác định tọa độ…"
        ) : current ? (
          <>
            <strong>
              {current.status === "RESOLVED"
                ? "Đã xác định tọa độ điểm"
                : "Chưa xác định được vị trí"}
            </strong>
            <span>{current.reason}</span>
            {current.status === "RESOLVED" && (
              <output>
                {current.latitude}, {current.longitude}
              </output>
            )}
          </>
        ) : feedback && checkedUrl === value ? (
          feedback
        ) : (
          "Dán liên kết để kiểm tra vị trí."
        )}
      </div>
      {!existing && (
        <AdminHelper>
          Kết quả xác định tọa độ từ URL không phải xác nhận khả năng tiếp cận
          bằng đường bộ. Backend kiểm tra lại trước khi lưu.
        </AdminHelper>
      )}
    </AdminField>
  );
}
