"use client";

import { Clock, Heart, LoaderCircle, MapPin, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getDestinationVisual } from "@/lib/destination-visuals";
import { toMinute } from "@/modules/destination/destination-contract";
import {
  startDestinationRequest,
  type DestinationRequestState,
} from "@/modules/destination/destination-search-client";
import {
  formatSuggestedDuration,
  publicDestinationDetailSchema,
} from "@/modules/destination/public-destination-contract";
import type { PublicLocation } from "@/modules/destination/public-destination-query";
import { loadFavorites } from "@/modules/favorite/favorite-client";
import {
  computeSmartVisitTiming,
  extractFavoriteDestinationIds,
  filterDrawerDestinations,
  formatOpeningSummaryForDate,
  type EditCatalogDestinationMeta,
} from "@/modules/trip-edit/add-visit-helper";
import styles from "./edit-trip.module.css";

type Props = {
  open: boolean;
  targetDayIndex: number | null;
  targetLocalDate: string | null;
  targetDayVisits: readonly { startMinute: number; plannedDurationMinutes: number }[];
  catalogMeta?: Record<string, EditCatalogDestinationMeta>;
  returnFocusTo?: HTMLElement | null;
  eyebrowText?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirmAdd: (input: {
    dayIndex: number;
    destination: PublicLocation;
    meta: EditCatalogDestinationMeta | null;
    startMinute: number;
    plannedDurationMinutes: number;
  }) => void;
};

function DrawerThumb({ item }: { item: PublicLocation }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fallback = getDestinationVisual(item.name, item.area);
  const usable = item.image && item.image.url !== failedUrl;
  return (
    <img
      src={usable ? item.image!.url : fallback.src}
      alt={usable ? item.image!.alt : fallback.alt}
      className={styles.drawerCardImg}
      loading="lazy"
      onError={() => {
        if (usable) setFailedUrl(item.image!.url);
      }}
    />
  );
}

