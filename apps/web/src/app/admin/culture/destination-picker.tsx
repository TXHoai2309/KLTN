"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { lookupDestinations } from "@/lib/culture-client";
import { loadDestination } from "@/lib/destination-client";
import type { CultureDto } from "@/modules/culture/culture-contract";
import type { DestinationList } from "@/modules/destination/destination-contract";

type Item = CultureDto["destinations"][number];
type DestinationInfo = DestinationList["items"][number];

export default function DestinationPicker({ selected, onChange }: { selected: Item[]; onChange: (items: Item[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [destinationInfo, setDestinationInfo] = useState<Map<string, DestinationInfo> | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const destinationInfoRef = useRef<Map<string, DestinationInfo>>(new Map());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    if (page === 1) { setItems([]); setHasMore(false); }
    setLoading(true);
    loadingRef.current = true;
    const timer = setTimeout(() => {
      void lookupDestinations(query, page).then(async result => {
        if (!active) return;
        const mergedInfo = new Map(destinationInfoRef.current);
        const missingInfo = [...new Map([...result.items, ...selectedRef.current].map(item => [item.id, item])).keys()].filter(id => !mergedInfo.has(id));
        const details = await Promise.allSettled(missingInfo.map(id => loadDestination(id)));
        if (!active) return;
        for (const detail of details) if (detail.status === "fulfilled") {
          const { id, name, area, category, visibility, updatedAt } = detail.value;
          mergedInfo.set(id, { id, name, area, category, visibility, updatedAt });
        }
        destinationInfoRef.current = mergedInfo;
        setDestinationInfo(mergedInfo);
        setItems(current => {
          if (page === 1) return result.items;
          const merged = new Map(current.map(item => [item.id, item]));
          for (const item of result.items) merged.set(item.id, item);
          return [...merged.values()];
        });
        setHasMore(result.hasMore);
        setActiveIndex(-1);
      }).catch(() => {
        if (active) setError(true);
      }).finally(() => {
        if (active) { setLoading(false); loadingRef.current = false; }
      });
    }, page === 1 ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query, page, reload]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => { if (open) searchInput.current?.focus(); }, [open]);

  const visibleItems = useMemo(() => {
    if (query.trim()) return items;
    const merged = new Map(selected.map(item => [item.id, item]));
    for (const item of items) if (!merged.has(item.id)) merged.set(item.id, item);
    return [...merged.values()];
  }, [items, query, selected]);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
    searchInput.current?.focus();
  }

  function toggle(item: Item) {
    const current = new Set(selected.map(destination => destination.id));
    if (current.has(item.id)) onChange(selected.filter(destination => destination.id !== item.id));
    else onChange([...selected, item]);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(index => Math.min(visibleItems.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(index => visibleItems.length === 0 ? -1 : Math.max(0, index < 0 ? 0 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && visibleItems[activeIndex]) toggle(visibleItems[activeIndex]!);
    }
  }

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`culture-destination-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function loadNextPage() {
    const element = listbox.current;
    if (!element || !hasMore || loadingRef.current || error) return;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) {
      loadingRef.current = true;
      setPage(current => current + 1);
    }
  }

  function retry() {
    setPage(1);
    setReload(value => value + 1);
  }

  const selectedIds = new Set(selected.map(item => item.id));
  return <div className="culture-picker" ref={root}>
    <label className="destination-sr-only" htmlFor="culture-destination-search">Tìm điểm đến</label>
    <div className={`culture-picker-trigger${open ? " is-open" : ""}`}>
      <Search size={17} aria-hidden="true" />
      <input ref={searchInput} id="culture-destination-search" role="combobox" aria-haspopup="listbox" aria-autocomplete="list" aria-controls={open ? "culture-destination-list" : undefined} aria-expanded={open} aria-activedescendant={activeIndex >= 0 ? `culture-destination-option-${activeIndex}` : undefined} value={query} placeholder="Tìm điểm đến..." maxLength={200} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setPage(1); setActiveIndex(-1); setOpen(true); }} onKeyDown={onSearchKeyDown} />
      <button type="button" className="culture-picker-chevron" aria-label={open ? "Đóng danh sách điểm đến" : "Mở danh sách điểm đến"} aria-expanded={open} aria-controls={open ? "culture-destination-list" : undefined} onClick={() => setOpen(value => !value)}><ChevronDown size={17} aria-hidden="true" /></button>
    </div>

    {selected.length > 0 && <div className="culture-selected" aria-label="Đã chọn">
      <span className="culture-selected-title">Đã chọn</span>
      <ul>{selected.map(item => <li key={item.id} title={item.name}><span>{item.name}</span><button type="button" aria-label={`Bỏ liên kết với ${item.name}`} onClick={() => toggle(item)}><X size={13} aria-hidden="true" /></button></li>)}</ul>
    </div>}

    {open && <div className="culture-picker-panel">
      {error ? <div className="culture-picker-error" role="alert"><span>Không thể tải danh sách điểm đến.</span><button type="button" onClick={retry}>Thử lại</button></div> : <>
        {loading && <p className="culture-picker-loading" role="status" aria-busy="true"><LoaderCircle className="destination-spinner" size={15} aria-hidden="true" />Đang tìm điểm đến...</p>}
        <div ref={listbox} id="culture-destination-list" className="culture-picker-options" role="listbox" aria-label="Kết quả điểm đến" aria-multiselectable="true" onScroll={loadNextPage}>
          {visibleItems.map((item, index) => {
            const metadata = destinationInfo?.get(item.id);
            const isSelected = selectedIds.has(item.id);
            return <div key={item.id} id={`culture-destination-option-${index}`} role="option" aria-selected={isSelected} className={`culture-picker-option${activeIndex === index ? " is-active" : ""}`} onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => toggle(item)}>
              <span className="culture-picker-check" aria-hidden="true">{isSelected && <Check size={14} />}</span>
              <span className="culture-picker-option-copy"><strong>{item.name}</strong><span>{metadata ? `${metadata.area} · ${metadata.category}` : "Thông tin bổ sung chưa tải được."}</span></span>
              {metadata?.visibility === "HIDDEN" && <span className="culture-picker-hidden">Đang ẩn</span>}
              {isSelected && <span className="destination-sr-only">Đã chọn</span>}
            </div>;
          })}
        </div>
        {!loading && visibleItems.length === 0 && <p className="culture-picker-empty">Không tìm thấy điểm đến phù hợp.</p>}
      </>}
    </div>}
  </div>;
}
