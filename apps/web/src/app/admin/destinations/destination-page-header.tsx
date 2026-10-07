import React from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

const headings = {
  list: { title: "Quản lý điểm đến", subtitle: "Quản lý thông tin và trạng thái các điểm đến Hà Giang." },
  create: { title: "Tạo điểm đến", subtitle: "Thêm dữ liệu điểm đến mới cho hệ thống." },
  edit: { title: "Chỉnh sửa điểm đến", subtitle: "Cập nhật thông tin, vị trí, thời lượng và giờ hoạt động của điểm đến." },
};

export default function DestinationPageHeader({ mode, canGoBack = true }: { mode: keyof typeof headings; canGoBack?: boolean }) {
  const { title, subtitle } = headings[mode];
  return <div className="destination-page-header">
    {mode !== "list" && canGoBack && <Link className="destination-button destination-back" href="/admin/destinations"><ArrowLeft size={16} aria-hidden="true" />Quay lại</Link>}
    <header className="destination-heading">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {mode === "list" && <Link className="destination-primary" href="/admin/destinations/new"><Plus size={18} aria-hidden="true" />Tạo điểm đến</Link>}
    </header>
  </div>;
}
