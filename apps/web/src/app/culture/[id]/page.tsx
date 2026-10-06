import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { db } from "@/services";
import { AppError } from "@/server/http/app-error";
import { readPublicCultureDetail } from "@/modules/culture/public-culture-detail";

export default async function CulturePage({params}:{params:Promise<{id:string}>}) {
  await connection();
  const {id}=await params;
  const data=await readPublicCultureDetail(id,db).catch((error:unknown)=>{if(error instanceof AppError && error.status===404) notFound();throw error;});
  return <main className="mx-auto w-full max-w-3xl min-w-0 space-y-6 p-4 sm:p-8" lang="vi">
    <nav aria-label="Điều hướng nội dung"><Link className="underline" href="/favorites">Yêu thích</Link><span aria-hidden="true"> · </span><Link className="underline" href="/explore">Khám phá</Link></nav>
    <h1 className="break-words text-3xl font-semibold">{data.title}</h1>
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">{data.content}</p>
    {(data.sourceTitle||data.sourceUrl)&&<p className="[overflow-wrap:anywhere]">Nguồn: {data.sourceUrl?<a className="underline" href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{data.sourceTitle||"Xem nguồn tham khảo"}</a>:data.sourceTitle}</p>}
  </main>;
}
