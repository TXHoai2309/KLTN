"use client";
import { Button } from "@KLTN/ui/components/button";
export default function Error({reset}:{reset:()=>void}){return <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-8" lang="vi"><h1 className="text-2xl font-semibold">Không thể tải nội dung văn hóa</h1><p role="alert">Vui lòng thử lại.</p><Button onClick={reset}>Thử lại</Button></main>;}
