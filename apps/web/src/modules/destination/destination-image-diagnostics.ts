import {createHash, randomUUID} from "node:crypto";
import {AppError} from "@/server/http/app-error";

export type ImageUploadPhase = "AUTHORIZATION" | "PROVIDER_CONFIGURATION" | "READ_BODY" | "INTENT_VALIDATION" | "IDEMPOTENCY_REPLAY" | "ATTEMPT_ADMISSION" | "INSPECT_BYTES" | "FIND_BEFORE_UPLOAD" | "UPLOAD" | "FIND_AFTER_UPLOAD" | "VERIFY_ASSET" | "FINALIZE";
const networkCodes=new Set(["ETIMEDOUT","ECONNRESET","ECONNREFUSED","ECONNABORTED","ENOTFOUND","EAI_AGAIN","EPIPE","UND_ERR_CONNECT_TIMEOUT","ERR_TLS_CERT_ALTNAME_INVALID","UNABLE_TO_VERIFY_LEAF_SIGNATURE","CERT_HAS_EXPIRED"]);
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"?value as Record<string,unknown>:{};}
function httpStatus(value:unknown){return typeof value==="number"&&Number.isInteger(value)&&value>=100&&value<=599?value:null;}

/** Allowlisted metadata only. Never retain SDK messages, options, URLs or causes. */
export type CloudinaryErrorMetadata={cloudinaryHttpStatus:number|null;cloudinaryErrorCode:number|null;networkCode:string|null;errorType:string;category:string};
export function cloudinaryErrorMetadata(error:unknown):CloudinaryErrorMetadata{
 if(error instanceof CloudinaryProviderError)return error.providerMetadata;
 const outer=object(error), inner=outer.error&&typeof outer.error==="object"?object(outer.error):outer;
 const status=httpStatus(inner.http_code)??httpStatus(outer.http_code);
 const code=inner.code??outer.code;
 const networkCode=typeof code==="string"&&networkCodes.has(code)?code:null;
 const numericCode=inner.error_code??inner.code;
 return {cloudinaryHttpStatus:status,cloudinaryErrorCode:typeof numericCode==="number"&&Number.isSafeInteger(numericCode)&&numericCode>=0&&numericCode<1000000?numericCode:null,networkCode,
  errorType:error instanceof Error?"Error":error&&typeof error==="object"?"Object":"Unknown",
  category:status===404?"NOT_FOUND":status===401?"AUTHENTICATION":status===403?"AUTHORIZATION":status===429?"RATE_LIMIT":status!==null&&status>=500?"PROVIDER_SERVER":status!==null&&status>=400?"PROVIDER_CLIENT":networkCode?.includes("TIME")?"NETWORK_TIMEOUT":networkCode?"NETWORK":"UNKNOWN"};
}
export class CloudinaryProviderError extends AppError {
 readonly providerMetadata:CloudinaryErrorMetadata;
 constructor(error:unknown){
  super("IMAGE_PROVIDER_UNAVAILABLE","Dịch vụ ảnh chưa sẵn sàng. Giữ ảnh và thử lại.",503);
  this.providerMetadata=cloudinaryErrorMetadata(error);
 }
}
const reference=(value:string)=>createHash("sha256").update(value).digest("hex").slice(0,12);
export function createImageUploadDiagnostics(){
 const correlationId=randomUUID();let phase:ImageUploadPhase="AUTHORIZATION";let context:Record<string,string>={};
 const emit=(outcome:string,httpStatus:number|null,error?:unknown)=>{
  const metadata=cloudinaryErrorMetadata(error);
  const appCode=error instanceof AppError?error.code:null;
  const event={event:"destination_image_upload",correlationId,...context,phase,outcome,httpStatus,...metadata,appCode};
  if(outcome==="FAILED"||outcome==="RECOVERING")console.warn(JSON.stringify(event));else console.info(JSON.stringify(event));
 };
 return {correlationId,setPhase(value:ImageUploadPhase){phase=value;},setContext(destinationId:string,key:string){context={destinationRef:reference(destinationId),intentRef:reference(key)};},
  providerAbsent(error:unknown){emit("ASSET_ABSENT",null,error);},recovering(error:unknown){emit("RECOVERING",null,error);},
  failure(error:unknown,status:number){emit("FAILED",status,error);},
  complete(status:number,outcome:string,appCode?:string){emit(outcome==="SUCCESS"?"SUCCESS":"FAILED",status,appCode?new AppError(appCode,"Upload outcome",status):undefined);},
 };
}
export type ImageUploadDiagnostics=ReturnType<typeof createImageUploadDiagnostics>;
