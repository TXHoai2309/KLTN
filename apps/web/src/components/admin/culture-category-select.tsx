"use client";
import { useState, useRef, useId } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/* ── Standardized Culture Categories ─────────────────────────────────────── */
// Stable keys (value stored in DB), Vietnamese display labels
import {
  CULTURE_CATEGORIES,
  resolveCategoryLabel,
  normalizeCultureCategorySearch as normalize,
} from "@/modules/culture/culture-categories";

/* ── CultureCategorySelect ────────────────────────────────────────────────── */
export function CultureCategorySelect({
  value,
  id,
  onChange,
  disabled,
  error,
}: {
  value: string | null;
  id?: string;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const uid = useId();
  const panelId = uid + "-panel";
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const searchNorm = normalize(search);
  const filtered = CULTURE_CATEGORIES.filter(
    (c) =>
      !searchNorm ||
      normalize(c.label).includes(searchNorm) ||
      c.value.includes(searchNorm),
  );

  // Is the current stored value a legacy free-text (not in standard list)?
  const isLegacy =
    value !== null && !CULTURE_CATEGORIES.some((c) => c.value === value);
  const displayLabel = resolveCategoryLabel(value);

  function select(v: string | null) {
    onChange(v);
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
  }

  function handleBlur(e: React.FocusEvent) {
    // Close if focus leaves the combobox
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setOpen(false);
      setSearch("");
    }
  }

  return (
    <div
      className="af-combobox"
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      {/* Trigger / selected value display */}
      <button
        type="button"
        ref={triggerRef}
        id={id}
        disabled={disabled}
        role="combobox"
        aria-label="Danh mục văn hóa"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="listbox"
        aria-invalid={!!error}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
        className={`af-combobox-trigger${open ? " is-focused" : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        {value ? (
          <span style={{ flex: 1, fontSize: 14, color: "var(--af-ink)" }}>
            {displayLabel}
            {isLegacy && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--af-muted)",
                  marginLeft: 6,
                }}
              >
                (danh mục cũ)
              </span>
            )}
          </span>
        ) : (
          <span style={{ flex: 1, fontSize: 14, color: "var(--af-muted)" }}>
            Chọn danh mục văn hóa…
          </span>
        )}
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{
            color: "var(--af-muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 0.15s",
          }}
        />
      </button>
      {value && (
        <button
          type="button"
          className="af-btn"
          disabled={disabled}
          onClick={() => select(null)}
          aria-label="Xóa lựa chọn danh mục"
        >
          <X size={14} />
          Bỏ chọn
        </button>
      )}

      {/* Dropdown panel */}
      {open && !disabled && (
        <div
          id={panelId}
          className="af-combobox-panel"
          aria-label="Danh mục văn hóa"
        >
          {/* Search */}
          <div style={{ padding: "4px 4px 6px" }}>
            <input
              ref={inputRef}
              className="af-input"
              style={{ minHeight: 38, fontSize: 13 }}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm danh mục…"
              aria-label="Tìm kiếm danh mục"
              aria-autocomplete="list"
              aria-controls={panelId}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const options = e.currentTarget
                    .closest(".af-combobox-panel")
                    ?.querySelectorAll<HTMLElement>('[role="option"]');
                  (e.key === "ArrowDown"
                    ? options?.[0]
                    : options?.[options.length - 1]
                  )?.focus();
                }
                if (e.key === "Enter" && filtered.length === 1) {
                  e.preventDefault();
                  select(filtered[0]!.value);
                }
              }}
            />
          </div>

          <div role="listbox" aria-label="Các danh mục">
            {/* Options */}
            {filtered.length === 0 ? (
              <p className="af-combobox-empty">
                Không tìm thấy danh mục phù hợp.
              </p>
            ) : (
              filtered.map((cat) => {
                const isSelected = value === cat.value;
                return (
                  <div
                    key={cat.value}
                    className={`af-combobox-option${isSelected ? "" : ""}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(cat.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(cat.value);
                      }
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const options = Array.from(
                          e.currentTarget.parentElement!.querySelectorAll<HTMLElement>(
                            '[role="option"]',
                          ),
                        );
                        options[
                          (options.indexOf(e.currentTarget) +
                            (e.key === "ArrowDown" ? 1 : options.length - 1)) %
                            options.length
                        ]?.focus();
                      }
                    }}
                    tabIndex={0}
                  >
                    <span className="af-combobox-check">
                      {isSelected ? (
                        <Check size={15} />
                      ) : (
                        <span style={{ display: "inline-block", width: 15 }} />
                      )}
                    </span>
                    {cat.label}
                  </div>
                );
              })
            )}
          </div>
          {/* Legacy value option */}
          {isLegacy && value && (
            <>
              <hr
                style={{
                  border: 0,
                  borderTop: "1px solid var(--af-line)",
                  margin: "4px 0",
                }}
              />
              <div className="af-combobox-option" style={{ opacity: 0.7 }}>
                <Check size={15} className="af-combobox-check" />
                <span>
                  {value}{" "}
                  <span style={{ fontSize: 11, color: "var(--af-muted)" }}>
                    (danh mục cũ — đang hiển thị)
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
