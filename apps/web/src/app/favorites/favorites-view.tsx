"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@KLTN/ui/components/button";
import { Card } from "@KLTN/ui/components/card";
import { Empty } from "@KLTN/ui/components/empty";
import { Skeleton } from "@KLTN/ui/components/skeleton";
import { createIdempotencyKey } from "@/lib/mutation-client";
import type { MutationOutcome } from "@/lib/mutation-contract";
import { loadFavorites, removeFavoriteRequest, confirmedRemoval } from "@/modules/favorite/favorite-client";
import type { FavoriteItem, FavoriteList } from "@/modules/favorite/favorite-contract";

type Group = keyof FavoriteList;
type Removed = (id: string, outcome: MutationOutcome<{favoriteId:string}>) => void;
const groups = [{id:"destinations",label:"Điểm đến"},{id:"cultureContents",label:"Nội dung văn hóa"}] as const;

export function FavoriteCard({item,group,onRemoved}: {item:FavoriteItem;group:Group;onRemoved:Removed}) {
  const [pending,setPending] = useState(false);
  const [feedback,setFeedback] = useState<string | null>(null);
  const inFlight = useRef(false);
  const key = useRef<string | null>(null);
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setFeedback(null);
    try {
      key.current ??= createIdempotencyKey();
      const outcome = await removeFavoriteRequest(item.favoriteId,key.current);
      if (outcome.status === "SUCCESS") { onRemoved(item.favoriteId,outcome); return; }
      // Retain key even for FAILED. UNKNOWN always retries this identical ID/key.
      setFeedback(outcome.status === "UNKNOWN" ? "Chưa thể xác nhận đã bỏ yêu thích. Thử lại để xác nhận thao tác." : "Không thể bỏ yêu thích. Vui lòng thử lại.");
    } catch { setFeedback("Chưa thể xác nhận đã bỏ yêu thích. Vui lòng thử lại."); }
    finally { inFlight.current=false; setPending(false); }
  }
  return <Card className="favorite-card">
    <h3>{item.title}</h3>
    <p>{item.availability === "UNAVAILABLE" ? "Không còn khả dụng" : `${group === "destinations" ? "Điểm đến" : "Nội dung văn hóa"} đã yêu thích. Mở để xem đối tượng gốc.`}</p>
    <div className="favorite-accent" aria-hidden="true" />
    <div className="favorite-actions">
      {item.href && item.availability === "AVAILABLE" && <Link className="favorite-action" href={item.href as Route} aria-label={`Mở chi tiết ${item.title}`}>Mở chi tiết</Link>}
      <Button variant="outline" className="favorite-action" disabled={pending} onClick={()=>void remove()} aria-label={`${feedback ? "Thử lại bỏ" : "Bỏ"} yêu thích ${item.title}`}>
        {pending ? "Đang bỏ..." : feedback ? "Thử lại bỏ yêu thích" : "Bỏ yêu thích"}
      </Button>
    </div>
    {feedback && <p role="alert" className="favorite-feedback">{feedback}</p>}
    {pending && <span className="sr-only" role="status">Đang bỏ yêu thích {item.title}</span>}
  </Card>;
}
export function FavoriteContent({state,group,items,retry,onRemoved}: {state:"loading"|"error"|"ready";group:Group;items:FavoriteItem[];retry:()=>void;onRemoved:Removed}) {
  if (state === "loading") return <div role="status" aria-busy="true"><span className="sr-only">Đang tải danh sách yêu thích</span><div className="favorite-grid">{[0,1,2].map(i=><Card className="favorite-card favorite-skeleton" key={i}><Skeleton className="h-7 w-2/3"/><Skeleton className="h-5 w-full"/><Skeleton className="h-9 w-full"/><Skeleton className="h-11 w-3/4"/></Card>)}</div></div>;
  if (state === "error") return <Empty className="favorite-state" role="alert"><p>Không thể tải danh sách yêu thích. Vui lòng thử lại.</p><Button className="favorite-action" variant="outline" onClick={retry}>Thử lại</Button></Empty>;
  if (!items.length) return <Empty className="favorite-state" role="status"><p>{group === "destinations" ? "Bạn chưa có điểm đến yêu thích." : "Bạn chưa có nội dung văn hóa yêu thích."}</p><Link className="favorite-action" href="/explore">Khám phá nội dung</Link></Empty>;
  return <ul className="favorite-grid">{items.map(item=><li key={item.favoriteId}><FavoriteCard item={item} group={group} onRemoved={onRemoved}/></li>)}</ul>;
}

export default function FavoritesView({loadingOnly=false}: {loadingOnly?:boolean}) {
  const [group,setGroup] = useState<Group>("destinations");
  const [data,setData] = useState<FavoriteList>({destinations:[],cultureContents:[]});
  const [state,setState] = useState<"loading"|"error"|"ready">("loading");
  const [attempt,setAttempt] = useState(0);
  const [notice,setNotice] = useState("");
  useEffect(()=>{
    if (loadingOnly) return;
    const controller=new AbortController(); setState("loading");
    loadFavorites(controller.signal).then(result=>{if(!controller.signal.aborted){setData(result);setState("ready");}},()=>{if(!controller.signal.aborted)setState("error");});
    return ()=>controller.abort();
  },[attempt,loadingOnly]);
  const removed:Removed=(id,outcome)=>{
    setData(current=>({destinations:confirmedRemoval(current.destinations,id,outcome),cultureContents:confirmedRemoval(current.cultureContents,id,outcome)}));
    if(outcome.status === "SUCCESS") setNotice("Đã bỏ yêu thích.");
  };
  return <main className="favorites-page" lang="vi">
    <h1>Yêu thích</h1>
    <div className="favorite-groups" role="group" aria-label="Nhóm yêu thích">{groups.map(tab=><Button key={tab.id} variant="outline" className="favorite-pill" aria-pressed={group===tab.id} aria-controls={`favorite-${tab.id}`} onClick={()=>{setGroup(tab.id);setNotice("");}}>{tab.label}</Button>)}</div>
    {/* Keep both groups mounted so a pending/UNKNOWN mutation retains its key when switching. */}
    {groups.map(tab=><section key={tab.id} id={`favorite-${tab.id}`} hidden={group!==tab.id} aria-labelledby={`favorite-title-${tab.id}`}><h2 className="sr-only" id={`favorite-title-${tab.id}`}>{tab.label}</h2><FavoriteContent state={state} group={tab.id} items={data[tab.id]} retry={()=>setAttempt(x=>x+1)} onRemoved={removed}/></section>)}
    <p role="status" className="sr-only">{notice}</p>
  </main>;
}
