"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import {
  Compass,
  CalendarDays,
  CarFront,
  Clock3,
  MapPin,
  Search,
  Users,
  RotateCcw,
  Plus,
  X,
  AlertCircle,
  LogIn,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import type { PublicCompanion, CompanionList } from "@/modules/trip-companions/companion-contract";
import {
  fetchPublicCompanions,
  fetchMyCompanionPublications,
  fetchJoinedCompanions,
  fetchCompanionUnread,
  CompanionClientError,
} from "@/modules/trip-companions/companion-client";
import { buildAuthLoginHref } from "@/lib/auth-return-to";

function formatRangeVi(startStr: string, endStr: string): string {
  const [sY, sM, sD] = startStr.split("-");
  const [eY, eM, eD] = endStr.split("-");
  if (!sY || !eY) return `${startStr} – ${endStr}`;
  if (sY === eY && sM === eM) {
    return `${sD} – ${eD}/${sM}/${sY}`;
  }
  if (sY === eY) {
    return `${sD}/${sM} – ${eD}/${eM}/${sY}`;
  }
  return `${sD}/${sM}/${sY} – ${eD}/${eM}/${eY}`;
}

export function getHighlandFallbackPhoto(title: string, route: Array<{ name: string }>, durationDays: number): string {
  const text = (title + " " + route.map((r) => r.name).join(" ")).toLowerCase();
  if (text.includes("nho quế") || text.includes("mã pí lèng") || text.includes("tu sản")) {
    return "/images/ha-giang-hero.webp";
  }
  if (text.includes("lũng cú") || text.includes("cột cờ")) {
    return "/images/gallery/ha-giang-day3-lg.webp";
  }
  if (text.includes("quản bạ") || text.includes("núi đôi") || text.includes("cổng trời")) {
    return "/images/gallery/ha-giang-twin-mountain.webp";
  }
  if (text.includes("hoàng su phì") || text.includes("ruộng bậc thang")) {
    return "/images/gallery/ha-giang-terraces-golden.webp";
  }
  if (text.includes("dinh") || text.includes("vương") || text.includes("đồng văn") || text.includes("phố cổ")) {
    return "/images/gallery/ha-giang-stone-village-plum.webp";
  }
  if (text.includes("mèo vạc") || text.includes("pả vi") || text.includes("tam giác mạch")) {
    return "/images/gallery/ha-giang-buckwheat-harvest.webp";
  }
  if (durationDays >= 4) return "/images/ha-giang-hero.webp";
  if (durationDays === 3) return "/images/gallery/ha-giang-stone-village-plum.webp";
  if (durationDays === 2) return "/images/gallery/ha-giang-twin-mountain.webp";
  return "/images/gallery/ha-giang-season-buckwheat.webp";
}

export interface CompanionDiscoveryViewProps {
  initialData?: CompanionList | null;
  initialTab?: "explore" | "mine" | "joined";
}

