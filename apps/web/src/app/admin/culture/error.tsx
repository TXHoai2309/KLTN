"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="space-y-4 p-8"><h1>Không thể tải quản lý nội dung văn hóa</h1><p role="alert">Vui lòng thử lại.</p><button type="button" onClick={reset}>Thử lại</button></main>;
}
