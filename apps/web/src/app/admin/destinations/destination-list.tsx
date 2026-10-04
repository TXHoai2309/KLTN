"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, List, Pencil, ChevronLeft, ChevronRight, AlertTriangle, Mountain } from "lucide-react";
import { loadDestinations, DestinationReadError } from "@/lib/destination-client";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import type { DestinationList as ListDto } from "@/modules/destination/destination-contract";
import { takeDestinationSaved } from "@/lib/destination-save-notice";
import { SectionHeading, VisibilityBadge, LoadingState } from "./destination-ui";

import DestinationPageHeader from "./destination-page-header";

const updatedAt = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
export default function DestinationList() {
  useEffect(() => { if (takeDestinationSaved()) toast.success("Đã lưu điểm đến thành công.", { position: "bottom-right", id: "destination-saved", duration: 5000 }); }, []);
  const [data, setData] = useState<ListDto | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setData(null); setError("");
    void loadDestinations(page).then(value => { if (active) setData(value); }).catch(error => {
      if (active) {
        const message = error instanceof DestinationReadError ? authorizationFeedback(error.status) ?? error.message : "Không thể tải danh sách. Vui lòng thử lại.";
        setError(message); toast.error(message, { position: "bottom-right", id: "destination-load" });
      }
    });
    return () => { active = false; };
  }, [page, reload]);
  return <main className="destination-page"><div className="destination-container">
    <DestinationPageHeader mode="list" />
    <section className="destination-card destination-list-card" aria-label="Danh sách điểm đến"><SectionHeading icon={List} title="Danh sách điểm đến" description="Thông tin và trạng thái hiện tại của các điểm đến." />
      {error ? <div className="destination-state" role="alert"><AlertTriangle size={28} aria-hidden="true" /><h3>Chưa tải được danh sách</h3><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : !data ? <LoadingState>Đang tải danh sách…</LoadingState> : data.items.length === 0 ? <div className="destination-state destination-empty"><span className="destination-empty-icon" aria-hidden="true"><Mountain size={32} /></span><h3>Chưa có điểm đến nào.</h3><p>Bắt đầu với thông tin và giờ hoạt động của điểm đến đầu tiên.</p><Link className="destination-primary" href="/admin/destinations/new"><Plus size={17} aria-hidden="true" />Tạo điểm đến đầu tiên</Link></div> : <>
        <div className="destination-table"><table><caption className="destination-sr-only">Danh sách điểm đến quản trị</caption><thead><tr>{["Tên", "Khu vực", "Danh mục", "Trạng thái", "Cập nhật gần nhất", "Hành động"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><span className="destination-row-name">{item.name}</span></td><td>{item.area}</td><td>{item.category}</td><td><VisibilityBadge visibility={item.visibility} /></td><td className="destination-date">{updatedAt(item.updatedAt)}</td><td><Link className="destination-edit" href={`/admin/destinations/${item.id}/edit`} aria-label={`Chỉnh sửa ${item.name}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></td></tr>)}</tbody></table></div>
        <div className="destination-mobile-list">{data.items.map(item => <article key={item.id} className="destination-mobile-card"><div className="destination-mobile-title"><h3>{item.name}</h3><VisibilityBadge visibility={item.visibility} /></div><dl><div><dt>Khu vực</dt><dd>{item.area}</dd></div><div><dt>Danh mục</dt><dd>{item.category}</dd></div><div><dt>Cập nhật</dt><dd>{updatedAt(item.updatedAt)}</dd></div></dl><Link className="destination-edit" href={`/admin/destinations/${item.id}/edit`} aria-label={`Chỉnh sửa ${item.name}`}><Pencil size={15} aria-hidden="true" />Chỉnh sửa</Link></article>)}</div>
      </>}
      {data && <footer className="destination-list-footer"><p>{data.items.length ? `Đang hiển thị ${data.items.length} điểm đến trên trang này.` : "Dữ liệu điểm đến sẽ xuất hiện tại đây."}</p><nav className="destination-pagination" aria-label="Phân trang"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" /><span>Trang trước</span></button><span className="destination-current-page" aria-current="page">Trang {page}</span><button type="button" disabled={!data.hasMore} onClick={() => setPage(value => value + 1)}><span>Trang sau</span><ChevronRight size={16} aria-hidden="true" /></button></nav></footer>}
    </section>
  </div></main>;
}
