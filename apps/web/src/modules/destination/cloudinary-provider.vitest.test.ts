import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("server-only",()=>({}));
import {v2 as cloudinary,type UploadResponseCallback} from "cloudinary";
import {destinationImageProvider} from "./cloudinary-provider";
import type {ImageIntent} from "./destination-media-contract";
import {PassThrough} from "node:stream";
import {CloudinaryProviderError,cloudinaryErrorMetadata,createImageUploadDiagnostics} from "./destination-image-diagnostics";

const intent:ImageIntent={name:"fixture.png",size:100,mime:"image/png",sha256:"a".repeat(64),actorId:"fixture-admin",destinationId:"fixture-destination",intentKey:"fixture-key",cloud:"fixturecloud",mode:"dynamic",folder:"KLTN/destinations/fixture-destination",publicId:"kltn-fixture",expiresAt:Date.now()+60000};
beforeEach(()=>{vi.stubEnv("CLOUDINARY_CLOUD_NAME","fixturecloud");vi.stubEnv("CLOUDINARY_API_KEY","fixture-key");vi.stubEnv("CLOUDINARY_API_SECRET","fixture-secret");vi.stubEnv("CLOUDINARY_DESTINATION_FOLDER","KLTN/destinations");});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe("Cloudinary SDK Admin resource errors",()=>{
 it("treats the actual nested Admin SDK 404 rejection as an absent asset",async()=>{
  vi.spyOn(cloudinary.api,"resource").mockRejectedValue({error:{message:"Resource not found",http_code:404},request_options:{headers:{Authorization:"fixture-sensitive"}},query_params:"fixture-sensitive"});
  await expect(destinationImageProvider().find(intent)).resolves.toBeNull();
 });
 it("retains support for a flat SDK 404",async()=>{
  vi.spyOn(cloudinary.api,"resource").mockRejectedValue({http_code:404,message:"Resource not found"});
  await expect(destinationImageProvider().find(intent)).resolves.toBeNull();
 });
 it.each([401,403,429,500])("keeps nested %i as failure, never as an absent asset",async status=>{
  vi.spyOn(cloudinary.api,"resource").mockRejectedValue({error:{http_code:status,message:"fixture-private-message"},request_options:{auth:"fixture-private-auth"}});
  try{await destinationImageProvider().find(intent);throw Error("Expected failure");}
  catch(error){expect(error).toBeInstanceOf(CloudinaryProviderError);expect(error).toMatchObject({status:503,providerMetadata:{cloudinaryHttpStatus:status}});expect(JSON.stringify(error)).not.toContain("fixture-private");}
 });
 it("preserves network classification without retaining a raw error",async()=>{
  vi.spyOn(cloudinary.api,"resource").mockRejectedValue(Object.assign(new Error("fixture-private-network-url"),{code:"ETIMEDOUT"}));
  await expect(destinationImageProvider().find(intent)).rejects.toMatchObject({providerMetadata:{category:"NETWORK_TIMEOUT",networkCode:"ETIMEDOUT",cloudinaryHttpStatus:null}});
 });
 it("preserves upload callback error metadata",async()=>{
  vi.spyOn(cloudinary.uploader,"upload_stream").mockImplementation((...args:unknown[])=>{
   const callback=args[1] as UploadResponseCallback|undefined;
   const stream=new PassThrough();queueMicrotask(()=>callback?.(Object.assign(new Error("fixture-private-upload"),{http_code:429})));return stream as ReturnType<typeof cloudinary.uploader.upload_stream>;
  });
  await expect(destinationImageProvider().upload(intent,Buffer.from("fixture"))).rejects.toMatchObject({providerMetadata:{category:"RATE_LIMIT",cloudinaryHttpStatus:429}});
 });
 it("returns authenticated upload metadata for verification without an extra resource request",async()=>{
  const asset={asset_id:"fixture-asset",public_id:intent.publicId,format:"png"};
  const resource=vi.spyOn(cloudinary.api,"resource");
  vi.spyOn(cloudinary.uploader,"upload_stream").mockImplementation((...args:unknown[])=>{
   const callback=args[1] as UploadResponseCallback|undefined;
   const stream=new PassThrough();queueMicrotask(()=>callback?.(undefined,asset as any));
   return stream as ReturnType<typeof cloudinary.uploader.upload_stream>;
  });
  await expect(destinationImageProvider().upload(intent,Buffer.from("fixture"))).resolves.toEqual(asset);
  expect(resource).not.toHaveBeenCalled();
 });
 it("preserves upload stream network error metadata",async()=>{
  vi.spyOn(cloudinary.uploader,"upload_stream").mockImplementation(()=>{
   const stream=new PassThrough();queueMicrotask(()=>stream.emit("error",Object.assign(new Error("fixture-private"),{code:"ECONNRESET"})));return stream as ReturnType<typeof cloudinary.uploader.upload_stream>;
  });
  await expect(destinationImageProvider().upload(intent,Buffer.from("fixture"))).rejects.toMatchObject({providerMetadata:{networkCode:"ECONNRESET",category:"NETWORK"}});
 });
 it("logs only allowlisted metadata with generated correlation and hashed references",()=>{
  const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});const diagnostics=createImageUploadDiagnostics();
  diagnostics.setContext("fixture-private-destination","fixture-private-idempotency-key");diagnostics.setPhase("FIND_BEFORE_UPLOAD");
  diagnostics.failure(new CloudinaryProviderError({error:{http_code:403,code:123,message:"fixture-private-message"},request_options:{headers:{Authorization:"fixture-private-secret"}}}),503);
  const serialized=String(warn.mock.calls[0]?.[0]);expect(serialized).not.toContain("fixture-private");
  expect(JSON.parse(serialized)).toMatchObject({phase:"FIND_BEFORE_UPLOAD",httpStatus:503,cloudinaryHttpStatus:403,cloudinaryErrorCode:123,category:"AUTHORIZATION",correlationId:diagnostics.correlationId});
  expect(diagnostics.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(cloudinaryErrorMetadata({error:{code:"fixture-private-secret",http_code:400}}).cloudinaryErrorCode).toBeNull();
 });
 it("reports expected missing asset and finalization UNKNOWN under the same correlation",()=>{
  const info=vi.spyOn(console,"info").mockImplementation(()=>{});const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
  const d=createImageUploadDiagnostics();d.setPhase("FIND_BEFORE_UPLOAD");d.providerAbsent({error:{http_code:404}});d.setPhase("FINALIZE");d.complete(503,"UNKNOWN","OPERATION_STATUS_UNKNOWN");
  expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({correlationId:d.correlationId,outcome:"ASSET_ABSENT",cloudinaryHttpStatus:404});
  expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({correlationId:d.correlationId,phase:"FINALIZE",outcome:"FAILED",httpStatus:503,appCode:"OPERATION_STATUS_UNKNOWN"});
 });
});
