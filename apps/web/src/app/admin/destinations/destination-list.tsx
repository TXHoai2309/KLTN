"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, List, Pencil, ChevronLeft, ChevronRight, AlertTriangle, Mountain, Archive } from "lucide-react";
import { loadDestinations, DestinationReadError } from "@/lib/destination-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import type { DestinationList as ListDto } from "@/modules/destination/destination-contract";
import { takeDestinationSaved } from "@/lib/destination-save-notice";
import { SectionHeading, LoadingState } from "./destination-ui";

import DestinationPageHeader from "./destination-page-header";
import { useDestinationVisibility } from "./destination-visibility-action";
import { useDestinationLifecycle } from "./destination-lifecycle-action";

const updatedAt = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
export default function DestinationList() {
  useEffect(() => { if (takeDestinationSaved()) toast.success("Đã lưu điểm đến thành công.", { position: "bottom-right", id: "destination-saved", duration: 5000 }); }, []);
  const [data, setData] = useState<ListDto | null>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "deleted">("active");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const visibilityAction = useDestinationVisibility(dto => setData(current => current ? { ...current, items: current.items.map(item => item.id === dto.id ? { ...item, visibility: dto.visibility, updatedAt: dto.updatedAt } : item) } : current), lock);
  useEffect(() => {
    let active = true; setData(null); setError("");
    void loadDestinations(page, undefined, view).then(value => { if (active) setData(value); }).catch(error => {
      if (active) {
        const message = error instanceof DestinationReadError ? authorizationFeedback(error.status) ?? error.message : "Không thể tải danh sách. Vui lòng thử lại.";
        setError(message); toast.error(message, { position: "bottom-right", id: "destination-load" });
      }
    });
    return () => { active = false; };
  }, [page, reload, view]);
  function confirmLifecycleChange(id: string) {
    setData(current => current ? { ...current, items: current.items.filter(item => item.id !== id) } : current);
    if (data?.items.length === 1 && page > 1) setPage(value => value - 1);
    else setReload(value => value + 1);
  }
  const lifecycle = useDestinationLifecycle(confirmLifecycleChange, lock);
  const busy = visibilityAction.busy || lifecycle.busy;
  const listedItems = data?.items ?? [];
  return <main className="destination-page"><div className="destination-container">
    <DestinationPageHeader mode="list" />
    {visibilityAction.feedback}
    {lifecycle.feedback}
    <section className="destination-card destination-list-card" aria-label={view === "active" ? "Danh sách điểm đến" : "Danh sách điểm đến đã xóa"}>
      <SectionHeading icon={view === "active" ? List : Archive} title={view === "active" ? "Danh sách điểm đến" : "Điểm đến đã xóa"} description={view === "active" ? "Thông tin và trạng thái hiện tại của các điểm đến." : "Các điểm đến đã xóa mềm. Khôi phục sẽ đưa điểm đến về trạng thái Ẩn."} />
      <nav className="destination-list-views" aria-label="Lọc danh sách điểm đến">
        <button id={view === "active" ? "destination-list-current-view" : undefined} type="button" aria-pressed={view === "active"} disabled={busy} onClick={() => { setPage(1); setView("active"); }}><List size={15} aria-hidden="true" />Đang quản lý</button>
        <button id={view === "deleted" ? "destination-list-current-view" : undefined} type="button" aria-pressed={view === "deleted"} disabled={busy} onClick={() => { setPage(1); setView("deleted"); }}><Archive size={15} aria-hidden="true" />Đã xóa</button>
      </nav>
      {error ? <div className="destination-state" role="alert"><AlertTriangle size={28} aria-hidden="true" /><h3>Chưa tải được danh sách</h3><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : !data ? <LoadingState>Đang tải danh sách…</LoadingState> : data.items.length === 0 ? <div className="destination-state destination-empty"><span className="destination-empty-icon" aria-hidden="true">{view === "active" ? <Mountain size={32} /> : <Archive size={30} />}</span><h3>{view === "active" ? "Chưa có điểm đến đang quản lý." : "Không có điểm đến đã xóa."}</h3><p>{view === "active" ? "Bắt đầu với thông tin và giờ hoạt động của điểm đến đầu tiên." : "Điểm đến được xóa mềm sẽ xuất hiện tại đây để Admin khôi phục."}</p>{view === "active" && <Link className="destination-primary" href="/admin/destinations/new"><Plus size={17} aria-hidden="true" />Tạo điểm đến đầu tiên</Link>}</div> : <>
        <div className="destination-table"><table><caption className="destination-sr-only">{view === "active" ? "Danh sách điểm đến quản trị" : "Danh sách điểm đến đã xóa"}</caption><thead><tr>{["Tên", "Khu vực", "Danh mục", view === "active" ? "Trạng thái" : "Trạng thái trước khi xóa", view === "active" ? "Cập nhật gần nhất" : "Ngày xóa", "Hành động"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{listedItems.map(item => <tr key={item.id}><td><span className="destination-row-name">{item.name}</span></td><td>{item.area}</td><td>{item.category}</td><td>{view === "active" ? visibilityAction.action(item, lifecycle.busy) : <span className={`destination-badge ${item.visibility === "VISIBLE" ? "is-visible" : "is-hidden"}`}>{item.visibility === "VISIBLE" ? "Đang hiển thị" : "Đang ẩn"}</span>}</td><td className="destination-date">{updatedAt(view === "deleted" && item.deletedAt ? item.deletedAt : item.updatedAt)}</td><td><div className="destination-row-actions">{view === "active" && <Link className="destination-edit" href={`/admin/destinations/${item.id}/edit`} aria-label={`Chỉnh sửa ${item.name}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link>}{lifecycle.action(item, view)}</div></td></tr>)}</tbody></table></div>
        <div className="destination-mobile-list">{listedItems.map(item => <article key={item.id} className="destination-mobile-card"><div className="destination-mobile-title"><h3>{item.name}</h3>{view === "active" ? visibilityAction.action(item, lifecycle.busy) : <span className={`destination-badge ${item.visibility === "VISIBLE" ? "is-visible" : "is-hidden"}`}>{item.visibility === "VISIBLE" ? "Trước đó: đang hiển thị" : "Trước đó: đang ẩn"}</span>}</div><dl><div><dt>Khu vực</dt><dd>{item.area}</dd></div><div><dt>Danh mục</dt><dd>{item.category}</dd></div><div><dt>{view === "active" ? "Cập nhật" : "Ngày xóa"}</dt><dd>{updatedAt(view === "deleted" && item.deletedAt ? item.deletedAt : item.updatedAt)}</dd></div></dl><div className="destination-row-actions">{view === "active" && <Link className="destination-edit" href={`/admin/destinations/${item.id}/edit`} aria-label={`Chỉnh sửa ${item.name}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link>}{lifecycle.action(item, view)}</div></article>)}</div>
      </>}
      {data && <footer className="destination-list-footer"><p>{data.items.length ? `Đang hiển thị ${data.items.length} ${view === "active" ? "điểm đến" : "điểm đến đã xóa"} trên trang này.` : view === "active" ? "Dữ liệu điểm đến sẽ xuất hiện tại đây." : "Danh sách đã xóa hiện đang trống."}</p><nav className="destination-pagination" aria-label="Phân trang"><button type="button" disabled={busy || page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" /><span>Trang trước</span></button><span className="destination-current-page" aria-current="page">Trang {page}</span><button type="button" disabled={busy || !data.hasMore} onClick={() => setPage(value => value + 1)}><span>Trang sau</span><ChevronRight size={16} aria-hidden="true" /></button></nav></footer>}
    </section>
  </div></main>;
}
