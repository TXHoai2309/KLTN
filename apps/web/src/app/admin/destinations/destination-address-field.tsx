"use client";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { Search, ChevronDown, Check, X, RotateCw, MapPin, LoaderCircle } from "lucide-react";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import {
  addressSearchText,
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

/** Combobox searchable với dữ liệu xã/phường từ AddressKit. */
export default function DestinationAddressField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const listboxId = useId();
  const inputId = useId();

  // ── State ──────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [allRows, setAllRows] = useState<Commune[]>([]);
  const [selected, setSelected] = useState<Commune | undefined>(undefined);
  const [detail, setDetail] = useState(value);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiReason, setApiReason] = useState("");
  const [reload, setReload] = useState(0);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [fetched, setFetched] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ── Sync khi value thay đổi từ ngoài (Edit mode) ─────────────────────────
  useEffect(() => {
    if (value !== formatDestinationAddress(detail, selected)) {
      setDetail(value);
      setSelected(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ── Client-side filter danh sách theo query ────────────────────────────────
  const rows =
    query.trim() === ""
      ? allRows
      : allRows.filter((c) =>
          addressSearchText(c.name).includes(addressSearchText(query)),
        );

  // ── Fetch từ AddressKit – chỉ fetch một lần khi component mount ───────────
  useEffect(() => {
    if (composing) return;
    if (fetched && !apiError) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setApiError("");
      void fetchAuthWithTimeout(
        "/api/admin/destinations/address?" + new URLSearchParams({ q: "" }),
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
            setAllRows(data.communes);
            setApiReason(data.reason ?? "");
            setApiError("");
            setFetched(true);
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setAllRows([]);
          setApiError(
            (err instanceof Error && err.message) ||
              "Không thể tải xã/phường. Nhập địa chỉ văn bản; nội dung được giữ nguyên.",
          );
          setFetched(false);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [reload, composing, fetched, apiError]);

  // ── Đóng khi click ngoài ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Cuộn option đang active vào view ──────────────────────────────────────
  useEffect(() => {
    if (!listRef.current || activeIdx < 0) return;
    const items = listRef.current.querySelectorAll<HTMLLIElement>("[role='option']");
    items[activeIdx]?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openDropdown = () => {
    setOpen(true);
    const idx = selected ? rows.findIndex((c) => c.code === selected.code) : -1;
    setActiveIdx(idx >= 0 ? idx : -1);
  };

  const handleSelect = (commune: Commune | undefined) => {
    setSelected(commune);
    setQuery(commune ? commune.name : "");
    onChange(formatDestinationAddress(detail, commune));
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setSelected(undefined);
    setQuery("");
    onChange(formatDestinationAddress(detail, undefined));
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openDropdown();
        setActiveIdx((prev) => Math.min(prev + 1, rows.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((prev) => Math.max(prev - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (open && activeIdx >= 0 && rows[activeIdx]) {
          handleSelect(rows[activeIdx]);
        } else if (!open) {
          openDropdown();
        }
        break;
      case "Escape":
        e.preventDefault();
        if (open) {
          setOpen(false);
          setActiveIdx(-1);
        } else if (selected) {
          handleClear();
        }
        break;
      case "Tab":
        if (open) {
          if (activeIdx >= 0 && rows[activeIdx]) handleSelect(rows[activeIdx]);
          else setOpen(false);
        }
        break;
    }
  };

  // ── Trạng thái hiển thị ───────────────────────────────────────────────────
  const hasResult = rows.length > 0;
  const activeOptionId =
    activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined;

  const placeholder = loading
    ? "Đang tải danh mục xã/phường..."
    : fetched
      ? `Tìm trong ${allRows.length} xã/phường (có hoặc không dấu)...`
      : apiError
        ? "Lỗi kết nối - nhập địa chỉ chi tiết bên cạnh"
        : "Nhập tên xã, phường để tìm kiếm...";

  const formattedAddress = formatDestinationAddress(detail, selected);

  return (
    <div className="dv3-address-wrap">
      <div className="af-grid-2">
        {/* ── Cột 1: Combobox xã/phường ─────────────────────────────────────────── */}
        <AdminField>
          <AdminLabel htmlFor={inputId} optional>
            Xã/phường · Tuyên Quang
          </AdminLabel>

          <div
            className={`af-combobox dv3-commune-combobox${apiError ? " is-error" : ""}`}
            ref={wrapRef}
          >
            {/* Trigger container */}
            <div
              className={`af-combobox-trigger dv3-combobox-trigger${focused ? " is-focused" : ""}${apiError ? " is-error" : ""}${selected ? " has-value" : ""}`}
              onClick={() => {
                if (!open) {
                  openDropdown();
                  inputRef.current?.focus();
                }
              }}
            >
              <Search size={16} className="dv3-combobox-search-icon" aria-hidden="true" />

              <input
                ref={inputRef}
                id={inputId}
                type="text"
                role="combobox"
                autoComplete="off"
                spellCheck={false}
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                aria-invalid={Boolean(apiError)}
                className="af-combobox-input dv3-combobox-input"
                value={open || !selected ? query : selected.name}
                placeholder={placeholder}
                readOnly={loading}
                onFocus={() => {
                  setFocused(true);
                  if (!open) {
                    if (selected) setQuery("");
                    openDropdown();
                  }
                }}
                onBlur={() => {
                  setFocused(false);
                  if (!open) {
                    if (selected) setQuery(selected.name);
                    else setQuery("");
                  }
                }}
                onChange={(e) => {
                  const q = e.target.value;
                  setQuery(q);
                  if (!open) setOpen(true);
                  setActiveIdx(-1);
                }}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                onKeyDown={handleKeyDown}
              />

              {/* Spinner khi loading */}
              {loading && (
                <LoaderCircle
                  size={16}
                  className="af-spinner dv3-combobox-spinner"
                  aria-hidden="true"
                />
              )}

              {/* Nút xóa lựa chọn */}
              {selected && !loading && (
                <button
                  type="button"
                  className="dv3-combobox-clear"
                  aria-label="Xóa lựa chọn xã/phường"
                  title="Bỏ chọn xã/phường"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}

              {/* Mũi tên dropdown */}
              <span
                className={`dv3-combobox-chevron${open ? " is-open" : ""}`}
                aria-hidden="true"
              >
                <ChevronDown size={16} />
              </span>
            </div>

            {/* Dropdown panel */}
            {open && (
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label="Danh sách xã/phường Tuyên Quang"
                className="af-combobox-panel dv3-combobox-panel"
              >
                {loading && (
                  <li className="af-combobox-loading" role="status">
                    <div className="dv3-loading-row">
                      <LoaderCircle size={15} className="af-spinner" />
                      <span>Đang tải danh sách xã/phường...</span>
                    </div>
                  </li>
                )}

                {!loading && apiError && (
                  <li className="af-combobox-error">
                    <span>{apiError}</span>
                    <button
                      type="button"
                      className="af-btn dv3-retry-btn"
                      onClick={() => {
                        setFetched(false);
                        setApiError("");
                        setReload((n) => n + 1);
                      }}
                    >
                      <RotateCw size={13} style={{ marginRight: 6 }} />
                      Thử lại
                    </button>
                  </li>
                )}

                {!loading && !apiError && !hasResult && (
                  <li className="af-combobox-empty" role="status">
                    {query.trim()
                      ? `Không tìm thấy xã/phường phù hợp với "${query}".`
                      : "Không có dữ liệu xã/phường."}
                  </li>
                )}

                {!loading &&
                  !apiError &&
                  rows.map((c, idx) => {
                    const isSelected = c.code === selected?.code;
                    const isActive = idx === activeIdx;
                    return (
                      <li
                        key={c.code}
                        id={`${listboxId}-opt-${idx}`}
                        role="option"
                        aria-selected={isSelected}
                        className={`af-combobox-option dv3-combobox-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelect(c);
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                      >
                        <div className="dv3-option-content">
                          <span className="dv3-option-name">{c.name}</span>
                          <span className="dv3-option-meta">Tuyên Quang</span>
                        </div>
                        {isSelected && (
                          <span className="dv3-option-check" aria-hidden="true">
                            <Check size={14} />
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          {/* Status helper text */}
          <div className="dv3-field-status">
            {selected ? (
              <span className="dv3-status-pill is-success">
                <Check size={12} />
                <span>Đã chọn: <strong>{selected.name}</strong></span>
              </span>
            ) : (
              <p
                className="af-helper"
                role="status"
                aria-live="polite"
                aria-busy="false"
              >
                {apiReason || (fetched ? `${allRows.length} xã/phường hành chính khả dụng` : "Chọn xã/phường thuộc Tuyên Quang")}
              </p>
            )}
          </div>
        </AdminField>

        {/* ── Cột 2: Địa chỉ chi tiết ───────────────────────────────────────────── */}
        <AdminField error={error} errorId="err-address">
          <AdminLabel htmlFor="destination-address" optional>
            {selected ? "Địa chỉ chi tiết" : "Địa chỉ văn bản / chi tiết"}
          </AdminLabel>
          <div className="dv3-detail-input-wrap">
            <input
              id="destination-address"
              className="af-input dv3-detail-input"
              value={detail}
              maxLength={1000}
              placeholder="Số nhà, ngõ, thôn, bản (nếu có)..."
              onChange={(e) => {
                setDetail(e.target.value);
                onChange(formatDestinationAddress(e.target.value, selected));
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="address-help err-address"
            />
          </div>
          <div className="dv3-field-status">
            {selected ? (
              <p id="address-help" className="af-helper dv3-address-preview">
                <MapPin size={12} className="dv3-preview-pin" />
                <span>Địa chỉ lưu: <strong>{formattedAddress || "Chưa có"}</strong></span>
              </p>
            ) : (
              <p id="address-help" className="af-helper">
                Địa chỉ cũ được giữ nguyên nếu bạn không chỉnh sửa.
              </p>
            )}
          </div>
        </AdminField>
      </div>
    </div>
  );
}
