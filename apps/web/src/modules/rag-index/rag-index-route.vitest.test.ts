import { beforeEach,describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
const deps=vi.hoisted(()=>({process:vi.fn(),read:vi.fn()}));
vi.mock("@/services",()=>({db:{}}));
vi.mock("@/server/authorization/server",()=>({authorizationDependencies:{}}));
vi.mock("./rag-index-request-service",async importOriginal=>({...await importOriginal<typeof import("./rag-index-request-service")>(),processIndexRequest:deps.process,readIndexProgress:deps.read}));
import {GET,POST} from "@/app/api/admin/rag-documents/[id]/index/route";
const context={params:Promise.resolve({id:"doc-1"})};
const request=(headers:Record<string,string>={},body="{}")=>new Request("http://localhost/api/admin/rag-documents/doc-1/index",{method:"POST",headers:{Origin:"http://localhost","Content-Type":"application/json","Idempotency-Key":"synthetic-key",...headers},body});
beforeEach(()=>{deps.process.mockReset();deps.read.mockReset();});
describe("Admin index route HTTP boundary",()=>{
 it("returns mutation contract, replay header and no-store",async()=>{deps.process.mockResolvedValue({status:"SUCCESS",replayed:true,data:{jobId:"job-1"}});const res=await POST(request(),context);expect(await res.json()).toMatchObject({operationStatus:"SUCCESS",data:{jobId:"job-1"}});expect(res.headers.get("Cache-Control")).toContain("no-store");expect(res.headers.get("Idempotency-Replayed")).toBe("true");});
 it.each<Record<string,string>>([{Origin:"http://evil.invalid"},{"Content-Type":"text/plain"},{"Idempotency-Key":""}])("rejects invalid headers %j",async headers=>{const res=await POST(request(headers),context);expect(res.status).toBeGreaterThanOrEqual(400);expect(deps.process).not.toHaveBeenCalled();expect(res.headers.get("Cache-Control")).toContain("no-store");});
 it("rejects unknown body metadata",async()=>{const res=await POST(request({},JSON.stringify({storagePath:"private"})),context);expect(res.status).toBe(400);expect(deps.process).not.toHaveBeenCalled();});
 it("read uses private no-store and returns persisted progress",async()=>{deps.read.mockResolvedValue({job:null});const res=await GET(new Request("http://localhost/api/admin/rag-documents/doc-1/index"),context);expect(await res.json()).toEqual({success:true,data:{job:null}});expect(res.headers.get("Cache-Control")).toContain("no-store");});
});