export default function AddVisitDrawer({
  open,
  targetDayIndex,
  targetLocalDate,
  targetDayVisits,
  catalogMeta = {},
  returnFocusTo,
  eyebrowText,
  confirmLabel,
  onClose,
  onConfirmAdd,
}: Props) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [requestState, setRequestState] = useState<DestinationRequestState>({ status: "loading" });
  const [knownRegions, setKnownRegions] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoritesError, setFavoritesError] = useState(false);
  const [fetchedMeta, setFetchedMeta] = useState<Record<string, EditCatalogDestinationMeta>>({});

  const [selectedItem, setSelectedItem] = useState<PublicLocation | null>(null);
  const [startTimeInput, setStartTimeInput] = useState("08:00");
  const [durationInput, setDurationInput] = useState("60");
  const [formError, setFormError] = useState<string | null>(null);
  const manuallyEditedTimingRef = useRef(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  // Move focus into search input on open and restore focus to opener on close.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setSelectedItem(null);
      setFormError(null);
      manuallyEditedTimingRef.current = false;
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusTo?.focus();
    }
  }, [open, returnFocusTo]);

  // Escape key closes drawer cleanly.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Load owner's favorites while Drawer is open.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setFavoritesError(false);
    loadFavorites(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setFavoriteIds(extractFavoriteDestinationIds(list));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFavoritesError(true);
        }
      });
    return () => controller.abort();
  }, [open]);

  // Load VISIBLE destinations via public /api/destinations endpoint.
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (region.trim()) params.set("region", region.trim());

    let stopPrevious: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      stopPrevious = startDestinationRequest(params, (nextState) => {
        setRequestState(nextState);
        if (nextState.status === "ready") {
          setKnownRegions((current) => {
            const merged = new Set([...current, ...nextState.data.filters.regions]);
            return [...merged].sort((a, b) => a.localeCompare(b, "vi"));
          });
        }
      });
    }, query.trim() ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      stopPrevious?.();
    };
  }, [open, query, region, retryTick]);

  function resolveMeta(destinationId: string): EditCatalogDestinationMeta | null {
    return catalogMeta[destinationId] ?? fetchedMeta[destinationId] ?? null;
  }

  function handleSelectItem(item: PublicLocation) {
    setSelectedItem(item);
    setFormError(null);
    manuallyEditedTimingRef.current = false;

    const existingMeta = resolveMeta(item.id);
    const smart = computeSmartVisitTiming({
      dayVisits: targetDayVisits,
      localDate: targetLocalDate,
      meta: existingMeta,
    });
    setStartTimeInput(smart.startTime);
    setDurationInput(String(smart.durationMinutes));

    if (!existingMeta) {
      fetch(`/api/destinations/${encodeURIComponent(item.id)}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok || body?.success !== true) return;
          const parsed = publicDestinationDetailSchema.safeParse(body.data);
          if (!parsed.success) return;
          const detailMeta: EditCatalogDestinationMeta = {
            suggestedDurationMinutes: parsed.data.suggestedDurationMinutes,
            minimumDurationMinutes: null,
            isOutdoor: parsed.data.isOutdoor,
            openingDays: parsed.data.openingDays.map((day) => ({
              dayOfWeek: day.dayOfWeek,
              status: day.status,
              intervals: day.intervals,
            })),
          };
          setFetchedMeta((current) => ({ ...current, [item.id]: detailMeta }));
          if (!manuallyEditedTimingRef.current) {
            const refreshed = computeSmartVisitTiming({
              dayVisits: targetDayVisits,
              localDate: targetLocalDate,
              meta: detailMeta,
            });
            setStartTimeInput(refreshed.startTime);
            setDurationInput(String(refreshed.durationMinutes));
          }
        })
        .catch(() => {
          // Keep default fallback timing when optional detail lookup is offline.
        });
    }
  }

  function handleConfirm() {
    if (!selectedItem || targetDayIndex === null) return;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTimeInput)) {
      setFormError("Giờ bắt đầu phải đúng định dạng HH:mm (từ 00:00 đến 23:59).");
      return;
    }
    const duration = Number(durationInput.trim());
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
      setFormError("Thời lượng tham quan phải từ 1 đến 1440 phút.");
      return;
    }
    setFormError(null);
    onConfirmAdd({
      dayIndex: targetDayIndex,
      destination: selectedItem,
      meta: resolveMeta(selectedItem.id),
      startMinute: toMinute(startTimeInput),
      plannedDurationMinutes: duration,
    });
  }

  const visibleItems = useMemo(() => {
    if (requestState.status !== "ready") return [];
    return filterDrawerDestinations(requestState.data.items, favoritesOnly, favoriteIds);
  }, [requestState, favoritesOnly, favoriteIds]);

  const hasFilters = Boolean(query.trim() || region.trim() || favoritesOnly);

  if (!open || targetDayIndex === null) return null;

  const selectedMeta = selectedItem ? resolveMeta(selectedItem.id) : null;
  const selectedOpening = selectedItem
    ? formatOpeningSummaryForDate(selectedMeta?.openingDays, targetLocalDate)
    : null;

  return (
    <div
      className={styles.drawerBackdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.drawerPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-visit-drawer-title"
      >
        <header className={styles.drawerHeader}>
          <div>
            <p className={styles.eyebrow}>
              {eyebrowText ?? `Thêm điểm dừng vào Ngày ${targetDayIndex}`}
            </p>
            <h2 id="add-visit-drawer-title">Chọn điểm đến công khai</h2>
          </div>
          <button
            type="button"
            className={styles.iconActionBtn}
            onClick={onClose}
            aria-label="Đóng ngăn chọn điểm đến"
          >
            <X size={16} aria-hidden="true" />
            Đóng
          </button>
        </header>

        <div className={styles.drawerFilters}>
          <label className={styles.drawerSearchField}>
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              placeholder="Tìm tên điểm đến (vd: Lũng Cú, Đồng Văn)…"
              aria-label="Tìm điểm đến theo tên"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className={styles.drawerFilterRow}>
            <label className={styles.inlineField}>
              <span>Khu vực</span>
              <select
                aria-label="Lọc theo khu vực"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              >
                <option value="">Tất cả khu vực</option>
                {knownRegions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={`${styles.filterChipBtn} ${favoritesOnly ? styles.filterChipActive : ""}`}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((prev) => !prev)}
            >
              <Heart size={14} aria-hidden="true" />
              Yêu thích {favoriteIds.size > 0 ? `(${favoriteIds.size})` : ""}
            </button>
          </div>
          {favoritesError && favoritesOnly && (
            <p className={styles.fixedNote}>
              Không tải được danh sách yêu thích; bạn vẫn có thể tìm trên toàn bộ điểm công khai.
            </p>
          )}
        </div>

        <div className={styles.drawerBody}>
          {requestState.status === "loading" && (
            <div className={styles.drawerStateBox} role="status" aria-busy="true">
              <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
              <p>Đang tải điểm đến công khai…</p>
            </div>
          )}

          {requestState.status === "error" && (
            <div className={styles.drawerStateBox} role="alert">
              <p className={styles.errorText}>
                Không tải được danh sách điểm đến công khai. Vui lòng kiểm tra kết nối và thử lại.
              </p>
              <button
                type="button"
                className={styles.toolButton}
                onClick={() => setRetryTick((tick) => tick + 1)}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Thử lại
              </button>
            </div>
          )}

          {requestState.status === "ready" && visibleItems.length === 0 && (
            <div className={styles.drawerStateBox} role="status">
              <p>
                {favoritesOnly
                  ? "Không có điểm yêu thích nào khớp bộ lọc hiện tại."
                  : hasFilters
                    ? "Không tìm thấy điểm đến phù hợp với từ khóa hoặc khu vực đã chọn."
                    : "Chưa có điểm đến công khai khả dụng."}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  className={styles.toolButton}
                  onClick={() => {
                    setQuery("");
                    setRegion("");
                    setFavoritesOnly(false);
                  }}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          )}

          {requestState.status === "ready" && visibleItems.length > 0 && (
            <ul className={styles.drawerList}>
              {visibleItems.map((item) => {
                const meta = resolveMeta(item.id);
                const opening = formatOpeningSummaryForDate(meta?.openingDays, targetLocalDate);
                const isSelected = selectedItem?.id === item.id;
                const isFav = favoriteIds.has(item.id);
                const durationLabel =
                  meta?.suggestedDurationMinutes != null
                    ? `Gợi ý ${formatSuggestedDuration(meta.suggestedDurationMinutes)}`
                    : "Chưa có thời lượng gợi ý (mặc định 60 phút)";
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`${styles.drawerCard} ${isSelected ? styles.drawerCardSelected : ""}`}
                      onClick={() => handleSelectItem(item)}
                      aria-pressed={isSelected}
                    >
                      <DrawerThumb item={item} />
                      <div className={styles.drawerCardBody}>
                        <div className={styles.drawerCardTitleRow}>
                          <strong>{item.name}</strong>
                          {isFav && (
                            <span className={styles.drawerFavBadge} title="Trong danh sách yêu thích">
                              <Heart size={12} aria-hidden="true" />
                              Yêu thích
                            </span>
                          )}
                        </div>
                        <span className={styles.visitArea}>
                          <MapPin size={12} aria-hidden="true" />
                          {item.area} · {item.category}
                        </span>
                        <span className={styles.drawerCardMeta}>
                          <Clock size={12} aria-hidden="true" />
                          {opening.label} · {durationLabel}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className={styles.drawerFooter}>
          {selectedItem ? (
            <div className={styles.drawerSelectionForm}>
              <div className={styles.drawerSelectionInfo}>
                <strong>{selectedItem.name}</strong>
                {selectedOpening && <span className={styles.fixedNote}>{selectedOpening.label}</span>}
              </div>
              <div className={styles.drawerTimingRow}>
                <label className={styles.inlineField}>
                  <span>Giờ bắt đầu</span>
                  <input
                    type="time"
                    step={60}
                    value={startTimeInput}
                    aria-label="Giờ bắt đầu điểm sắp thêm"
                    onChange={(event) => {
                      manuallyEditedTimingRef.current = true;
                      setStartTimeInput(event.target.value);
                    }}
                  />
                </label>
                <label className={styles.inlineField}>
                  <span>Thời lượng (phút)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    value={durationInput}
                    aria-label="Thời lượng điểm sắp thêm"
                    onChange={(event) => {
                      manuallyEditedTimingRef.current = true;
                      setDurationInput(event.target.value);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleConfirm}
                >
                  <Plus size={15} aria-hidden="true" />
                  {confirmLabel ?? `Thêm vào Ngày ${targetDayIndex}`}
                </button>
              </div>
              {formError && <p className={styles.errorText} role="alert">{formError}</p>}
            </div>
          ) : (
            <p className={styles.fixedNote}>
              Chọn một điểm đến ở trên để tự điền giờ nối tiếp và thời lượng tham quan gợi ý.
            </p>
          )}
        </footer>
      </section>
    </div>
  );
}
