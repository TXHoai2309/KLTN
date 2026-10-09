import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../../culture/page-access";
import RagUploadForm from "./rag-upload-form";
import "./rag-upload.css";

export default async function Page() {
  if (!await culturePageAccess("/admin/rag/upload")) return <AccessDenied />;
  return <RagUploadForm />;
}