export function CompanionDiscoveryView({
  initialData,
  initialTab = "explore",
}: CompanionDiscoveryViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read URL search params
  const tabParamRaw = searchParams.get("tab");
  const tabParam: "explore" | "mine" | "joined" =
    tabParamRaw === "mine" ? "mine" : tabParamRaw === "joined" ? "joined" : initialTab;

  const qParam = searchParams.get("q") ?? "";
  const fromParam = searchParams.get("departureFrom") ?? "";
  const toParam = searchParams.get("departureTo") ?? "";
  const transportParam = (searchParams.get("transport") as "CAR" | "MOTORCYCLE") || "";
  const availableParam = searchParams.get("availableOnly") === "true";

  const [tab, setTab] = useState<"explore" | "mine" | "joined">(tabParam);
  const [q, setQ] = useState(qParam);
  const [departureFrom, setDepartureFrom] = useState(fromParam);
  const [departureTo, setDepartureTo] = useState(toParam);
  const [transport, setTransport] = useState<"CAR" | "MOTORCYCLE" | "">(transportParam);
  const [availableOnly, setAvailableOnly] = useState(availableParam);

  const [items, setItems] = useState<PublicCompanion[]>(initialData?.items ?? []);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [isUnauthenticatedTab, setIsUnauthenticatedTab] = useState<"mine" | "joined" | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const loadUnread = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const unreadData = await fetchCompanionUnread();
      const map: Record<string, number> = {};
      for (const item of unreadData.items) {
        if (item.unreadCount > 0) {
          map[item.publicationId] = item.unreadCount;
        }
      }
      setUnreadMap(map);
    } catch {
      // Silently ignore if unauthenticated or network error
    }
  }, []);

  useEffect(() => {
    void loadUnread();

    const interval = setInterval(() => {
      void loadUnread();
    }, 15000);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadUnread();
      }
    };

    const handleOnline = () => {
      void loadUnread();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [loadUnread]);

  // Sync state if URL changes externally
  useEffect(() => {
    const currentTabRaw = searchParams.get("tab");
    setTab(currentTabRaw === "mine" ? "mine" : currentTabRaw === "joined" ? "joined" : "explore");
    setQ(searchParams.get("q") ?? "");
    setDepartureFrom(searchParams.get("departureFrom") ?? "");
    setDepartureTo(searchParams.get("departureTo") ?? "");
    setTransport((searchParams.get("transport") as "CAR" | "MOTORCYCLE") || "");
    setAvailableOnly(searchParams.get("availableOnly") === "true");
  }, [searchParams]);

  // Update URL helper
  const updateUrl = useCallback(
    (newParams: {
      tab?: "explore" | "mine" | "joined";
      q?: string;
      departureFrom?: string;
      departureTo?: string;
      transport?: "CAR" | "MOTORCYCLE" | "";
      availableOnly?: boolean;
    }) => {
      const params = new URLSearchParams();
      const currentTab = newParams.tab ?? tab;
      if (currentTab === "mine") params.set("tab", "mine");
      else if (currentTab === "joined") params.set("tab", "joined");

      const queryQ = newParams.q !== undefined ? newParams.q : q;
      if (queryQ.trim()) params.set("q", queryQ.trim());

      const from = newParams.departureFrom !== undefined ? newParams.departureFrom : departureFrom;
      if (from) params.set("departureFrom", from);

      const to = newParams.departureTo !== undefined ? newParams.departureTo : departureTo;
      if (to) params.set("departureTo", to);

      const trans = newParams.transport !== undefined ? newParams.transport : transport;
      if (trans) params.set("transport", trans);

      const avail = newParams.availableOnly !== undefined ? newParams.availableOnly : availableOnly;
      if (avail) params.set("availableOnly", "true");

      const qs = params.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    },
    [tab, q, departureFrom, departureTo, transport, availableOnly, pathname, router],
  );

  // Fetch data
  const loadData = useCallback(
    async () => {
      setIsLoading(true);
      setError(null);
      setIsUnauthenticatedTab(null);

      try {
        const query = {
          q: q.trim(),
          departureFrom: departureFrom || undefined,
          departureTo: departureTo || undefined,
          transport: transport || undefined,
          availableOnly: availableOnly || undefined,
        };

        const result =
          tab === "joined"
            ? await fetchJoinedCompanions(query)
            : tab === "mine"
              ? await fetchMyCompanionPublications(query)
              : await fetchPublicCompanions(query);

        setItems(result.items);
        setTotal(result.total);
        setNextCursor(result.nextCursor);
      } catch (err: unknown) {
        if (err instanceof CompanionClientError) {
          if (err.status === 401 && (tab === "mine" || tab === "joined")) {
            setIsUnauthenticatedTab(tab);
            setItems([]);
            setTotal(0);
            setNextCursor(null);
            return;
          }
          setError({ code: err.code, message: err.message });
        } else {
          setError({
            code: "LOAD_ERROR",
            message: "Không thể tải danh sách chuyến đi. Vui lòng thử lại sau.",
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [tab, q, departureFrom, departureTo, transport, availableOnly],
  );

  // Trigger load when filters change
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current && initialData) {
      initialMount.current = false;
      return;
    }
    initialMount.current = false;

    const timer = setTimeout(() => {
      loadData();
    }, 250);
    return () => clearTimeout(timer);
  }, [tab, q, departureFrom, departureTo, transport, availableOnly, loadData, initialData]);

  // Load more items
  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const query = {
        q: q.trim(),
        departureFrom: departureFrom || undefined,
        departureTo: departureTo || undefined,
        transport: transport || undefined,
        availableOnly: availableOnly || undefined,
        cursor: nextCursor,
      };

      const result =
        tab === "joined"
          ? await fetchJoinedCompanions(query)
          : tab === "mine"
            ? await fetchMyCompanionPublications(query)
            : await fetchPublicCompanions(query);

      setItems((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (err: unknown) {
      if (err instanceof CompanionClientError) {
        setError({ code: err.code, message: err.message });
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleClearFilters = () => {
    setQ("");
    setDepartureFrom("");
    setDepartureTo("");
    setTransport("");
    setAvailableOnly(false);
    updateUrl({
      q: "",
      departureFrom: "",
      departureTo: "",
      transport: "",
      availableOnly: false,
    });
  };

  const activeFilterCount =
    (q ? 1 : 0) +
    (departureFrom ? 1 : 0) +
    (departureTo ? 1 : 0) +
    (transport ? 1 : 0) +
    (availableOnly ? 1 : 0);

  return (
    <div className="companion-discovery-root" data-testid="companion-discovery-view">
      {/* ─── Hero Section ─── */}
      <section className="companion-discovery-hero">
        <div className="companion-discovery-hero-copy">
          <p className="companion-eyebrow">
            <Users size={14} aria-hidden="true" />
            <span>Cộng đồng đồng hành</span>
          </p>
          <h1 className="companion-title">Tìm bạn đồng hành Hà Giang</h1>
          <p className="companion-sub-hero">
            Khám phá các chuyến đi sắp khởi hành, tìm bạn cùng chung cung đường hoặc đăng tin tìm bạn cho chuyến đi đã lưu của bạn.
          </p>
        </div>

        {/* Action: Link to saved Trips to publish */}
        <div className="companion-discovery-hero-action">
          <Link
            href={"/trips" as Route}
            className="companion-cta-button companion-create-trip-link"
            data-testid="companion-publish-trip-cta"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Đăng chuyến đi</span>
          </Link>
          <span className="companion-hero-tip">
            Chọn từ Chuyến đi đã lưu để công khai tìm bạn
          </span>
        </div>
      </section>

      {/* ─── Scope Tabs: Khám phá vs Tôi đăng vs Tôi tham gia ─── */}
      <div className="companion-discovery-tabs-bar" role="tablist" aria-label="Phạm vi chuyến đi">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "explore"}
          className={`companion-scope-tab ${tab === "explore" ? "is-active" : ""}`}
          onClick={() => {
            setTab("explore");
            updateUrl({ tab: "explore" });
          }}
          data-testid="tab-explore"
        >
          <Compass size={16} aria-hidden="true" />
          <span>Khám phá chuyến</span>
          {tab === "explore" && !isLoading && total > 0 && (
            <span className="companion-tab-badge">{total}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={`companion-scope-tab ${tab === "mine" ? "is-active" : ""}`}
          onClick={() => {
            setTab("mine");
            updateUrl({ tab: "mine" });
          }}
          data-testid="tab-mine"
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span>Chuyến tôi đăng</span>
          {tab === "mine" && !isLoading && !isUnauthenticatedTab && total > 0 && (
            <span className="companion-tab-badge">{total}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "joined"}
          className={`companion-scope-tab ${tab === "joined" ? "is-active" : ""}`}
          onClick={() => {
            setTab("joined");
            updateUrl({ tab: "joined" });
          }}
          data-testid="tab-joined"
        >
          <Users size={16} aria-hidden="true" />
          <span>Tôi tham gia</span>
          {tab === "joined" && !isLoading && !isUnauthenticatedTab && total > 0 && (
            <span className="companion-tab-badge">{total}</span>
          )}
        </button>
      </div>

      {/* ─── Filter Bar ─── */}
      <section className="companion-filter-card" aria-label="Bộ lọc chuyến đi">
        <div className="companion-filter-grid">
          {/* Keyword Search */}
          <div className="companion-filter-col-search">
            <label htmlFor="companion-search-input" className="companion-filter-label">
              Tìm kiếm
            </label>
            <div className="companion-search-wrap">
              <Search size={16} className="companion-search-icon" aria-hidden="true" />
              <input
                id="companion-search-input"
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  updateUrl({ q: e.target.value });
                }}
                placeholder="Tìm tiêu đề hoặc điểm đến trong tuyến..."
                className="companion-filter-input companion-search-input"
                data-testid="companion-search-input"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    updateUrl({ q: "" });
                  }}
                  className="companion-search-clear"
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Departure Date Range */}
          <div className="companion-filter-col-dates">
            <label className="companion-filter-label">
              Ngày khởi hành
            </label>
            <div className="companion-date-inputs">
              <input
                type="date"
                value={departureFrom}
                onChange={(e) => {
                  setDepartureFrom(e.target.value);
                  updateUrl({ departureFrom: e.target.value });
                }}
                className="companion-filter-input"
                aria-label="Khởi hành từ ngày"
                data-testid="companion-from-date"
              />
              <span className="companion-date-sep" aria-hidden="true">
                –
              </span>
              <input
                type="date"
                value={departureTo}
                min={departureFrom || undefined}
                onChange={(e) => {
                  setDepartureTo(e.target.value);
                  updateUrl({ departureTo: e.target.value });
                }}
                className="companion-filter-input"
                aria-label="Khởi hành đến ngày"
                data-testid="companion-to-date"
              />
            </div>
          </div>

          {/* Transport Select */}
          <div className="companion-filter-col-transport">
            <label htmlFor="companion-transport-select" className="companion-filter-label">
              Phương tiện
            </label>
            <select
              id="companion-transport-select"
              value={transport}
              onChange={(e) => {
                const val = e.target.value as "CAR" | "MOTORCYCLE" | "";
                setTransport(val);
                updateUrl({ transport: val });
              }}
              className="companion-filter-input companion-select"
              data-testid="companion-transport-select"
            >
              <option value="">Tất cả phương tiện</option>
              <option value="CAR">Ô tô</option>
              <option value="MOTORCYCLE">Xe máy</option>
            </select>
          </div>

          {/* Availability Checkbox & Reset */}
          <div className="companion-filter-col-actions">
            <label className="companion-checkbox-label">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => {
                  setAvailableOnly(e.target.checked);
                  updateUrl({ availableOnly: e.target.checked });
                }}
                className="companion-checkbox"
                data-testid="companion-available-checkbox"
              />
              <span>Chỉ hiện chuyến còn chỗ</span>
            </label>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="companion-clear-filters-btn"
                data-testid="companion-clear-filters"
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>Xóa bộ lọc ({activeFilterCount})</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── Active Error Feedback ─── */}
      {error && (
        <div className="companion-feedback-alert companion-feedback-danger my-4" role="alert">
          <AlertCircle size={20} className="shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <strong>Đã xảy ra lỗi:</strong> {error.message}
          </div>
          <button
            type="button"
            onClick={() => loadData()}
            className="companion-secondary-button text-xs py-1 px-3"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* ─── Guest Prompt for "Tôi đăng" / "Tôi tham gia" Tabs ─── */}
      {isUnauthenticatedTab ? (
        <div className="companion-card companion-guest-banner" data-testid="companion-guest-prompt">
          <div className="companion-guest-icon" aria-hidden="true">
            <LogIn size={28} />
          </div>
          <h2 className="text-lg font-bold m-0 text-foreground">
            {isUnauthenticatedTab === "mine"
              ? "Đăng nhập để xem các chuyến đi bạn đã đăng"
              : "Đăng nhập để xem các chuyến đi bạn đang tham gia"}
          </h2>
          <p className="text-sm text-muted-foreground m-0 max-w-md">
            {isUnauthenticatedTab === "mine"
              ? "Mục này lưu giữ các lời mời tìm bạn đồng hành cho những chuyến đi do bạn làm chủ. Đăng nhập để quản lý và theo dõi."
              : "Xem danh sách các chuyến đi bạn đã tham gia làm thành viên để mở nhanh lịch trình chi tiết và thảo luận nhóm."}
          </p>
          <Link
            href={buildAuthLoginHref(`/trip-companions?tab=${isUnauthenticatedTab}`) as Route}
            className="companion-cta-button mt-3"
          >
            <LogIn size={16} aria-hidden="true" />
            <span>Đăng nhập ngay</span>
          </Link>
        </div>
      ) : (
        <>
          {/* ─── Results Stats ─── */}
          <div className="companion-results-header">
            <p className="companion-results-count" data-testid="companion-results-count">
              {isLoading ? (
                <span>Đang tìm kiếm chuyến đi...</span>
              ) : (
                <span>
                  Tìm thấy <strong>{total}</strong> chuyến đi{" "}
                  {tab === "mine"
                    ? "do bạn làm chủ"
                    : tab === "joined"
                      ? "bạn đang tham gia"
                      : "phù hợp"}
                </span>
              )}
            </p>
          </div>

          {/* ─── Loading Skeleton State ─── */}
          {isLoading && (
            <div className="companion-discovery-grid" aria-busy="true" data-testid="companion-loading-skeleton">
              {[1, 2, 3, 4].map((idx) => (
                <div key={idx} className="companion-card companion-item-card is-skeleton">
                  <div className="companion-skeleton-media" />
                  <div className="companion-item-body">
                    <div className="companion-skeleton-line w-24 h-4 mb-2" />
                    <div className="companion-skeleton-line w-3/4 h-6 mb-3" />
                    <div className="companion-skeleton-line w-full h-4 mb-2" />
                    <div className="companion-skeleton-line w-1/2 h-4 mb-4" />
                    <div className="companion-skeleton-line w-full h-9 mt-auto" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Empty State ─── */}
          {!isLoading && items.length === 0 && (
            <div className="companion-card companion-empty-state" data-testid="companion-empty-state">
              <div className="companion-empty-icon" aria-hidden="true">
                <Users size={36} />
              </div>
              <h2 className="text-lg font-semibold m-0 text-foreground">
                {tab === "mine"
                  ? "Bạn chưa có bài đăng tìm bạn đồng hành nào"
                  : tab === "joined"
                    ? "Bạn chưa tham gia chuyến đồng hành nào"
                    : "Không tìm thấy chuyến đi nào phù hợp"}
              </h2>
              <p className="text-sm text-muted-foreground m-0 max-w-md">
                {tab === "mine"
                  ? "Hãy vào mục Chuyến đi của tôi, chọn một chuyến đã lưu và nhấn nút Tìm bạn đồng hành để bắt đầu tìm người đi cùng."
                  : tab === "joined"
                    ? "Khám phá các chuyến đi công khai đang mở tuyển và bấm Tham gia chuyến đi để cùng đồng hành."
                    : activeFilterCount > 0
                      ? "Thử nới lỏng điều kiện lọc hoặc xóa bộ lọc để xem các chuyến đi khác."
                      : "Hiện tại chưa có chuyến đi công khai nào sắp khởi hành."}
              </p>
              {activeFilterCount > 0 && tab === "explore" && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="companion-secondary-button mt-2"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>Xóa tất cả bộ lọc</span>
                </button>
              )}
            </div>
          )}

          {/* ─── Cards Grid ─── */}
          {!isLoading && items.length > 0 && (
            <div className="companion-discovery-grid" role="feed" aria-label="Danh sách chuyến đi đồng hành">
              {items.map((item) => {
                const intro = item.introduction;
                const transportLabel = intro.transport === "CAR" ? "Ô tô" : "Xe máy";
                const dateRangeLabel = formatRangeVi(intro.startDate, intro.endDate);
                const hostInitial = intro.host.displayName.slice(0, 1).toUpperCase();

                return (
                  <article
                    key={item.publicationId}
                    className="companion-card companion-item-card"
                    data-testid={`companion-card-${item.publicationId}`}
                  >
                    {/* Media Thumbnail */}
                    <div className="companion-item-thumb-wrap">
                      <img
                        src={intro.image?.url || getHighlandFallbackPhoto(intro.title, intro.routeSummary, intro.durationDays)}
                        alt={intro.image?.alt || intro.title}
                        className="companion-item-thumb"
                        loading="lazy"
                      />
                      <div className="companion-item-thumb-overlay" />

                      {/* Capacity tag */}
                      <span className="companion-item-capacity-tag">
                        Còn {intro.availablePlaces} chỗ tìm thêm
                      </span>

                      {item.recruitmentStatus && item.recruitmentStatus !== "OPEN" && (
                        <span className="companion-item-status-tag" data-testid={`companion-status-${item.publicationId}`}>
                          {item.recruitmentStatus === "CLOSED" && "Đã đóng tuyển"}
                          {item.recruitmentStatus === "FULL" && "Đã đủ chỗ"}
                          {item.recruitmentStatus === "WITHDRAWN" && "Đã gỡ bài"}
                          {item.recruitmentStatus === "DEPARTED" && "Đã khởi hành"}
                          {item.recruitmentStatus === "COMPLETED" && "Đã kết thúc"}
                          {item.recruitmentStatus === "CANCELED" && "Đã hủy"}
                        </span>
                      )}

                      {tab === "joined" && (
                        <span className="companion-item-joined-tag">
                          <ShieldCheck size={12} aria-hidden="true" />
                          <span>Đã tham gia</span>
                        </span>
                      )}

                      {(unreadMap[item.publicationId] ?? 0) > 0 && (
                        <span
                          className="companion-unread-badge"
                          data-testid={`companion-unread-badge-${item.publicationId}`}
                        >
                          {unreadMap[item.publicationId]} tin mới
                        </span>
                      )}
                    </div>

                    {/* Content Body */}
                    <div className="companion-item-body">
                      {/* Meta Pill Row */}
                      <div className="companion-item-pills">
                        <span className="companion-pill">
                          <CalendarDays size={13} aria-hidden="true" />
                          <span>{dateRangeLabel}</span>
                        </span>
                        <span className="companion-pill">
                          <Clock3 size={13} aria-hidden="true" />
                          <span>{intro.durationDays} ngày</span>
                        </span>
                        <span className="companion-pill">
                          <CarFront size={13} aria-hidden="true" />
                          <span>{transportLabel}</span>
                        </span>
                      </div>

                      {/* Title */}
                      <h2 className="companion-item-title">
                        <Link
                          href={`/trip-companions/${item.publicationId}` as Route}
                          className="hover:underline"
                        >
                          {intro.title}
                        </Link>
                      </h2>

                      {/* Route Summary */}
                      {intro.routeSummary.length > 0 && (
                        <div className="companion-item-route" aria-label="Tuyến đường">
                          <MapPin size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                          <span className="companion-item-route-text">
                            {intro.routeSummary.map((r) => r.name).join(" → ")}
                          </span>
                        </div>
                      )}

                      {/* Introduction Excerpt */}
                      <p className="companion-item-intro">
                        {intro.introduction}
                      </p>

                      {/* Footer: Host & CTA */}
                      <div className="companion-item-footer">
                        <div className="companion-item-host">
                          {intro.host.avatarUrl ? (
                            <img
                              src={intro.host.avatarUrl}
                              alt=""
                              className="companion-item-host-avatar"
                            />
                          ) : (
                            <div className="companion-item-host-avatar" aria-hidden="true">
                              {hostInitial}
                            </div>
                          )}
                          <div className="companion-item-host-info">
                            <strong>{intro.host.displayName}</strong>
                            <span>Chủ chuyến</span>
                          </div>
                        </div>

                        {tab === "mine" ? (
                          <div className="companion-item-footer-actions">
                            <Link
                              href={`/trip-companions/${item.publicationId}/manage` as Route}
                              className="companion-secondary-button text-xs py-1.5 px-3 shrink-0 whitespace-nowrap"
                              data-testid={`companion-manage-btn-${item.publicationId}`}
                            >
                              <span>Quản lý</span>
                            </Link>
                            <Link
                              href={`/trip-companions/${item.publicationId}/group${(unreadMap[item.publicationId] ?? 0) > 0 ? "?tab=chat" : ""}` as Route}
                              className="companion-item-cta shrink-0 whitespace-nowrap"
                              data-testid={`companion-view-btn-${item.publicationId}`}
                            >
                              <span>{(unreadMap[item.publicationId] ?? 0) > 0 ? "Trò chuyện" : "Xem"}</span>
                              <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                          </div>
                        ) : tab === "joined" ? (
                          <div className="companion-item-footer-actions">
                            <Link
                              href={`/trip-companions/${item.publicationId}/group${(unreadMap[item.publicationId] ?? 0) > 0 ? "?tab=chat" : ""}` as Route}
                              className="companion-item-cta shrink-0 whitespace-nowrap"
                              data-testid={`companion-view-btn-${item.publicationId}`}
                            >
                              <span>{(unreadMap[item.publicationId] ?? 0) > 0 ? "Vào trò chuyện" : "Vào nhóm"}</span>
                              <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                          </div>
                        ) : (
                          <div className="companion-item-footer-actions">
                            <Link
                              href={`/trip-companions/${item.publicationId}` as Route}
                              className="companion-item-cta shrink-0 whitespace-nowrap"
                              data-testid={`companion-view-btn-${item.publicationId}`}
                            >
                              <span>Xem chuyến</span>
                              <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* ─── Load More Button ─── */}
          {!isLoading && nextCursor && (
            <div className="companion-load-more-wrap">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="companion-secondary-button companion-load-more-btn"
                data-testid="companion-load-more-btn"
              >
                {isLoadingMore ? (
                  <span>Đang tải thêm...</span>
                ) : (
                  <>
                    <span>Tải thêm chuyến đi</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
