import AccessDenied from "@/components/access-denied";
import { culturePageAccess } from "../culture/page-access";
import { RagList } from "./rag-review-ui";
import "./rag-review.css";

export default async function Page() {
  if (!await culturePageAccess("/admin/rag")) return <AccessDenied />;
  return <RagList />;
}
