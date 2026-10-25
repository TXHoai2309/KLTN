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
  const data = state.status === "ready" ? state.data : undefined;
  // The request key omits valid view and Culture paging state, but preserves invalid URL state for recovery.
  const hasSearchState = query.length > 0;

  function navigate(href: string) {
    const current = `${window.location.pathname}${window.location.search}`;
    commitExploreNavigation(href, current, () => router.push(href as Route, { scroll: false }), reload);
  }

  function clear() {
    navigate(destinationSearchHref(new URLSearchParams(params), {}));
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
        <div><p className="explore-section-eyebrow">HỒ SƠ ĐỊA DANH</p><h2 id="explore-destination-title" aria-live="polite">{data ? `${data.items.length} điểm đến phù hợp` : state.status === "loading" ? "Đang tìm điểm đến…" : "Điểm đến Hà Giang"}</h2></div>
      </header>

      <div key={view} className="explore-view-content">
        <DestinationResultStatus state={state} filtered={hasSearchState} onRetry={reload} onClear={clear} />
        {data && view === "map" && <div className="explore-map-workspace">
          <div className="explore-map-panel">
            <div className="explore-map-heading"><Map aria-hidden="true" size={18} /><span>Bản đồ Hà Giang</span><span className="explore-map-meta">{data.items.length} địa danh</span></div>
            <DestinationMap destinations={data.items} returnTo={returnTo} />
          </div>
          <aside className="explore-map-results" aria-label="Danh sách điểm đến trên bản đồ">
            <h3>Địa danh trên bản đồ</h3>
            {data.items.length === 0 ? <p className="explore-map-empty">{hasSearchState ? "Không có điểm đến phù hợp với bộ lọc." : "Chưa có điểm đến công khai."}</p> :
              <ul>{data.items.map(item => <li key={item.id}>
                <Link href={destinationDetailHref(item.id, returnTo)} className="explore-map-result">
                  <span className="explore-map-result-mark" aria-hidden="true"><MapPin size={18} /></span>
                  <span className="explore-map-result-copy"><strong>{item.name}</strong><span>{item.area}</span><small>{item.category}</small></span>
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              </li>)}</ul>}
          </aside>
        </div>}
        {data && view === "list" && data.items.length > 0 && <ul className="explore-cards destination-grid">
          {data.items.map((item, index) => <li key={item.id} style={{ "--card-index": index } as React.CSSProperties}>
            <DestinationCard destination={item} returnTo={returnTo} />
          </li>)}
        </ul>}
      </div>
    </section>
  );
}
