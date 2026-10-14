import { describe, expect, it, vi } from "vitest";
import { AssistantHttpTransport } from "./assistant-http-transport";
import type { AssistantAttempt } from "./assistant-controller";
const attempt: AssistantAttempt = { id: "key", key: "key", generation: 1, identity: "guest", payload: {question:"Q",context:{type:"GENERAL"}},body:'{"question":"Q","context":{"type":"GENERAL"}}' };
describe("real HTTP assistant transport",()=>{
  it("preserves exact same-key/body retry and sends no client history/identity",async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>Response.json({success:false}));const t=new AssistantHttpTransport(fetcher);const signal=new AbortController().signal;
    await t.send(attempt,signal);await t.send(attempt,signal);
    expect(fetcher.mock.calls[0]?.[1]?.body).toEqual(fetcher.mock.calls[1]?.[1]?.body);
    expect(fetcher).toHaveBeenCalledWith("/api/ai/ask",expect.objectContaining({body:attempt.body,headers:{"Content-Type":"application/json","Idempotency-Key":"key"},credentials:"same-origin"}));
  });
  it.each(["fetch", "body"])("bounds stalled %s and keeps immutable retry payload",async stage=>{
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(async () => stage === "fetch" ? new Promise<Response>(() => {}) : new Response(new ReadableStream({start(){}})));
      const transport = new AssistantHttpTransport(fetcher, 100);
      const pending = transport.send(attempt,new AbortController().signal);
      await vi.advanceTimersByTimeAsync(101);
      expect(await pending).toEqual({kind:"networkAmbiguity"});
      expect(fetcher.mock.calls[0]?.[1]?.body).toBe(attempt.body);
      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("does not fetch after caller cancellation",async()=>{
    const controller=new AbortController();controller.abort();const fetcher=vi.fn<typeof fetch>();
    expect(await new AssistantHttpTransport(fetcher).send(attempt,controller.signal)).toEqual({kind:"networkAmbiguity"});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["network","malformed","oversized"])("%s preserves ambiguity without demo fallback",async mode=>{
    const t=new AssistantHttpTransport(async()=>{if(mode==="network")throw new Error();return new Response(mode==="malformed"?"bad":"x".repeat(128*1024+1));});
    expect(await t.send(attempt,new AbortController().signal)).toEqual({kind:"networkAmbiguity"});
  });
});
