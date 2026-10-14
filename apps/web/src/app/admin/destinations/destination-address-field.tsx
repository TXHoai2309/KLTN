"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import {
  communeSchema,
  formatDestinationAddress,
  type Commune,
} from "@/modules/destination/address-contract";
import { AdminField, AdminLabel } from "@/components/admin/admin-form-shell";
const responseSchema = z.object({
  available: z.boolean(),
  communes: z.array(communeSchema),
  reason: z.string().nullable(),
});
export default function DestinationAddressField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Commune[]>([]);
  const [selected, setSelected] = useState<Commune>();
  const [detail, setDetail] = useState(value);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (value !== formatDestinationAddress(detail, selected)) {
      setDetail(value);
      setSelected(undefined);
    }
  }, [value]);
  useEffect(() => {
    if (composing) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFeedback("");
      void fetchAuthWithTimeout(
        "/api/admin/destinations/address?" + new URLSearchParams({ q: query }),
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok || !body.success)
            throw Error(
              "Không thể tải danh mục. Nhập địa chỉ văn bản hoặc thử lại.",
            );
          const data = responseSchema.parse(body.data);
          if (!controller.signal.aborted) {
            setRows(data.communes);
            setFeedback(data.reason ?? "");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setRows([]);
            setFeedback(
              "Không thể tải xã/phường. Nhập địa chỉ văn bản; nội dung được giữ nguyên.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, reload, composing]);
  return (
    <div>
      <div className="af-grid-2">
        <AdminField>
          <AdminLabel htmlFor="destination-commune-search" optional>
            Tìm xã/phường
          </AdminLabel>
          <div className="dv3-search">
            <input
              id="destination-commune-search"
              className="af-input"
              value={query}
              placeholder="Tên xã/phường, có hoặc không dấu"
              onChange={(e) => setQuery(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
            />
            {query && (
              <button
                type="button"
                className="af-btn"
                aria-label="Xóa tìm kiếm xã/phường"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            )}
          </div>
        </AdminField>
        <AdminField>
          <AdminLabel htmlFor="destination-commune" optional>
            Xã/phường · Tuyên Quang
          </AdminLabel>
          <select
            id="destination-commune"
            className="af-select"
            value={selected?.code ?? ""}
            onChange={(e) => {
              const commune =
                rows.find((c) => c.code === e.target.value) ??
                (selected?.code === e.target.value ? selected : undefined);
              setSelected(commune);
              onChange(formatDestinationAddress(detail, commune));
            }}
          >
            <option value="">Chưa chọn / giữ địa chỉ văn bản</option>
            {selected && !rows.some((c) => c.code === selected.code) && (
              <option value={selected.code}>{selected.name}</option>
            )}
            {rows.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </AdminField>
      </div>
      <p
        className="af-helper"
        role="status"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading
          ? "Đang tải xã/phường…"
          : feedback ||
            (rows.length
              ? `${rows.length} xã/phường phù hợp. Danh mục hành chính không xác nhận phạm vi du lịch Hà Giang trước sáp nhập.`
              : "Không tìm thấy xã/phường phù hợp.")}
      </p>
      {feedback && (
        <button
          type="button"
          className="af-btn"
          onClick={() => setReload((n) => n + 1)}
        >
          Thử tải danh mục lại
        </button>
      )}
      <AdminField error={error} errorId="err-address">
        <AdminLabel htmlFor="destination-address" optional>
          {selected ? "Địa chỉ chi tiết" : "Địa chỉ văn bản / chi tiết"}
        </AdminLabel>
        <input
          id="destination-address"
          className="af-input"
          value={detail}
          maxLength={1000}
          onChange={(e) => {
            setDetail(e.target.value);
            onChange(formatDestinationAddress(e.target.value, selected));
          }}
          aria-invalid={Boolean(error)}
          aria-describedby="address-help err-address"
        />
        <p id="address-help" className="af-helper">
          {selected
            ? `Địa chỉ lưu: ${value || "Chưa có"}`
            : "Địa chỉ cũ được giữ nguyên nếu bạn không chỉnh sửa. Không tự chuyển đổi tên đơn vị lịch sử."}
        </p>
      </AdminField>
    </div>
  );
}
