import Link from "next/link";

export default function AccessDenied() {
  return <main className="mx-auto max-w-xl space-y-4 px-6 py-12">
    <h1 className="text-2xl font-semibold">Không đủ quyền truy cập</h1>
    <p role="alert">Tài khoản hiện tại không có quyền truy cập chức năng này.</p>
    <Link className="underline" href="/">Về trang chủ</Link>
  </main>;
}
