"use client";
import { mvpFeatures } from "@/lib/mvp-features";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { ArrowUpRight, BookOpen, List, Map, MapPin } from "lucide-react";
import DestinationMap from "@/components/map/destination-map";
import DestinationCard from "./destination-card";
import {
  destinationRequestKey,
  destinationSearchHref,
  type PublicLocationList,
} from "@/modules/destination/public-destination-query";
import { cleanPlaceDisplayName, cleanTravelerDisplay } from "@/lib/traveler-display-clean";
import {
  collectRealExploreAreas,
  exploreDistanceKm,
  filterAndSortExploreLocations,
  resolveExploreDisplayArea,
  type ExploreSortMode,
} from "@/modules/destination/explore-filter-sort";
import { startDestinationRequest, type DestinationRequestState } from "@/modules/destination/destination-search-client";
import { buildExploreReturnTo } from "@/modules/destination/destination-detail-navigation";
import { commitExploreNavigation, destinationDetailHref, exploreView, exploreViewHref } from "@/modules/map/map-model";
import { DestinationResultStatus, DestinationSearchForm } from "./destination-search-form";

export default function ExploreResults({ data: initialData, error, initialQuery }: { data?: PublicLocationList; error?: string; initialQuery: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = buildExploreReturnTo(new URLSearchParams(params));
  const view = exploreView(new URLSearchParams(params));
  const query = destinationRequestKey(new URLSearchParams(params));
  const serverResult = useMemo(() => ({
    query: initialQuery,
    state: initialData ? { status: "ready", data: initialData } as const : error ? { status: "error" } as const : undefined,
  }), [initialQuery, initialData, error]);
  const [retry, setRetry] = useState(0);
  const reload = () => setRetry(previous => previous + 1);
  const [result, setResult] = useState<{ query: string; source: typeof serverResult; retry: number; state: DestinationRequestState } | null>(null);
  const [filters, setFilters] = useState(initialData?.filters ?? { categories: [], regions: [] });

  useEffect(() => {
    return startDestinationRequest(new URLSearchParams(query), state => {
      setResult({ query, source: serverResult, retry, state });
      if (state.status === "ready") setFilters(state.data.filters);
    });
  }, [query, retry, serverResult]);

  // Never show results for the previous URL while the next request is starting.
  const current = result?.query === query && result.source === serverResult && result.retry === retry ? result.state : { status: "loading" } as const;
  // The page already rendered this query's public data. Keep it visible while
  // the existing no-store read checks freshness, including a Router-cache Back.
  // Completed client errors remain errors; never borrow data from another query.
  const state: DestinationRequestState = current.status === "loading" && serverResult.query === query && serverResult.state
    ? serverResult.state : current;
  const rawData = state.status === "ready" ? state.data : undefined;
  const activeCategory = (params.get("category") ?? "").trim().toLocaleLowerCase("vi-VN");
  const activeSearchQ = (params.get("q") ?? "").trim();

  const [selectedArea, setSelectedArea] = useState<string>("");
  const [openTodayOnly, setOpenTodayOnly] = useState(false);
  const [sortMode, setSortMode] = useState<ExploreSortMode>("name");
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "denied">("idle");

  // Keep real inferred/explicit area chips across current search set
  const realAreas = useMemo(() => (rawData ? collectRealExploreAreas(rawData.items) : []), [rawData]);
  const hasHoursData = useMemo(
    () => Boolean(rawData?.items.some(item => typeof item.openToday === "boolean")),
    [rawData],
  );
  const hasFavoriteMetrics = useMemo(
    () => Boolean(rawData?.items.some(item => (item.favoriteCount ?? 0) > 0)),
    [rawData],
  );

  const data = useMemo(() => {
    if (!rawData) return undefined;
    const filteredItems = filterAndSortExploreLocations(rawData.items, {
      region: selectedArea,
      openTodayOnly,
      sort: sortMode,
      userCoords,
    });
    return { ...rawData, items: filteredItems };
  }, [rawData, selectedArea, openTodayOnly, sortMode, userCoords]);

  const hasClientFilters = Boolean(selectedArea || openTodayOnly);
  const hasSearchState = query.length > 0 || hasClientFilters;

  function navigate(href: string) {
    const current = `${window.location.pathname}${window.location.search}`;
    commitExploreNavigation(href, current, () => router.push(href as Route, { scroll: false }), reload);
  }

  function selectCategory(nextCategory: string) {
    const next = {
      ...(activeSearchQ ? { q: activeSearchQ } : {}),
      ...(nextCategory ? { category: nextCategory } : {}),
      ...(params.get("region") ? { region: params.get("region")! } : {}),
    };
    navigate(destinationSearchHref(new URLSearchParams(params), next));
  }

  function handleSortChange(nextSort: ExploreSortMode) {
    setSortMode(nextSort);
    if (nextSort !== "nearest") {
      setGeoStatus("idle");
      return;
    }
    if (userCoords) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGeoStatus("idle");
      },
      () => {
        setGeoStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  }

  function clear() {
    setSelectedArea("");
    setOpenTodayOnly(false);
    setSortMode("name");
    setGeoStatus("idle");
    if (query.length > 0) {
      navigate(destinationSearchHref(new URLSearchParams(params), {}));
    }
  }

  function setView(nextView: "list" | "map") {
    if (view !== nextView) navigate(exploreViewHref(new URLSearchParams(params), nextView));
  }

  return (
    <section className="explore-domain explore-destinations" aria-labelledby="explore-destination-title">
      <div className="explore-search-toolbar">
        <DestinationSearchForm
          key={query}
          params={new URLSearchParams(query)}
          filters={data?.filters ?? filters}
          onSearch={values => navigate(destinationSearchHref(new URLSearchParams(params), values))}
          onClear={clear}
        />
        <div className="explore-toolbar-actions">
          {mvpFeatures.culture && (
            <nav className="explore-content-tabs" aria-label="Nội dung khám phá">
              <a href="#explore-destination-title"><Map aria-hidden="true" size={15} />Điểm đến</a>
              <a href="#explore-culture-title"><BookOpen aria-hidden="true" size={15} />Nội dung văn hóa</a>
            </nav>
          )}
          <div className="explore-view-switch" role="group" aria-label="Chế độ xem điểm đến">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              <List aria-hidden="true" size={17} /> Danh sách
            </button>
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
              <Map aria-hidden="true" size={17} /> Bản đồ
            </button>
          </div>
        </div>
      </div>
      <header className="explore-section-heading">
        <div><h2 id="explore-destination-title" aria-live="polite">{data ? `${data.items.length} điểm đến phù hợp` : state.status === "loading" ? "Đang tìm điểm đến…" : "Điểm đến Hà Giang"}</h2></div>
      </header>

      {rawData && (rawData.filters.categories.length > 0 || realAreas.length > 0 || hasHoursData) && (
        <div className="explore-chip-bar" aria-label="Bộ lọc và sắp xếp điểm đến">
          {rawData.filters.categories.length > 0 && (
            <div className="explore-chip-group" role="group" aria-label="Lọc theo loại hình">
              <button
                type="button"
                className="explore-chip"
                aria-pressed={!activeCategory}
                onClick={() => selectCategory("")}
              >
                Tất cả loại hình
              </button>
              {rawData.filters.categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  className="explore-chip"
                  aria-pressed={activeCategory === cat.toLocaleLowerCase("vi-VN")}
                  onClick={() => selectCategory(activeCategory === cat.toLocaleLowerCase("vi-VN") ? "" : cat)}
                >
                  {cleanTravelerDisplay(cat) || cat}
                </button>
              ))}
            </div>
          )}

          {realAreas.length > 0 && (
            <div className="explore-chip-group" role="group" aria-label="Lọc theo khu vực">
              <button
                type="button"
                className="explore-chip"
                aria-pressed={!selectedArea}
                onClick={() => setSelectedArea("")}
              >
                Tất cả khu vực
              </button>
              {realAreas.map(area => (
                <button
                  key={area}
                  type="button"
                  className="explore-chip"
                  aria-pressed={selectedArea === area}
                  onClick={() => setSelectedArea(current => (current === area ? "" : area))}
                >
                  {area}
                </button>
              ))}
            </div>
          )}

          <div className="explore-chip-controls">
            {hasHoursData && (
              <button
                type="button"
                className="explore-chip explore-chip-toggle"
                aria-pressed={openTodayOnly}
                onClick={() => setOpenTodayOnly(prev => !prev)}
              >
                Đang mở cửa hôm nay
              </button>
            )}

            <label className="explore-sort-label">
              <span>Sắp xếp</span>
              <select
                className="explore-sort-select"
                value={sortMode}
                onChange={event => handleSortChange(event.target.value as ExploreSortMode)}
                aria-label="Sắp xếp danh sách điểm đến"
              >
                <option value="name">Tên A–Z</option>
                <option value="nearest">Gần vị trí của tôi</option>
                {hasFavoriteMetrics && <option value="popular">Phổ biến</option>}
              </select>
            </label>
          </div>

          {geoStatus === "locating" && (
            <p className="explore-geo-note" role="status">Đang xác định vị trí của bạn để sắp xếp gần nhất…</p>
          )}
          {geoStatus === "denied" && (
            <p className="explore-geo-note" role="status">Chưa có quyền vị trí hoặc thiết bị không hỗ trợ; đang sắp xếp theo tên.</p>
          )}
        </div>
      )}

      <div key={view} className="explore-view-content">
        <DestinationResultStatus
          state={data && data.items.length === 0 && hasClientFilters ? { status: "ready", data: { ...data, items: [] } } : state}
          filtered={hasSearchState}
          onRetry={reload}
          onClear={clear}
        />
        {data && view === "map" && <div className="explore-map-workspace">
          <div className="explore-map-panel">
            <div className="explore-map-heading"><Map aria-hidden="true" size={18} /><span>Bản đồ Hà Giang</span><span className="explore-map-meta">{data.items.length} địa danh</span></div>
            <DestinationMap destinations={data.items} returnTo={returnTo} />
          </div>
          <aside className="explore-map-results" aria-label="Danh sách điểm đến trên bản đồ">
            <h3>Địa danh trên bản đồ</h3>
            {data.items.length === 0 ? <p className="explore-map-empty">{hasSearchState ? "Không có điểm đến phù hợp với bộ lọc." : "Chưa có điểm đến công khai."}</p> :
              <ul>{data.items.map(item => {
                const areaText = resolveExploreDisplayArea(item);
                return (
                  <li key={item.id}>
                    <Link href={destinationDetailHref(item.id, returnTo)} className="explore-map-result">
                      <span className="explore-map-result-mark" aria-hidden="true"><MapPin size={18} /></span>
                      <span className="explore-map-result-copy"><strong>{cleanPlaceDisplayName(item.name) || item.name}</strong>{areaText && <span>{areaText}</span>}<small>{cleanTravelerDisplay(item.category) || item.category}</small></span>
                      <ArrowUpRight aria-hidden="true" size={16} />
                    </Link>
                  </li>
                );
              })}</ul>}
          </aside>
        </div>}
        {data && view === "list" && data.items.length > 0 && <ul className="explore-cards destination-grid">
          {data.items.map((item, index) => <li key={item.id} style={{ "--card-index": index } as React.CSSProperties}>
            <DestinationCard
              destination={item}
              returnTo={returnTo}
              distanceKm={sortMode === "nearest" ? exploreDistanceKm(item, userCoords) : null}
            />
          </li>)}
        </ul>}
      </div>
    </section>
  );
}
