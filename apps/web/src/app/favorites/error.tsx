"use client";
import { Button } from "@KLTN/ui/components/button";
export default function Error({reset}:{reset:()=>void}){return <main className="favorites-page" lang="vi"><h1>Yêu thích</h1><div className="favorite-state" role="alert"><p>Không thể tải danh sách yêu thích. Vui lòng thử lại.</p><Button className="favorite-action" variant="outline" onClick={reset}>Thử lại</Button></div></main>;}
