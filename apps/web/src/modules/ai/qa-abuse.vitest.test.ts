import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { createQaAbuseGuard, createQaNetworkResolver } from "./qa-abuse";
import type { Database } from "@KLTN/db";

describe("QA trusted network admission boundary",()=>{
  const secret=()=>"offline-test-secret-32-characters-long";
  it("fails closed when no server secret/network adapter exists",()=>{
    expect(()=>createQaNetworkResolver({secret:()=>undefined,vercel:()=>true})(new Headers({"x-vercel-forwarded-for":"192.0.2.1"}))).toThrow();
    expect(()=>createQaNetworkResolver({secret,vercel:()=>false})(new Headers({"x-forwarded-for":"192.0.2.1","x-vercel-forwarded-for":"192.0.2.1"}))).toThrow();
  });
  it.each(["", "192.0.2.1, 192.0.2.2", "client-controlled", "[2001:db8::1]"])("rejects ambiguous ingress %s",value=>{
    expect(()=>createQaNetworkResolver({secret,vercel:()=>true})(new Headers({"x-vercel-forwarded-for":value}))).toThrow();
  });
  it("hashes trusted ingress only; ignores spoofed generic forwarding headers",()=>{
    const resolve=createQaNetworkResolver({secret,vercel:()=>true});
    const a=resolve(new Headers({"x-vercel-forwarded-for":"192.0.2.1","x-forwarded-for":"attacker"}));
    expect(a).toMatch(/^[a-f0-9]{64}$/);expect(a).not.toContain("192.0.2");
    expect(resolve(new Headers({"x-vercel-forwarded-for":"192.0.2.1"}))).toBe(a);
    expect(resolve(new Headers({"x-vercel-forwarded-for":"192.0.2.2"}))).not.toBe(a);
  });
  it("canonicalizes equivalent IPv6 and rotating /64 privacy addresses",()=>{
    const resolve=createQaNetworkResolver({secret,vercel:()=>true});
    const digest=(ip:string)=>resolve(new Headers({"x-vercel-forwarded-for":ip}));
    expect(digest("2001:db8::1")).toBe(digest("2001:0db8:0:0:0:0:0:ffff"));
    expect(digest("2001:db8::1")).not.toBe(digest("2001:db8:0:1::1"));
  });
  it("local harness identity comes from explicit server injection only",()=>{
    const resolve=createQaNetworkResolver({secret,vercel:()=>false,localIdentity:()=>"local-harness"});
    expect(resolve(new Headers({"x-forwarded-for":"192.0.2.1"}))).toBe(resolve(new Headers({"x-forwarded-for":"192.0.2.2"})));
  });
  it("rejects missing network before DB/provider admission",async()=>{
    const db={$transaction:vi.fn()} as unknown as Database;
    const tx={$queryRaw:vi.fn()} as never;
    await expect(createQaAbuseGuard(db).hooks.admit(tx,{kind:"GUEST",id:"guest"},"turn",1,new Date())).rejects.toMatchObject({code:"AI_UNAVAILABLE"});
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects unbounded/fractional deployment budgets",()=>{
    const db={} as Database;
    expect(()=>createQaAbuseGuard(db,{tokensPerAttempt:32_999})).toThrow();
    expect(()=>createQaAbuseGuard(db,{concurrentGlobal:0})).toThrow();
    expect(()=>createQaAbuseGuard(db,{askGlobalDay:Infinity})).toThrow();
    expect(()=>createQaAbuseGuard(db,{askGlobalDay:1.5})).toThrow();
  });
});
