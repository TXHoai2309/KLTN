"use client";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { createIdempotencyKey, sendIdempotentMutation } from "@/lib/mutation-client";

type Job = { jobId: string; status: string; phase: string; attemptCount: number;
 failureCode: string | null; warningCodes: string[] | null; chunksPersisted: number;
 embeddingsPersisted: number; totalChunks: number | null; updatedAt: string;
 completedAt: string | null; recoveryRequired: boolean };
type Intent = { action: "INDEX" | "RESUME" | "RETRY"; jobId?: string };
const labels: Record<string,string> = { QUEUED:"Chờ bắt đầu", ACQUIRING:"Đọc tài liệu", EXTRACTING:"Trích xuất văn bản",
 CHUNKING:"Chia nội dung thành đoạn", PERSISTING_CHUNKS:"Lưu các đoạn", EMBEDDING:"Tạo embeddings",
 PERSISTING_EMBEDDINGS:"Lưu embeddings", VERIFYING:"Kiểm tra dữ liệu", PUBLISHING:"Công bố chỉ mục", COMPLETED:"Hoàn tất" };
const statuses: Record<string,string> = { QUEUED:"Chờ xử lý", RUNNING:"Đang xử lý", COMPLETED:"Thành công", FAILED:"Thất bại",
 REJECTED:"Bị từ chối", CANCELLED:"Đã hủy", TIMED_OUT:"Hết thời gian", UNKNOWN:"Chưa xác định" };
const steps = ["ACQUIRING","EXTRACTING","CHUNKING","EMBEDDING","PERSISTING_EMBEDDINGS","VERIFYING","COMPLETED"];
const retryable = new Set(["FAILED","TIMED_OUT","CANCELLED"]);
const terminal = new Set(["COMPLETED","FAILED","TIMED_OUT","CANCELLED","REJECTED","UNKNOWN"]);

