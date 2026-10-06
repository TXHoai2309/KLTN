import React from "react";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadFavorites, removeFavoriteRequest, confirmedRemoval } from "./favorite-client";
import { FavoriteContent, FavoriteCard } from "../../app/favorites/favorites-view";
import type { FavoriteItem } from "./favorite-contract";

const originalReact = (globalThis as {React?:typeof React}).React;
before(() => { (globalThis as {React?:typeof React}).React=React; });
after(() => { (globalThis as {React?:typeof React}).React=originalReact; });
const item: FavoriteItem={favoriteId:"f",targetId:"d",title:"<Title>",availability:"AVAILABLE",href:"/destinations/d"};
test("list client distinguishes valid empty from technical failure, abort signal passed",async()=>{
  const original=globalThis.fetch;
  try {
    const signal=new AbortController().signal;
    globalThis.fetch=async (url,init)=>{assert.equal(url,"/api/favorites");assert.equal(init?.signal,signal);return Response.json({success:true,data:{destinations:[],cultureContents:[]}});};
    assert.deepEqual(await loadFavorites(signal),{destinations:[],cultureContents:[]});
    globalThis.fetch=async()=>Response.json({success:false},{status:500}); await assert.rejects(loadFavorites(signal));
  } finally {globalThis.fetch=original;}
});
test("confirmed SUCCESS removes card; FAILED/UNKNOWN retain; UNKNOWN retries identical key and ID",async()=>{
  const original=globalThis.fetch; const keys:string[]=[];const paths:string[]=[];
  try {
    globalThis.fetch=async(url,init)=>{ keys.push(new Headers(init?.headers).get("Idempotency-Key")!); paths.push(String(url));assert.equal(init?.method,"DELETE");assert.equal(init?.body,undefined);throw new Error("lost response");};
    const unknown=await removeFavoriteRequest("f","same-key");assert.equal(unknown.status,"UNKNOWN");assert.deepEqual(confirmedRemoval([item],"f",unknown),[item]);
    await removeFavoriteRequest("f","same-key");assert.deepEqual(keys,["same-key","same-key"]);assert.deepEqual(paths,["/api/favorites/f","/api/favorites/f"]);
    globalThis.fetch=async()=>Response.json({success:false,operationStatus:"FAILED",error:{code:"NOT_FOUND",message:"Missing"}},{status:404});
    const failed=await removeFavoriteRequest("f","same-key");assert.deepEqual(confirmedRemoval([item],"f",failed),[item]);
    globalThis.fetch=async()=>Response.json({success:true,operationStatus:"SUCCESS",data:{favoriteId:"f"}});
    assert.deepEqual(confirmedRemoval([item],"f",await removeFavoriteRequest("f","same-key")),[]);
    globalThis.fetch=async()=>Response.json({success:true,operationStatus:"SUCCESS",data:{favoriteId:"other"}});
    assert.equal((await removeFavoriteRequest("f","same-key")).status,"UNKNOWN");
  }finally{globalThis.fetch=original;}
});
test("rendered empty groups/loading/error are distinct; hidden has removal and no open link",()=>{
  const render=(state:"loading"|"error"|"ready",group:"destinations"|"cultureContents")=>renderToStaticMarkup(<FavoriteContent state={state} group={group} items={[]} retry={()=>{}} onRemoved={()=>{}}/>);
  assert.match(render("ready","destinations"),/Bạn chưa có điểm đến yêu thích/);
  assert.match(render("ready","cultureContents"),/Bạn chưa có nội dung văn hóa yêu thích/);
  assert.match(render("loading","destinations"),/Đang tải danh sách yêu thích/);assert.doesNotMatch(render("loading","destinations"),/Không thể tải/);
  assert.match(render("error","destinations"),/Không thể tải danh sách yêu thích/);assert.match(render("error","destinations"),/Thử lại/);assert.doesNotMatch(render("error","destinations"),/Bạn chưa có/);
  const hidden=renderToStaticMarkup(<FavoriteCard item={{...item,availability:"UNAVAILABLE",href:null}} group="destinations" onRemoved={()=>{}}/>);
  assert.match(hidden,/Không còn khả dụng/);assert.match(hidden,/Bỏ yêu thích/);assert.doesNotMatch(hidden,/href=/);
  const available=renderToStaticMarkup(<FavoriteCard item={item} group="destinations" onRemoved={()=>{}}/>);
  assert.match(available,/href="\/destinations\/d"/);assert.match(available,/&lt;Title&gt;/);
});
