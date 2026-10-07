import React from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

const headings = {
  list: { title: "Quản lý nội dung văn hóa", subtitle: "Quản lý nội dung, nguồn và điểm đến liên quan." },
  create: { title: "Tạo nội dung văn hóa", subtitle: "Thêm dữ liệu nội dung văn hóa mới cho hệ thống." },
  edit: { title: "Chỉnh sửa nội dung văn hóa", subtitle: "Cập nhật nội dung, nguồn và các điểm đến liên quan." },
};

export default function CulturePageHeader({ mode, canGoBack = true }: { mode: keyof typeof headings; canGoBack?: boolean }) {
  const { title, subtitle } = headings[mode];
  return <div className="destination-page-header">
    {mode !== "list" && canGoBack && <Link className="destination-button destination-back" href="/admin/culture"><ArrowLeft size={16} aria-hidden="true" />Quay lại</Link>}
    <header className="destination-heading">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {mode === "list" && <Link className="destination-primary" href="/admin/culture/new"><Plus size={18} aria-hidden="true" />Tạo nội dung văn hóa</Link>}
    </header>
  </div>;
}
