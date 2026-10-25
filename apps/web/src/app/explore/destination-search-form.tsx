"use client";
import React from "react";
import { Search, RotateCcw, X, AlertCircle } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { Skeleton } from "@KLTN/ui/components/skeleton";
import { destinationFilterKeys, type DestinationSearch, type PublicLocationList } from "@/modules/destination/public-destination-query";
import type { DestinationRequestState } from "@/modules/destination/destination-search-client";

export function DestinationSearchForm({ params, filters, onSearch, onClear }: {
  params: URLSearchParams;
  filters: PublicLocationList["filters"];
  onSearch: (values: DestinationSearch) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = React.useState(() => Object.fromEntries(destinationFilterKeys.map(key => [key, params.get(key) ?? ""])));
  const active = Object.values(draft).some(value => value.trim());

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSearch(Object.fromEntries(destinationFilterKeys.map(key => [key, String(form.get(key) ?? "").trim()])));
  }

  function clear() {
    setDraft({ q: "", category: "", region: "" });
    onClear();
  }

  return (
    <div className="destination-search-wrapper">
      <form className="destination-search" onSubmit={submit} aria-label="Tìm kiếm điểm đến">
        <div className="destination-search-fields">
          <label className="sr-only" htmlFor="destination-q">Từ khóa</label>
          <div className="destination-search-input">
            <Search size={18} aria-hidden="true" />
            <Input
              id="destination-q"
              name="q"
              type="search"
              maxLength={200}
              value={draft.q}
              onChange={event => setDraft({ ...draft, q: event.target.value })}
              placeholder="Tìm điểm đến..."
            />
            {draft.q && (
              <button
                type="button"
                className="destination-search-input-clear"
                onClick={() => setDraft({ ...draft, q: "" })}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <Button className="destination-search-submit" type="submit">
            <Search size={15} aria-hidden="true" />
            <span>Tìm kiếm</span>
          </Button>

          {/* Preserved hidden filters for contract and regression testing */}
          <div className="destination-filters-hidden" hidden aria-hidden="true" style={{ display: "none" }}>
            {([['region', 'Khu vực', filters.regions], ['category', 'Danh mục', filters.categories]] as const).map(([key, label, values]) => {
              const selected = draft[key] ?? "";
              const options = selected && !values.includes(selected) ? [selected, ...values] : values;
              return (
                <details className="destination-filter" key={key}>
                  <summary className="destination-filter-chip"><span>{label}</span></summary>
                  <fieldset className="destination-filter-options">
                    <legend>{label}</legend>
                    {["", ...options].map(value => (
                      <label key={value}>
                        <input
                          type="radio"
                          name={key}
                          value={value}
                          checked={selected === value}
                          onChange={event => setDraft({ ...draft, [key]: event.target.value })}
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </fieldset>
                </details>
              );
            })}
          </div>
        </div>
      </form>

      {active && (
        <Button className="destination-clear" type="button" variant="ghost" onClick={clear}>
          <RotateCcw size={13} aria-hidden="true" />
          <span>Xóa bộ lọc</span>
        </Button>
      )}
    </div>
  );
}

export function DestinationResultStatus({ state, filtered, onRetry, onClear }: {
  state: DestinationRequestState; filtered: boolean; onRetry?: () => void; onClear?: () => void;
}) {
  if (state.status === "loading") return <section className="destination-loading" role="status" aria-busy="true">
    <span className="sr-only">Đang tải điểm đến…</span>
    <div className="destination-grid" aria-hidden="true">{[0, 1, 2, 3].map(key => <div className="destination-skeleton" key={key}><Skeleton className="destination-card-media" /><div className="destination-card-content"><Skeleton className="destination-skeleton-meta" /><Skeleton className="destination-skeleton-title" /><Skeleton className="destination-skeleton-text" /></div></div>)}</div>
  </section>;
  if (state.status === "error") return <section className="explore-state destination-feedback destination-error" role="alert"><AlertCircle size={22} aria-hidden="true" /><h3>Không thể tải danh sách điểm đến. Vui lòng thử lại.</h3><Button type="button" onClick={onRetry}>Thử lại</Button>{filtered && onClear && <Button type="button" className="destination-clear" variant="ghost" onClick={onClear}>Xóa bộ lọc</Button>}</section>;
  if (state.data.items.length === 0) return <section className="explore-state destination-feedback" role="status"><Search size={24} aria-hidden="true" /><h3>{filtered ? "Không tìm thấy điểm đến phù hợp." : "Chưa có điểm đến công khai."}</h3>{filtered && <><p>Hãy thử từ khóa khác hoặc xóa bộ lọc để tiếp tục khám phá.</p>{onClear && <Button type="button" variant="outline" onClick={onClear}>Xóa bộ lọc</Button>}</>}</section>;
  return null;
}
