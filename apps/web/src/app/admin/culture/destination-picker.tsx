"use client";
import { useEffect, useState } from "react";
import { lookupDestinations } from "@/lib/culture-client";
import type { CultureDto } from "@/modules/culture/culture-contract";
type Item = CultureDto["destinations"][number];
export default function DestinationPicker({ selected, onChange }: { selected: Item[]; onChange: (items: Item[]) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ items: Item[]; hasMore: boolean } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setData(null); setError(false);
    const timer = setTimeout(() => { void lookupDestinations(query, page).then(value => { if (active) setData(value); }).catch(() => { if (active) setError(true); }); }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, page, reload]);
  return <div className="culture-picker">
    <div className="culture-selected" aria-label="Điểm đến đã chọn">{selected.map(item => <button type="button" key={item.id} className="destination-button" aria-label={`Bỏ liên kết ${item.name}`} onClick={() => onChange(selected.filter(d => d.id !== item.id))}>{item.name} ×</button>)}</div>
    <div className="destination-field"><label htmlFor="culture-destination-search">Tìm điểm đến để liên kết</label><input id="culture-destination-search" value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div>
    {error ? <div role="alert">Không thể tải điểm đến. <button type="button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : !data ? <p role="status">Đang tải điểm đến…</p> : <>
      <div className="culture-picker-results">{data.items.map(item => <label key={item.id}><input type="checkbox" checked={selected.some(d => d.id === item.id)} onChange={event => onChange(event.target.checked ? [...selected, item] : selected.filter(d => d.id !== item.id))} />{item.name}</label>)}{!data.items.length && <p>Không có điểm đến phù hợp.</p>}</div>
      <nav className="destination-pagination" aria-label="Phân trang điểm đến"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Trang trước</button><span>Trang {page}</span><button type="button" disabled={!data.hasMore} onClick={() => setPage(value => value + 1)}>Trang sau</button></nav>
    </>}
    <p className="destination-helper">Có thể chọn nhiều điểm đến hoặc không liên kết điểm đến nào. Điểm đến đang ẩn vẫn có thể liên kết.</p>
  </div>;
}
