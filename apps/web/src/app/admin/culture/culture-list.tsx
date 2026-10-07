"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, List, Pencil, ChevronLeft, ChevronRight, AlertTriangle, Mountain } from "lucide-react";
import { loadCultureList, CultureReadError } from "@/lib/culture-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import type { CultureList as ListDto } from "@/modules/culture/culture-contract";
import { takeCultureSaved } from "@/lib/culture-save-notice";
import { SectionHeading, LoadingState } from "../destinations/destination-ui";

import CulturePageHeader from "./culture-page-header";
import { useCultureVisibility } from "./culture-visibility-action";

const updatedAt = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
export default function CultureList() {
  useEffect(() => { const notice = takeCultureSaved(); if (notice) toast.success(notice, { position: "bottom-right", id: "culture-saved", duration: 5000 }); }, []);
  const [data, setData] = useState<ListDto | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const visibilityAction = useCultureVisibility(dto => setData(current => current ? { ...current, items: current.items.map(item => item.id === dto.id ? { ...item, visibility: dto.visibility, updatedAt: dto.updatedAt } : item) } : current));
  useEffect(() => {
    let active = true; setData(null); setError("");
    void loadCultureList(page).then(value => { if (active) setData(value); }).catch(error => {
      if (active) {
        const message = error instanceof CultureReadError ? authorizationFeedback(error.status) ?? error.message : "Không thể tải danh sách. Vui lòng thử lại.";
        setError(message); toast.error(message, { position: "bottom-right", id: "culture-load" });
      }
    });
    return () => { active = false; };
  }, [page, reload]);
  return <main className="destination-page culture-page"><div className="destination-container">
    <CulturePageHeader mode="list" />
    {visibilityAction.feedback}
    <section className="destination-card destination-list-card" aria-label="Danh sách nội dung văn hóa"><SectionHeading icon={List} title="Danh sách nội dung văn hóa" description="Thông tin và trạng thái hiện tại của các nội dung văn hóa." />
      {error ? <div className="destination-state" role="alert"><AlertTriangle size={28} aria-hidden="true" /><h3>Chưa tải được danh sách</h3><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : !data ? <LoadingState>Đang tải danh sách…</LoadingState> : data.items.length === 0 ? <div className="destination-state destination-empty"><span className="destination-empty-icon" aria-hidden="true"><Mountain size={32} /></span><h3>Chưa có nội dung văn hóa nào.</h3><p>Bắt đầu với nội dung và nguồn của nội dung văn hóa đầu tiên.</p><Link className="destination-primary" href="/admin/culture/new"><Plus size={17} aria-hidden="true" />Tạo nội dung văn hóa đầu tiên</Link></div> : <>
        <div className="destination-table"><table><caption className="destination-sr-only">Danh sách nội dung văn hóa quản trị</caption><thead><tr>{["Tiêu đề", "Điểm đến liên quan", "Nguồn", "Trạng thái", "Cập nhật gần nhất", "Hành động"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><span className="destination-row-name">{item.title}</span></td><td>{item.destinations.map(d => d.name).join(", ") || "—"}</td><td>{item.sourceTitle || item.sourceUrl || "—"}</td><td>{visibilityAction.action(item)}</td><td className="destination-date">{updatedAt(item.updatedAt)}</td><td><div className="destination-row-actions"><Link className="destination-edit" href={`/admin/culture/${item.id}/edit`} aria-label={`Chỉnh sửa ${item.title}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></div></td></tr>)}</tbody></table></div>
        <div className="destination-mobile-list">{data.items.map(item => <article key={item.id} className="destination-mobile-card"><div className="destination-mobile-title"><h3>{item.title}</h3>{visibilityAction.action(item)}</div><dl><div><dt>Điểm đến</dt><dd>{item.destinations.map(d => d.name).join(", ") || "—"}</dd></div><div><dt>Nguồn</dt><dd>{item.sourceTitle || item.sourceUrl || "—"}</dd></div><div><dt>Cập nhật</dt><dd>{updatedAt(item.updatedAt)}</dd></div></dl><div className="destination-row-actions"><Link className="destination-edit" href={`/admin/culture/${item.id}/edit`} aria-label={`Chỉnh sửa ${item.title}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></div></article>)}</div>
      </>}
      {data && <footer className="destination-list-footer"><p>{data.items.length ? `Đang hiển thị ${data.items.length} nội dung văn hóa trên trang này.` : "Dữ liệu nội dung văn hóa sẽ xuất hiện tại đây."}</p><nav className="destination-pagination" aria-label="Phân trang"><button type="button" disabled={visibilityAction.busy || page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" /><span>Trang trước</span></button><span className="destination-current-page" aria-current="page">Trang {page}</span><button type="button" disabled={visibilityAction.busy || !data.hasMore} onClick={() => setPage(value => value + 1)}><span>Trang sau</span><ChevronRight size={16} aria-hidden="true" /></button></nav></footer>}
    </section>
  </div></main>;
}
