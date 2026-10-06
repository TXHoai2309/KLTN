"use client";
import React, { useEffect, useState } from "react";
import DestinationCard from "./destination-card";
import { useSearchParams } from "next/navigation";
import DestinationMap from "@/components/map/destination-map";
import { destinationRequestKey, destinationSearchHref, type PublicLocationList } from "@/modules/destination/public-destination-query";
import { startDestinationRequest, type DestinationRequestState } from "@/modules/destination/destination-search-client";
import { DestinationSearchForm, DestinationResultStatus } from "./destination-search-form";
import { exploreView, exploreViewHref } from "@/modules/map/map-model";

export default function ExploreResults({ data: initialData, error }: { data?: PublicLocationList; error?: string }) {
  const params = useSearchParams();
  const view = exploreView(new URLSearchParams(params));
  const query = destinationRequestKey(new URLSearchParams(params));
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ query: string; state: DestinationRequestState }>(() => ({
    query, state: initialData ? { status: "ready", data: initialData } : error ? { status: "error" } : { status: "loading" },
  }));
  const [filters, setFilters] = useState(initialData?.filters ?? { categories: [], regions: [] });
  useEffect(() => startDestinationRequest(new URLSearchParams(query), state => {
    setResult({ query, state });
    if (state.status === "ready") setFilters(state.data.filters);
  }), [query, retry]);
  // Never render the previous query's results during the render before effect cleanup.
  const state: DestinationRequestState = result.query === query ? result.state : { status: "loading" };
  const data = state.status === "ready" ? state.data : undefined;
  const filtered = [...new URLSearchParams(query).values()].some(value => value.trim());
  function navigate(href: string) {
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, "", href);
    else setRetry(value => value + 1);
  }
  function clear() { navigate(destinationSearchHref(new URLSearchParams(params), {})); }
  return <section className="explore-domain destination-results" aria-labelledby="explore-destination-title"><h2 className="sr-only" id="explore-destination-title">Điểm đến</h2>
    <DestinationSearchForm key={query} params={new URLSearchParams(query)} filters={filters}
      onSearch={values => navigate(destinationSearchHref(new URLSearchParams(params), values))}
      onClear={clear}>
      <div className="destination-view" role="group" aria-label="Chế độ xem điểm đến">{(["list", "map"] as const).map(mode => <button key={mode} className="destination-filter-chip" type="button" aria-pressed={view === mode} onClick={() => { if (view !== mode) window.history.pushState(null, "", exploreViewHref(new URLSearchParams(params), mode)); }}>{mode === "list" ? "Danh sách" : "Bản đồ"}</button>)}</div>
    </DestinationSearchForm>
    <p className="destination-count" role="status" aria-live="polite">{data ? `${data.items.length} điểm đến${filtered ? " phù hợp" : ""}` : state.status === "loading" ? "Đang tìm điểm đến…" : ""}</p>
    <DestinationResultStatus state={state} filtered={filtered} onRetry={() => setRetry(value => value + 1)} onClear={clear} />
    {data && data.items.length > 0 && (view === "map" ? <DestinationMap destinations={data.items} /> : <ul className="destination-grid">{data.items.map(item => <li key={item.id}><DestinationCard destination={item} /></li>)}</ul>)}
  </section>;
}