export function RagIndexPanel({ documentId, status, onCompleted }: { documentId:string; status:string; onCompleted?:()=>void }) {
 const headingId = useId();
 const [job,setJob] = useState<Job|null>(null);
 const [loading,setLoading] = useState(true);
 const [running,setRunning] = useState(false);
 const [readError,setReadError] = useState("");
 const [mutationError,setMutationError] = useState("");
 const [uncertain,setUncertain] = useState(false);
 const [wake,setWake] = useState(0);
 const flight = useRef(false);
 const pending = useRef<{intent:Intent;key:string}|null>(null);
 const epoch = useRef(0);
 const mutationAbort = useRef<AbortController|null>(null);
 const callback = useRef(onCompleted); callback.current = onCompleted;
 const completed = useRef<string|null>(null);
 const endpoint = "/api/admin/rag-documents/" + encodeURIComponent(documentId) + "/index";
 useEffect(() => {
   ++epoch.current;
   setJob(null); setLoading(true); setRunning(false); setReadError(""); setMutationError(""); setUncertain(false);
   pending.current=null; flight.current=false; completed.current=null;
   return () => { epoch.current++; mutationAbort.current?.abort(); };
 },[endpoint]);
 useEffect(() => {
   const identity = epoch.current; const controller = new AbortController(); let timer:ReturnType<typeof setTimeout>;
   async function read() {
     let next = 2000;
     try {
       const res = await fetch(endpoint,{cache:"no-store",signal:controller.signal}); const body=await res.json();
       if(!res.ok || body.success!==true) throw new Error("READ_FAILED");
       if(controller.signal.aborted || epoch.current!==identity) return;
       const current=body.data.job as Job|null;
       setJob(old => old && current && old.jobId===current.jobId && old.updatedAt>current.updatedAt ? old : current);
       setReadError(""); setLoading(false);
       if(current?.status==="COMPLETED" && completed.current!==current.jobId) { completed.current=current.jobId; callback.current?.(); }
       if(current && terminal.has(current.status)) next=15000;
     } catch {
       if(controller.signal.aborted || epoch.current!==identity) return;
       setReadError("Không đọc được tiến độ. Đang thử đọc lại; đây chưa phải lỗi xử lý tài liệu."); setLoading(false); next=5000;
     }
     if(!controller.signal.aborted) timer=setTimeout(()=>void read(),next);
   }
   void read(); return ()=>{controller.abort();clearTimeout(timer);};
 },[endpoint,wake]);
 async function act(intent:Intent,replay=false) {
   if(flight.current || pending.current && !replay) return;
   const identity=epoch.current; flight.current=true; setRunning(true);setMutationError("");
   const operation=replay ? pending.current! : {intent,key:createIdempotencyKey()}; pending.current=operation;
   const mutationController=new AbortController(); mutationAbort.current=mutationController;
   const result=await sendIdempotentMutation(endpoint,{idempotencyKey:operation.key,init:{signal:mutationController.signal,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(operation.intent)}});
   if(epoch.current!==identity) return;
   flight.current=false;setRunning(false);
   if(result.status==="UNKNOWN") {setUncertain(true);setMutationError("Chưa xác định kết quả yêu cầu. Đọc tiến độ và đối soát bằng cùng yêu cầu; không tạo yêu cầu mới.");}
   else {pending.current=null;setUncertain(false);if(result.status==="FAILED")setMutationError(result.error.message);}
   setWake(v=>v+1);
 }
 const eligible=status==="APPROVED"||status==="INDEXED";
 const active=job && !terminal.has(job.status);
 const resume=job?.recoveryRequired;
 const retry=job && retryable.has(job.status);
 const disabled=!eligible||loading||running||uncertain||!!readError||job?.status==="UNKNOWN"||!!active&&!resume;
 const intent:Intent=resume&&job?{action:"RESUME",jobId:job.jobId}:retry&&job?{action:"RETRY",jobId:job.jobId}:{action:"INDEX"};
 const percent=job?.totalChunks && job.totalChunks>0 ? Math.min(100,Math.floor(job.embeddingsPersisted/job.totalChunks*100)):null;
 return <section className="destination-card rag-index-card" aria-labelledby={headingId} aria-busy={running}>
 <h2 id={headingId}>Lập chỉ mục AI</h2>
 <p className="destination-helper">Xử lý trong yêu cầu hiện tại. Khi mất kết nối, kiểm tra trạng thái trước khi tiếp tục.</p>
 <div className="rag-index-toolbar"><Button className="destination-primary" type="button" disabled={disabled} onClick={()=>void act(intent)}>
 {running&&<LoaderCircle className="destination-spinner" aria-hidden="true"/>}
 {running?"Đang xử lý…":resume?"Tiếp tục tác vụ":retry?"Thử lập chỉ mục lại":status==="INDEXED"?"Lập chỉ mục lại":"Lập chỉ mục"}</Button>
 {uncertain&&<Button type="button" disabled={running} onClick={()=>void act(pending.current!.intent,true)}>Đối soát cùng yêu cầu</Button>}
 <Button type="button" onClick={()=>setWake(v=>v+1)}>Đọc lại trạng thái</Button>
 <span role="status">{loading?"Đang tải trạng thái…":job?statuses[job.status]:"Chưa có lần lập chỉ mục nào."}</span></div>
 {job&&<div className="rag-index-progress" aria-live="polite">
 <p>Giai đoạn: {labels[job.phase]??"Chưa xác định"}. Lần thực thi: {job.attemptCount}.</p>
 <ol className="rag-index-steps">{steps.map(step=><li key={step} aria-current={job.phase===step?"step":undefined}>
 {labels[step]} — {job.status==="COMPLETED"?"Đã hoàn tất":job.phase===step?(active?"Đang xử lý":"Đã dừng tại đây"):"Chưa xác nhận hoàn tất"}</li>)}</ol>
 <p>Đã lưu {job.chunksPersisted} đoạn; {job.embeddingsPersisted}/{job.totalChunks??"chưa xác định"} embeddings.</p>
 {percent!==null?<><progress value={job.embeddingsPersisted} max={job.totalChunks!} aria-label="Embeddings đã lưu"/><span>{percent}% embeddings đã lưu; không phải phần trăm hoàn tất toàn bộ tác vụ.</span></>:<progress aria-label="Đang chuẩn bị dữ liệu, chưa xác định tổng"/>}
 {job.failureCode&&<p role="alert">Mã lỗi xử lý: {job.failureCode}</p>}
 {job.warningCodes?.length ? <p>Lưu ý trích xuất: {job.warningCodes.join(", ")}</p>:null}
 {resume&&<p>Yêu cầu trước có thể đã dừng. Tiếp tục chỉ kiểm tra tác vụ này; batch chưa xác định sẽ chuyển sang đối soát.</p>}
 {job.status==="UNKNOWN"&&<p role="alert">Kết quả nhà cung cấp hoặc database chưa xác định. Không tự thử lại embeddings. Quản trị viên cần đối soát trước khi cho phép yêu cầu có thể phát sinh phí.</p>}
 {job.status==="COMPLETED"&&<p>Đã công bố chỉ mục thành công. Trạng thái tài liệu đang được cập nhật từ server.</p>}
 </div>}
 {readError&&<p className="rag-index-error" role="alert">{readError}</p>}
 {mutationError&&<p className="rag-index-error" role="alert">{mutationError}</p>}
 </section>;
}
